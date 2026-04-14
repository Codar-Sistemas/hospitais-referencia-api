"""
Sync: baixa PDFs dos estados do gov.br, detecta mudanças e atualiza o banco.

Fluxo para cada UF:
  1. Busca a página do estado no gov.br.
  2. Lê a data "Atualizado em DD/MM/YYYY HHhMM" e a URL do PDF.
  3. Compara com o registro em `estados`:
        - Se `atualizado_em` do site é mais recente OU
        - Se o SHA256 do PDF mudou
     → processa. Senão, pula.
  4. Baixa o PDF, parseia com scripts.parser, e faz upsert em `hospitais`.
  5. Atualiza o registro do estado com nova data, hash e total.

Uso:
  python -m scripts.sync             # sincroniza todos os estados
  python -m scripts.sync SP          # só SP
  python -m scripts.sync --force SP  # força re-sync mesmo sem mudança

Variáveis de ambiente necessárias:
  SUPABASE_URL          URL do projeto Supabase
  SUPABASE_SERVICE_KEY  service_role key (NÃO use anon key aqui)
"""
from __future__ import annotations

import argparse
import hashlib
import os
import re
import sys
import tempfile
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from scripts.parser import parse_pdf
from scripts.geocode import Geocoder

USER_AGENT = "hospitais-referencia-api-sync/1.0 (+https://github.com/Codar-Sistemas/hospitais-referencia-api)"
REQUEST_TIMEOUT = 30

# Regex da data exibida na página: "Atualizado em 10/02/2026 18h04"
RE_ATUALIZADO = re.compile(
    r"Atualizado\s+em\s+(\d{2})/(\d{2})/(\d{4})\s+(\d{1,2})h(\d{2})",
    re.IGNORECASE,
)


# ---------------------------------------------------------------------------
# Supabase REST helpers (sem dependência do client oficial — mais leve)
# ---------------------------------------------------------------------------
class Supabase:
    def __init__(self, url: str, key: str):
        self.url = url.rstrip("/")
        self.headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }

    def _req(self, method: str, path: str, **kw):
        r = requests.request(method, f"{self.url}/rest/v1/{path}",
                             headers=self.headers, timeout=REQUEST_TIMEOUT, **kw)
        if not r.ok:
            raise RuntimeError(f"Supabase {method} {path} failed: {r.status_code} {r.text}")
        return r.json() if r.text else None

    def select(self, table: str, **params):
        return self._req("GET", table, params=params)

    def upsert(self, table: str, rows: list[dict], on_conflict: str):
        headers = {**self.headers, "Prefer": "resolution=merge-duplicates,return=minimal"}
        r = requests.post(f"{self.url}/rest/v1/{table}",
                          headers=headers,
                          params={"on_conflict": on_conflict},
                          json=rows, timeout=REQUEST_TIMEOUT)
        if not r.ok:
            raise RuntimeError(f"Upsert {table} failed: {r.status_code} {r.text}")

    def delete(self, table: str, **params):
        headers = {**self.headers, "Prefer": "return=minimal"}
        r = requests.delete(f"{self.url}/rest/v1/{table}",
                            headers=headers, params=params, timeout=REQUEST_TIMEOUT)
        if not r.ok:
            raise RuntimeError(f"Delete {table} failed: {r.status_code} {r.text}")

    def update(self, table: str, match: dict, values: dict):
        headers = {**self.headers, "Prefer": "return=minimal"}
        params = {k: f"eq.{v}" for k, v in match.items()}
        r = requests.patch(f"{self.url}/rest/v1/{table}",
                           headers=headers, params=params,
                           json=values, timeout=REQUEST_TIMEOUT)
        if not r.ok:
            raise RuntimeError(f"Update {table} failed: {r.status_code} {r.text}")


