"""
Parser para dados vindos de OCR (quando o PDF é escaneado).

Estratégia híbrida de extração:

1. Usar coordenada X para identificar a coluna MUNICÍPIO (sempre à
   esquerda). Cada ocorrência de município marca o início de um
   hospital lógico — mesmo que esse hospital ocupe múltiplas linhas
   visuais no PDF.

2. Dentro da "faixa Y" de cada hospital, classificar cada palavra por
   CONTEÚDO (não por posição X):
     - Telefone: padrão `(NN) NNNN-NNNN`
     - CNES: exatos 7 dígitos
     - Atendimento: palavras como "Botrópico", "Crotálico", etc.
     - Endereço: tudo que sobrar

Essa abordagem é mais tolerante que detecção geométrica pura, porque
não depende de gaps perfeitos entre colunas — que muitas vezes não
existem no PDF escaneado (CNES e atendimentos ficam grudados).
"""
from __future__ import annotations

import re
from typing import Optional

from scripts.ocr import PaginaOcr, ocr_pdf
from scripts.parser import normalize_atendimentos

# Padrões de classificação de palavras por conteúdo
RE_TELEFONE = re.compile(r"\(\d{2}\)\s*\d{3,5}[-/]?\d{3,5}")
RE_TELEFONE_FRAGMENTO = re.compile(r"^\(?\d{2,5}[-/]?\d{0,5}\)?$")
RE_CNES = re.compile(r"^\d{7}\|?$")  # CNES é 7 dígitos, às vezes com | grudado
RE_DIGITO_ONLY = re.compile(r"^\d+[-/]?\d*$")

# Atendimentos conhecidos (sem acento, case-insensitive) — coerente com
# o dicionário do parser principal
ATENDIMENTOS_CANONICOS = {
    "botropico", "crotalico", "elapidico", "laquetico",
    "escorpionico", "loxoscelico", "foneutrico", "lonomico",
}

# Palavras que indicam cabeçalho da tabela (devem ser descartadas)
HEADER_KEYWORDS = {
    "MUNICIPIO", "MUNICÍPIO",
    "UNIDADE",
    "ENDERECO", "ENDEREÇO",
    "TELEFONE", "TELEFONES",
    "CNES",
    "ATENDIMENTO", "ATENDIMENTOS", "SOROTERAPIA",
}

# Palavras de rodapé/rodapé institucional que não devem ser confundidas
# com municípios
RODAPE_KEYWORDS = {
    "GOV.BR", "GOV.BR/SAUDE", "SUS",
    "MINISTERIO", "MINISTÉRIO", "SAUDE", "SAÚDE",
    "PATRIA", "PÁTRIA", "BRASIL",
}

# Margem vertical para considerar palavras como "mesma linha".
# Valor mais permissivo ajuda a juntar palavras de municípios compostos
# (Bom Jesus, Campo Maior) que o OCR pode colocar em Y ligeiramente
# diferentes.
ROW_TOLERANCE_RATIO = 1.2


def _strip_accents(s: str) -> str:
    import unicodedata
    return "".join(
        c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn"
    )


def _clean(s: Optional[str]) -> str:
    if not s:
        return ""
    return " ".join(s.split()).strip()


def _is_header_word(text: str) -> bool:
    return _strip_accents(text).upper().strip(",:.") in HEADER_KEYWORDS


def _is_rodape_word(text: str) -> bool:
    return _strip_accents(text).upper().strip(",:./") in RODAPE_KEYWORDS


def _agrupar_linhas(words: list[dict]) -> list[list[dict]]:
    """
    Agrupa palavras em linhas horizontais.

    Duas palavras estão na mesma linha se seus centros verticais estão
    a menos de (altura média * tolerance) de distância.
    """
    if not words:
        return []

    alturas = [w["bottom"] - w["top"] for w in words if w["bottom"] > w["top"]]
    altura_media = sum(alturas) / len(alturas) if alturas else 20.0
    tolerance = altura_media * ROW_TOLERANCE_RATIO

    # Ordena por y, depois por x
    words_sorted = sorted(
        words, key=lambda w: ((w["top"] + w["bottom"]) / 2, w["x0"])
    )

    linhas: list[list[dict]] = []
    for w in words_sorted:
        y_center = (w["top"] + w["bottom"]) / 2
        if linhas:
            linha_atual = linhas[-1]
            y_ultima = sum(
                (p["top"] + p["bottom"]) / 2 for p in linha_atual
            ) / len(linha_atual)
            if abs(y_center - y_ultima) <= tolerance:
                linha_atual.append(w)
                continue
        linhas.append([w])

    # Ordena palavras dentro de cada linha por X
    for linha in linhas:
        linha.sort(key=lambda w: w["x0"])
    return linhas


