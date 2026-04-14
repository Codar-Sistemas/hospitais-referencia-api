"""
Parser de PDFs de hospitais de referência para animais peçonhentos.
Fonte: Ministério da Saúde (gov.br/saude).

Todos os PDFs dos estados seguem o mesmo template tabular:
  MUNICÍPIO | UNIDADE DE SAÚDE | ENDEREÇO | TELEFONES | CNES | ATENDIMENTOS

A extração é baseada em coordenadas das palavras (word-level), usando as
linhas desenhadas no PDF como fronteiras de linhas/colunas da tabela.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Iterable

import pdfplumber

# Tipos canônicos de soros/atendimentos mencionados nos PDFs do MS.
# A lista reflete o que o PDF fornece (observação: "Foneutrico" cobre
# "Fonêutrico" após remoção de acentos).
TIPOS_ATENDIMENTO = [
    "Botrópico", "Crotálico", "Elapídico", "Laquético",
    "Escorpiônico", "Loxoscélico", "Foneutrico", "Lonômico",
]

# Variantes combinadas observadas em alguns PDFs (ex: MG/Uberaba)
# O parser reconhece e expande em ambos os componentes individuais,
# mas preserva o termo no campo `atendimentos_raw`.
TIPOS_COMPOSTOS = {
    "botropico-crotalico": ["Botrópico", "Crotálico"],
    "botropicocrotalico":  ["Botrópico", "Crotálico"],  # sem hífen
}


def _strip_accents(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", s or "")
        if unicodedata.category(c) != "Mn"
    )


def _clean(s: str | None) -> str:
    if not s:
        return ""
    return re.sub(r"\s+", " ", str(s)).strip()


def normalize_atendimentos(texto: str | None) -> list[str]:
    """Extrai a lista canônica de tipos a partir da célula de atendimentos.

    Tolera variações de acento/caso e tipos compostos
    (ex: "Botrópico-Crotálico" expande para ambos).
    """
    if not texto:
        return []
    t = _strip_accents(texto).lower()
    encontrados: set[str] = set()

    # Tipos compostos primeiro (antes dos simples, para não duplicar)
    for chave, tipos in TIPOS_COMPOSTOS.items():
        if chave in t:
            encontrados.update(tipos)

    # Tipos simples
    for tipo in TIPOS_ATENDIMENTO:
        if _strip_accents(tipo).lower() in t:
            encontrados.add(tipo)

    # Ordena conforme a ordem canônica da lista
    return [t for t in TIPOS_ATENDIMENTO if t in encontrados]


def _cell_text(words: list[dict]) -> str:
    """Junta palavras de uma célula respeitando a ordem (linha visual, x)."""
    if not words:
        return ""
    lines: list[list[dict]] = []
    for w in sorted(words, key=lambda w: (w["top"], w["x0"])):
        if lines and abs(w["top"] - lines[-1][0]["top"]) < 4:
            lines[-1].append(w)
        else:
            lines.append([w])
    parts = []
    for ln in lines:
        ln.sort(key=lambda w: w["x0"])
        parts.append(" ".join(w["text"] for w in ln))
    return " ".join(parts)


def _merge_edges(edges: Iterable[float], tol: float = 3.0) -> list[float]:
    edges = sorted(edges)
    out: list[float] = []
    for e in edges:
        if not out or e - out[-1] > tol:
            out.append(e)
    return out


def _extract_page(page) -> list[dict]:
    # Detecta linhas horizontais/verticais do PDF como fronteiras de tabela
    shapes = page.lines + page.rects
    h_edges, v_edges = set(), set()
    for r in shapes:
        h = r.get("height", 0) or 0
        w = r.get("width", 0) or 0
        if abs(h) < 2 and w > 30:
            h_edges.add(round(r["top"], 1))
        if abs(w) < 2 and h > 10:
            v_edges.add(round(r["x0"], 1))

    h_edges = _merge_edges(h_edges)
    v_edges = _merge_edges(v_edges)

    if len(v_edges) < 7 or len(h_edges) < 2:
        return []

    words = page.extract_words(use_text_flow=False)

    # Descarta cabeçalho
    header_bottom = 0.0
    for w in words:
        up = _strip_accents(w["text"]).upper().strip()
        if up in ("MUNICIPIO", "ENDERECO", "TELEFONES", "CNES"):
            header_bottom = max(header_bottom, w["bottom"])

    words = [w for w in words if w["top"] > header_bottom + 1]
    h_edges = [e for e in h_edges if e > header_bottom]

    if len(h_edges) < 2:
        return []

    row_bands = list(zip(h_edges[:-1], h_edges[1:]))
    col_bands = list(zip(v_edges[:-1], v_edges[1:]))

    grid: list[list[list[dict]]] = [
        [[] for _ in col_bands] for _ in row_bands
    ]
    for w in words:
        wy = (w["top"] + w["bottom"]) / 2
        wx = (w["x0"] + w["x1"]) / 2
        ri = next((i for i, (y0, y1) in enumerate(row_bands) if y0 <= wy <= y1), None)
        ci = next((i for i, (x0, x1) in enumerate(col_bands) if x0 <= wx <= x1), None)
        if ri is not None and ci is not None:
            grid[ri][ci].append(w)

    records = []
    for row in grid:
        cells = [_cell_text(c) for c in row]
        if not any(cells) or not cells[0]:
            continue
        if _strip_accents(cells[0]).upper() == "MUNICIPIO":
            continue

        # Espera-se exatamente 6 colunas lógicas
        if len(cells) >= 6:
            municipio, unidade, endereco, telefones, cnes = cells[:5]
            atend = cells[5] if len(cells) == 6 else " ".join(cells[5:])
        else:
            continue  # linha mal-formada; ignora

        records.append({
            "municipio": _clean(municipio),
            "unidade":   _clean(unidade)   or None,
            "endereco":  _clean(endereco)  or None,
            "telefones": _clean(telefones) or None,
            "cnes":      _clean(cnes)      or None,
            "atendimentos_raw": _clean(atend) or None,
        })
    return records


def parse_pdf(path: str, uf: str) -> list[dict]:
    """Parseia um PDF de hospitais e retorna a lista de registros."""
    out: list[dict] = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            for rec in _extract_page(page):
                rec["uf"] = uf
                rec["atendimentos"] = normalize_atendimentos(rec["atendimentos_raw"])
                out.append(rec)
    return out


if __name__ == "__main__":
    import json, sys
    path = sys.argv[1]
    uf = sys.argv[2] if len(sys.argv) > 2 else "SP"
    recs = parse_pdf(path, uf)
    print(json.dumps(recs, ensure_ascii=False, indent=2))
    print(f"\n# {len(recs)} registros", file=sys.stderr)