# ---------------------------------------------------------------------------
# Scraper da página-fonte
# ---------------------------------------------------------------------------
def fetch_page_metadata(pagina_url: str) -> tuple[datetime | None, str | None]:
    """Retorna (data_atualizacao, url_pdf) lidos da página do estado.

    O gov.br foi atualizado e agora as URLs dos estados servem o PDF
    diretamente (Content-Type: application/pdf), sem página HTML intermediária.
    Mantemos o caminho HTML como fallback para compatibilidade futura.
    """
    r = requests.get(pagina_url, headers={"User-Agent": USER_AGENT},
                     timeout=REQUEST_TIMEOUT)
    r.raise_for_status()

    content_type = r.headers.get("Content-Type", "").lower()

    # Caso novo (a partir de 2025): a URL do estado já é o PDF diretamente.
    if "application/pdf" in content_type:
        return None, pagina_url

    # Caso legado: página HTML com link para o PDF.
    soup = BeautifulSoup(r.text, "html.parser")
    texto = soup.get_text(" ", strip=True)

    data = None
    m = RE_ATUALIZADO.search(texto)
    if m:
        d, mo, y, h, mi = map(int, m.groups())
        # gov.br exibe horário de Brasília (UTC-3).
        # Armazenamos em UTC para consistência no banco.
        from datetime import timedelta
        tz_brasilia = timezone(timedelta(hours=-3))
        dt_local = datetime(y, mo, d, h, mi, tzinfo=tz_brasilia)
        data = dt_local.astimezone(timezone.utc)

    # Detecta URL do PDF. O gov.br usava três padrões:
    #   1. href="...Arquivo.pdf"  (link direto)
    #   2. href="...estado/@@download/file"  (download do Plone)
    #   3. href="...arquivo.xlsx"  (Pernambuco — agora também é PDF)
    pdf_url = None
    xlsx_url = None
    for a in soup.find_all("a", href=True):
        href = a["href"]
        low = href.lower()
        if low.endswith(".pdf") or low.endswith("/@@download/file"):
            pdf_url = urljoin(pagina_url, href)
            break
        if low.endswith(".xlsx"):
            xlsx_url = urljoin(pagina_url, href)

    if not pdf_url and xlsx_url:
        raise RuntimeError(
            f"Estado publica XLSX ({xlsx_url}), não PDF. "
            "Extração de XLSX não implementada neste parser."
        )

    return data, pdf_url


def download_pdf(url: str) -> tuple[bytes, str]:
    r = requests.get(url, headers={"User-Agent": USER_AGENT},
                     timeout=REQUEST_TIMEOUT)
    r.raise_for_status()
    return r.content, hashlib.sha256(r.content).hexdigest()