def _detectar_fronteiras_colunas(
    linhas: list[list[dict]], num_colunas: int = 6
) -> list[tuple[float, float]]:
    """
    Inferir fronteiras de coluna via detecção de gaps.

    Princípio: entre colunas há espaço vazio (gaps nas posições X das
    palavras). Dentro de uma coluna, as palavras estão densamente
    distribuídas. Os (num_colunas - 1) maiores gaps são as fronteiras
    naturais entre colunas.

    Algoritmo:
      1. Coleta todos os x0 e x1 (início e fim) das palavras
      2. Cria um "mapa de densidade" marcando pixels onde há palavras
      3. Identifica regiões vazias consecutivas (gaps)
      4. Os (num_colunas - 1) maiores gaps separam as colunas
      5. Cada banda vai da fronteira anterior até a próxima
    """
    if not linhas or not any(linhas):
        return []

    todas_palavras = [w for linha in linhas for w in linha]
    if not todas_palavras:
        return []

    min_x = min(w["x0"] for w in todas_palavras)
    max_x = max(w["x1"] for w in todas_palavras)

    # 1. Mapa de densidade: True onde há palavra, False onde está vazio
    total_pixels = int(max_x - min_x) + 1
    if total_pixels <= 0:
        return []
    ocupado = [False] * total_pixels
    for w in todas_palavras:
        inicio = int(w["x0"] - min_x)
        fim = int(w["x1"] - min_x) + 1
        for p in range(max(0, inicio), min(total_pixels, fim)):
            ocupado[p] = True

    # 2. Encontra todos os gaps (regiões contíguas False)
    gaps: list[tuple[int, int, int]] = []  # (inicio, fim, tamanho)
    i = 0
    while i < total_pixels:
        if not ocupado[i]:
            j = i
            while j < total_pixels and not ocupado[j]:
                j += 1
            gap_size = j - i
            gaps.append((i, j, gap_size))
            i = j
        else:
            i += 1

    # Remove gaps muito pequenos (< 20px) que são só espaço entre palavras
    gaps_significativos = [g for g in gaps if g[2] >= 20]

    # 3. Pega os (num_colunas - 1) maiores gaps como fronteiras
    gaps_significativos.sort(key=lambda g: -g[2])
    fronteiras = gaps_significativos[: num_colunas - 1]

    # Converte gaps em fronteiras ordenadas por X
    limites: list[float] = [min_x]
    for inicio, fim, _ in fronteiras:
        limites.append(min_x + (inicio + fim) / 2)
    limites.append(max_x + 1)
    limites.sort()

    # 4. Monta as bandas a partir dos limites
    bandas: list[tuple[float, float]] = []
    for i in range(len(limites) - 1):
        bandas.append((limites[i], limites[i + 1]))

    # Garante que temos exatamente num_colunas bandas (se detectou menos
    # gaps que o esperado, retorna o que conseguiu)
    return bandas[:num_colunas]


def _palavra_para_coluna(
    palavra: dict, bandas: list[tuple[float, float]]
) -> Optional[int]:
    x_center = (palavra["x0"] + palavra["x1"]) / 2
    for i, (x0, x1) in enumerate(bandas):
        if x0 <= x_center <= x1:
            return i
    return None


def _linha_para_registro(
    linha: list[dict], bandas: list[tuple[float, float]]
) -> Optional[dict]:
    """
    Converte uma linha de palavras em um registro com 6 colunas.

    Retorna None se a linha não for válida (cabeçalho, linha vazia, etc).
    """
    if not linha:
        return None

    # Descarta linhas que parecem ser cabeçalho (alta densidade de HEADER_KEYWORDS)
    palavras_header = sum(1 for w in linha if _is_header_word(w["text"]))
    if palavras_header >= 2:
        return None

    # Distribui palavras nas colunas
    colunas: list[list[str]] = [[] for _ in bandas]
    for w in linha:
        ci = _palavra_para_coluna(w, bandas)
        if ci is not None:
            colunas[ci].append(w["text"])

    celulas = [_clean(" ".join(c)) for c in colunas]

    # Espera ao menos 6 colunas com conteúdo mínimo
    if len(celulas) < 6:
        return None

    municipio, unidade, endereco, telefones, cnes = celulas[:5]
    atend_raw = celulas[5] if len(celulas) == 6 else " ".join(celulas[5:])

    # Heurística de validação: precisa ter município + unidade no mínimo
    if not municipio or not unidade:
        return None

    return {
        "municipio": municipio,
        "unidade": unidade or None,
        "endereco": endereco or None,
        "telefones": telefones or None,
        "cnes": cnes or None,
        "atendimentos_raw": atend_raw or None,
    }


def _mesclar_linhas_quebradas(
    registros_parciais: list[dict],
) -> list[dict]:
    """
    Em PDFs escaneados, hospitais frequentemente ocupam múltiplas "linhas"
    do OCR porque o Tesseract separa linhas visuais onde havia só uma lógica.

    Heurística: se uma linha tem município vazio mas as outras células
    têm conteúdo, ela provavelmente é continuação da linha anterior.
    """
    mesclados: list[dict] = []
    for reg in registros_parciais:
        if not reg.get("municipio") and mesclados:
            anterior = mesclados[-1]
            for campo in ("unidade", "endereco", "telefones", "cnes", "atendimentos_raw"):
                novo = reg.get(campo)
                if novo:
                    if anterior.get(campo):
                        anterior[campo] = f"{anterior[campo]} {novo}"
                    else:
                        anterior[campo] = novo
        else:
            mesclados.append(reg)
    return mesclados


def _classificar_palavra(texto: str) -> Optional[str]:
    """
    Classifica uma palavra por conteúdo.

    Retorna: 'telefone' | 'cnes' | 'atendimento' | None (texto livre)
    """
    t = texto.strip(" ,.|")
    if not t:
        return None
    # Telefone completo `(XX) XXXX-XXXX` ou fragmento inicial `(XX)` ou
    # fragmento final `XXXX-XXXX` (com ou sem extensão /NNNN)
    if RE_TELEFONE.search(t):
        return "telefone"
    if t.startswith("(") and any(c.isdigit() for c in t):
        return "telefone"
    # Padrão NNNN-NNNN (sem DDD) é provavelmente continuação de telefone
    if re.match(r"^\d{3,5}[-/]\d{3,5}(/\d{3,4})?$", t):
        return "telefone"
    if RE_CNES.match(t):
        return "cnes"
    t_norm = _strip_accents(t).lower().strip(",.")
    if t_norm in ATENDIMENTOS_CANONICOS:
        return "atendimento"
    return None