# ---------------------------------------------------------------------------
# Lógica de sync por UF
# ---------------------------------------------------------------------------
def sync_uf(sb: Supabase, uf: str, force: bool = False) -> dict:
    rows = sb.select("estados", uf=f"eq.{uf}", select="*")
    if not rows:
        return {"uf": uf, "status": "skipped", "reason": "UF não cadastrada"}
    estado = rows[0]

    print(f"[{uf}] Verificando {estado['pagina_url']} ...", flush=True)
    site_data, pdf_url = fetch_page_metadata(estado["pagina_url"])
    if not pdf_url:
        return {"uf": uf, "status": "error", "reason": "PDF não encontrado na página"}

    # Decide se precisa atualizar
    precisa = force
    if not precisa:
        if estado.get("atualizado_em") is None:
            precisa = True
        elif site_data and estado["atualizado_em"]:
            prev = datetime.fromisoformat(estado["atualizado_em"].replace("Z", "+00:00"))
            if site_data > prev:
                precisa = True

    if not precisa:
        # Mesmo assim, checa hash do PDF (data pode não ter mudado mas conteúdo sim)
        content, pdf_hash = download_pdf(pdf_url)
        if estado.get("pdf_hash") != pdf_hash:
            precisa = True
    else:
        content, pdf_hash = download_pdf(pdf_url)

    if not precisa:
        return {"uf": uf, "status": "unchanged", "pdf_hash": pdf_hash}

    # Parseia
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
        f.write(content)
        tmp_path = f.name

    try:
        registros = parse_pdf(tmp_path, uf)
    finally:
        os.unlink(tmp_path)

    if not registros:
        return {"uf": uf, "status": "error", "reason": "Nenhum registro extraído"}

    # Estratégia de upsert preservando geocoding:
    #   1. Carrega hospitais atuais do UF (com suas coordenadas).
    #   2. Para cada registro novo, tenta casar por (municipio, unidade, cnes).
    #      - Se casar e o endereço não mudou: mantém lat/lng/geocode_*.
    #      - Se casar e o endereço mudou: invalida geocoding (será refeito).
    #      - Se não casar: novo registro, marca geocode_status='pendente'.
    #   3. Registros que não têm correspondência no novo import são removidos.
    print(f"[{uf}] {len(registros)} registros no PDF — sincronizando ...", flush=True)

    atuais = sb.select("hospitais",
                       uf=f"eq.{uf}",
                       select="id,municipio,unidade,endereco,cnes,lat,lng,geocode_status,geocode_fonte,geocode_em")
    por_chave = {}
    for h in atuais:
        k = (h["municipio"] or "", h["unidade"] or "", h["cnes"] or "")
        por_chave[k] = h

    ids_vistos = set()
    para_inserir = []
    para_atualizar = []

    for reg in registros:
        k = (reg["municipio"] or "", reg["unidade"] or "", reg["cnes"] or "")
        existente = por_chave.get(k)
        if existente:
            ids_vistos.add(existente["id"])
            endereco_igual = (existente.get("endereco") or "") == (reg.get("endereco") or "")
            payload = {
                "uf": reg["uf"],
                "municipio": reg["municipio"],
                "unidade": reg["unidade"],
                "endereco": reg["endereco"],
                "telefones": reg["telefones"],
                "cnes": reg["cnes"],
                "atendimentos": reg["atendimentos"],
                "atendimentos_raw": reg["atendimentos_raw"],
                "atualizado_em": datetime.now(timezone.utc).isoformat(),
            }
            if not endereco_igual:
                # Endereço mudou: invalida coordenadas (serão regeocodificadas).
                payload.update({
                    "lat": None, "lng": None,
                    "geocode_status": "pendente",
                    "geocode_fonte": None,
                    "geocode_em": None,
                })
            para_atualizar.append((existente["id"], payload))
        else:
            para_inserir.append({
                **reg,
                "geocode_status": "pendente",
            })

    # Remove hospitais que sumiram do PDF
    ids_remover = [h["id"] for h in atuais if h["id"] not in ids_vistos
                   and h["id"] not in {u[0] for u in para_atualizar}]
    for id_ in ids_remover:
        sb.delete("hospitais", id=f"eq.{id_}")

    # Insere novos
    for i in range(0, len(para_inserir), 500):
        chunk = para_inserir[i:i + 500]
        sb.upsert("hospitais", chunk, on_conflict="id")

    # Atualiza os modificados (um por vez — volume pequeno por UF)
    for id_, payload in para_atualizar:
        sb.update("hospitais", {"id": id_}, payload)

    print(f"[{uf}] +{len(para_inserir)} novos, ~{len(para_atualizar)} atualizados, "
          f"-{len(ids_remover)} removidos", flush=True)

    sb.update("estados", {"uf": uf}, {
        "pdf_url": pdf_url,
        "atualizado_em": site_data.isoformat() if site_data else None,
        "sincronizado_em": datetime.now(timezone.utc).isoformat(),
        "pdf_hash": pdf_hash,
        "total_hospitais": len(registros),
        "status": "ok",
        "ultimo_erro": None,
    })

    return {"uf": uf, "status": "updated", "total": len(registros)}


def sync_uf_safe(sb: Supabase, uf: str, force: bool = False) -> dict:
    """Wrapper que captura exceções e registra no banco."""
    try:
        return sync_uf(sb, uf, force=force)
    except Exception as e:
        msg = str(e)
        try:
            sb.update("estados", {"uf": uf}, {
                "sincronizado_em": datetime.now(timezone.utc).isoformat(),
                "status": "erro" if "XLSX" not in msg else "nao_suportado",
                "ultimo_erro": msg[:500],
            })
        except Exception:
            pass  # não deixa o erro do log quebrar o sync
        return {"uf": uf, "status": "error", "reason": msg}