def _estimar_inicio_coluna_unidade(pagina: PaginaOcr) -> Optional[float]:
    """
    Estima onde começa a coluna Unidade — útil para decidir até onde um
    nome de município composto pode se estender.

    Heurística: procura palavras típicas de nomes de unidade de saúde
    (Hospital, UPA, SAMU, HC, Unidade, Posto) e usa a mediana dos seus x0.
    """
    palavras_candidatas = [
        w for w in pagina.words
        if w["text"].lower().startswith(
            ("hospital", "unidade", "upa", "samu", "hc", "posto", "santa")
        )
    ]
    if not palavras_candidatas:
        return None
    x0s = sorted(w["x0"] for w in palavras_candidatas)
    return x0s[len(x0s) // 2]  # mediana


def _pos_columna_municipio(pagina: PaginaOcr) -> Optional[tuple[float, float]]:
    """
    Detecta aproximadamente a faixa X onde ficam os nomes de município.

    Heurística: é o cluster de x0 mais à esquerda com ao menos 3 ocorrências
    (filtro para eliminar palavras isoladas na margem).
    """
    x0s = sorted(w["x0"] for w in pagina.words)
    if not x0s:
        return None

    # Agrupa x0s próximos (tolerância 50px — pega variações dentro da mesma coluna)
    clusters: list[list[float]] = [[x0s[0]]]
    for x in x0s[1:]:
        if x - clusters[-1][-1] <= 50:
            clusters[-1].append(x)
        else:
            clusters.append([x])

    # Pega o primeiro cluster (mais à esquerda) com tamanho >= 3
    for cluster in clusters:
        if len(cluster) >= 3:
            return (cluster[0] - 5, cluster[-1] + 50)
    return None


def _extract_page_ocr(pagina: PaginaOcr) -> list[dict]:
    """
    Extrai registros de uma página via OCR usando classificação por conteúdo.

    1. Detecta onde está a coluna "Município" (primeiro cluster X à esquerda)
    2. Identifica todas as posições Y onde há palavras nessa coluna
       → cada uma é o início de um hospital
    3. Para cada hospital, classifica as palavras da faixa Y por conteúdo:
       telefone, cnes, atendimento ou endereço/unidade (texto livre)
    """
    if not pagina.has_content:
        return []

    banda_municipio = _pos_columna_municipio(pagina)
    if not banda_municipio:
        return []

    # Altura média para calcular tolerância de agrupamento vertical
    alturas = [
        w["bottom"] - w["top"]
        for w in pagina.words
        if w["bottom"] > w["top"]
    ]
    altura_media = sum(alturas) / len(alturas) if alturas else 20.0
    tol_y = altura_media * ROW_TOLERANCE_RATIO

    # 1. Coleta palavras da coluna Município e agrupa por linha Y
    #    Filtra por x0 (início da palavra), não centro — palavras longas
    #    teriam centro longe do início da coluna.
    palavras_ordenadas = sorted(
        pagina.words, key=lambda w: ((w["top"] + w["bottom"]) / 2, w["x0"])
    )
    municipios: list[dict] = []
    for w in palavras_ordenadas:
        if not (banda_municipio[0] <= w["x0"] <= banda_municipio[1]):
            continue
        if _is_header_word(w["text"]) or _is_rodape_word(w["text"]):
            continue
        if not any(c.isalpha() for c in w["text"]):
            continue  # ignora números soltos na margem

        y_center = (w["top"] + w["bottom"]) / 2

        if municipios:
            ultimo = municipios[-1]
            if abs(y_center - ultimo["y_center"]) <= tol_y:
                ultimo["texto"] += " " + w["text"]
                ultimo["y_bottom"] = max(ultimo["y_bottom"], w["bottom"])
                continue

        municipios.append({
            "y_center": y_center,
            "y_top": w["top"],
            "y_bottom": w["bottom"],
            "texto": w["text"],
        })

    if not municipios:
        return []

    # 2. Para cada município, coleta as palavras da faixa Y e classifica
    registros: list[dict] = []

    # Estima onde começa a coluna "Unidade" (segundo cluster X)
    # para decidir até onde "município composto" pode ir
    limite_municipio_direita = _estimar_inicio_coluna_unidade(pagina) or (
        banda_municipio[1] + 300
    )

    for i, mun in enumerate(municipios):
        y_ini = mun["y_top"] - altura_media / 4
        y_fim = (
            municipios[i + 1]["y_top"] - altura_media / 4
            if i + 1 < len(municipios)
            else float("inf")
        )

        palavras_hospital = [
            w for w in pagina.words
            if y_ini <= (w["top"] + w["bottom"]) / 2 < y_fim
            and not _is_header_word(w["text"])
        ]

        if not palavras_hospital:
            continue

        # Expande o nome do município: captura palavras alfabéticas adjacentes
        # que estão na MESMA linha Y do município e antes da coluna Unidade
        # (ex: "Bom Jesus", "Campo Maior", "São Raimundo Nonato")
        municipio_y_center = (mun["y_top"] + mun["y_bottom"]) / 2
        palavras_municipio_extra = [
            w for w in palavras_hospital
            if abs((w["top"] + w["bottom"]) / 2 - municipio_y_center) <= tol_y
            and w["x0"] > banda_municipio[1]
            and w["x0"] < limite_municipio_direita
            and any(c.isalpha() for c in w["text"])
            and not _classificar_palavra(w["text"])
        ]
        palavras_municipio_extra.sort(key=lambda w: w["x0"])
        if palavras_municipio_extra:
            mun["texto"] = mun["texto"] + " " + " ".join(
                w["text"] for w in palavras_municipio_extra
            )

        # Ordena por Y, depois por X (ordem natural de leitura)
        palavras_hospital.sort(key=lambda w: ((w["top"] + w["bottom"]) / 2, w["x0"]))

        # Classifica e coleta em buckets
        unidade_tokens: list[str] = []
        endereco_tokens: list[str] = []
        telefone_tokens: list[str] = []
        cnes_tokens: list[str] = []
        atend_tokens: list[str] = []

        # A banda de Município: tudo que estiver nela vai para "municipio_extra"
        # (caso o nome seja composto tipo "Bom Jesus") — o primeiro já veio
        # da iteração de municípios acima.
        for w in palavras_hospital:
            texto = w["text"]

            # Palavras que começam na banda do município fazem parte dele
            # (caso já foram coletadas na fase 1) — ignora aqui.
            if banda_municipio[0] <= w["x0"] <= banda_municipio[1]:
                continue

            classe = _classificar_palavra(texto)
            if classe == "telefone":
                telefone_tokens.append(texto)
            elif classe == "cnes":
                cnes_tokens.append(texto.strip(" |,"))
            elif classe == "atendimento":
                atend_tokens.append(texto)
            else:
                # Texto livre: pode ser unidade ou endereço.
                # Heurística: palavras com dígitos ou iniciadas por Rua/Av/Pça
                # são endereço. Resto vai para unidade.
                if (
                    any(c.isdigit() for c in texto)
                    or _strip_accents(texto).lower().strip(",.")
                    in {"rua", "av", "avenida", "praca", "praça",
                        "travessa", "tv", "estrada", "rodovia", "alameda",
                        "largo", "km"}
                    or endereco_tokens  # já começamos a coletar endereço
                ):
                    endereco_tokens.append(texto)
                else:
                    unidade_tokens.append(texto)

        municipio = _clean(mun["texto"])
        unidade = _clean(" ".join(unidade_tokens))
        endereco = _clean(" ".join(endereco_tokens))
        telefones = _clean(" ".join(telefone_tokens))
        cnes = cnes_tokens[0] if cnes_tokens else None
        atend_raw = _clean(", ".join(atend_tokens))

        if not municipio:
            continue

        registros.append({
            "municipio": municipio,
            "unidade": unidade or None,
            "endereco": endereco or None,
            "telefones": telefones or None,
            "cnes": cnes,
            "atendimentos_raw": atend_raw or None,
        })

    return registros


# Palavras que indicam fragmentos de hospital mal capturados na coluna município
_PREFIXOS_INVALIDOS_MUNICIPIO = (
    "hosp", "hospital", "unidade", "upa", "samu", "posto", "santa",
)


def _municipio_valido(texto: str) -> bool:
    """Descarta registros onde 'município' é claramente um fragmento."""
    if not texto or len(texto.strip()) < 3:
        return False
    primeira_palavra = texto.strip().split()[0].lower().strip(".,")
    if primeira_palavra in _PREFIXOS_INVALIDOS_MUNICIPIO:
        return False
    return True


def parse_pdf_ocr(path: str, uf: str) -> tuple[list[dict], float]:
    """
    Parseia um PDF escaneado via OCR e retorna (registros, confianca_media).

    Os registros têm exatamente o mesmo shape que os do parser.py normal,
    com atendimentos já normalizados. Devido à natureza ruidosa do OCR,
    os campos de texto livre (unidade, endereço) podem ter qualidade
    reduzida — por isso o frontend deve marcar esses registros como
    "requer verificação".
    """
    todas_palavras_conf: list[float] = []
    registros: list[dict] = []

    for pagina in ocr_pdf(path):
        for w in pagina.words:
            todas_palavras_conf.append(w["confidence"])

        for rec in _extract_page_ocr(pagina):
            if not _municipio_valido(rec.get("municipio", "")):
                continue
            rec["uf"] = uf
            rec["atendimentos"] = normalize_atendimentos(rec["atendimentos_raw"])
            registros.append(rec)

    confianca_media = (
        sum(todas_palavras_conf) / len(todas_palavras_conf)
        if todas_palavras_conf else 0.0
    )
    return registros, confianca_media


if __name__ == "__main__":
    import json
    import sys
    if len(sys.argv) < 2:
        print("Uso: python -m scripts.parser_ocr <caminho.pdf> [UF]")
        sys.exit(1)
    path = sys.argv[1]
    uf = sys.argv[2] if len(sys.argv) > 2 else "PI"
    registros, conf = parse_pdf_ocr(path, uf)
    print(json.dumps(registros, ensure_ascii=False, indent=2))
    print(
        f"\n# {len(registros)} registros, confiança média: {conf:.1f}%",
        file=sys.stderr,
    )