# ---------------------------------------------------------------------------
# Geocoding dos hospitais pendentes
# ---------------------------------------------------------------------------
def geocode_pendentes(sb: Supabase, uf: Optional[str] = None, limit: int = 1000) -> dict:
    """
    Geocodifica hospitais com status 'pendente'.
    Rate limit do Nominatim: 1 req/s. Em 1000 registros = ~17 min.
    """
    filtros = {
        "select": "id,uf,municipio,unidade,endereco",
        "geocode_status": "eq.pendente",
        "limit": str(limit),
    }
    if uf:
        filtros["uf"] = f"eq.{uf}"

    pendentes = sb.select("hospitais", **filtros)
    if not pendentes:
        return {"geocoded": 0, "falhou": 0}

    print(f"Geocodificando {len(pendentes)} hospitais ...", flush=True)
    geocoder = Geocoder(
        supabase_url=sb.url,
        supabase_key=os.environ.get("SUPABASE_SERVICE_KEY"),
    )
    ok = falhou = 0
    for i, h in enumerate(pendentes, 1):
        res = geocoder.geocode_endereco(
            h.get("endereco") or "",
            h["municipio"],
            h["uf"],
        )
        now = datetime.now(timezone.utc).isoformat()
        if res:
            sb.update("hospitais", {"id": h["id"]}, {
                "lat": res.lat,
                "lng": res.lng,
                "geocode_status": "ok",
                "geocode_fonte": res.fonte,
                "geocode_em": now,
            })
            ok += 1
        else:
            sb.update("hospitais", {"id": h["id"]}, {
                "geocode_status": "falhou",
                "geocode_em": now,
            })
            falhou += 1
        if i % 20 == 0:
            print(f"  {i}/{len(pendentes)} (ok={ok}, falhou={falhou})", flush=True)

    print(f"Concluído: {ok} ok, {falhou} falharam", flush=True)
    return {"geocoded": ok, "falhou": falhou}


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(
        description="Sincroniza hospitais do gov.br/saude para o Supabase."
    )
    sub = ap.add_subparsers(dest="cmd")

    p_sync = sub.add_parser("sync", help="Baixa PDFs e atualiza banco (sem geocoding)")
    p_sync.add_argument("uf", nargs="?", help="UF específica (omita para todas)")
    p_sync.add_argument("--force", action="store_true")

    p_geo = sub.add_parser("geocode", help="Geocodifica hospitais pendentes")
    p_geo.add_argument("uf", nargs="?", help="UF específica (omita para todas)")
    p_geo.add_argument("--limit", type=int, default=1000)

    # Retrocompat: rodar sem subcomando = sync
    ap.add_argument("uf_legacy", nargs="?", help=argparse.SUPPRESS)
    ap.add_argument("--force", action="store_true", help=argparse.SUPPRESS)

    args = ap.parse_args()

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print("Defina SUPABASE_URL e SUPABASE_SERVICE_KEY", file=sys.stderr)
        sys.exit(2)
    sb = Supabase(url, key)

    # Resolve comando
    cmd = args.cmd or "sync"

    if cmd == "geocode":
        uf = getattr(args, "uf", None)
        geocode_pendentes(sb, uf=uf, limit=args.limit)
        return

    # cmd == sync
    uf_arg = getattr(args, "uf", None) or getattr(args, "uf_legacy", None)
    force = getattr(args, "force", False)
    ufs = [uf_arg] if uf_arg else [e["uf"] for e in sb.select("estados", select="uf")]

    resultados = []
    for uf in ufs:
        res = sync_uf_safe(sb, uf, force=force)
        print(f"  → {res}", flush=True)
        resultados.append(res)

    atualizados = sum(1 for r in resultados if r["status"] == "updated")
    erros = sum(1 for r in resultados if r["status"] == "error")
    print(f"\nResumo: {atualizados} atualizados, {erros} erros, {len(resultados)} total")
    sys.exit(1 if erros else 0)


if __name__ == "__main__":
    main()
