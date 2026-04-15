"""
Wrapper do Tesseract para PDFs escaneados.

Retorna palavras com coordenadas no mesmo formato que
pdfplumber.extract_words() — permite reutilizar parte da lógica de
parsing geométrico do parser principal.

Usa Tesseract 5+ com dicionário português (tesseract-ocr-por).

Dependências sistêmicas (não são auto-instaláveis):
  - tesseract-ocr >= 5.0
  - tesseract-ocr-por
  - poppler-utils (para pdf2image)

No CI, instalar com:
  sudo apt-get install -y tesseract-ocr tesseract-ocr-por poppler-utils

Uso típico:
    from scripts.ocr import ocr_pdf

    for pagina in ocr_pdf("/caminho/pdf_escaneado.pdf"):
        print(f"Pág {pagina['page_number']}: {len(pagina['words'])} palavras")
        for w in pagina['words']:
            print(f"  {w['text']!r} @ ({w['x0']}, {w['top']}) conf={w['confidence']}")
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterator

# Imports "lazy" — só exigidos quando OCR for efetivamente usado.
# Permite que o resto do sync funcione mesmo sem tesseract instalado.
try:
    import pytesseract
    from pdf2image import convert_from_path
    _OCR_DISPONIVEL = True
    _IMPORT_ERROR: Exception | None = None
except ImportError as e:
    _OCR_DISPONIVEL = False
    _IMPORT_ERROR = e


DEFAULT_DPI = 300
DEFAULT_LANG = "por"
DEFAULT_PSM = "6"  # assume um bloco uniforme de texto (bom para tabelas)
DEFAULT_MIN_CONFIDENCE = 30  # filtra ruído de baixa confiança


def is_ocr_available() -> bool:
    """Retorna True se pytesseract e pdf2image estão importáveis."""
    return _OCR_DISPONIVEL


def ocr_unavailable_reason() -> str | None:
    """Retorna string explicando por que OCR não está disponível, ou None."""
    if _OCR_DISPONIVEL:
        return None
    return f"OCR não disponível: {_IMPORT_ERROR}"


@dataclass
class PaginaOcr:
    """Uma página extraída via OCR, com palavras posicionadas."""
    page_number: int
    width: float
    height: float
    words: list[dict]  # {text, x0, x1, top, bottom, confidence}
    mean_confidence: float  # média de confiança das palavras filtradas

    @property
    def has_content(self) -> bool:
        return len(self.words) > 0


def ocr_pdf(
    path: str,
    dpi: int = DEFAULT_DPI,
    lang: str = DEFAULT_LANG,
    psm: str = DEFAULT_PSM,
    min_confidence: int = DEFAULT_MIN_CONFIDENCE,
) -> Iterator[PaginaOcr]:
    """
    Roda Tesseract em cada página do PDF e gera PaginaOcr com palavras.

    Parâmetros:
        path             — caminho do PDF
        dpi              — resolução da conversão PDF→imagem (300 é bom para A4)
        lang             — língua do Tesseract (default 'por')
        psm              — page segmentation mode (6 = bloco uniforme de texto)
        min_confidence   — descarta palavras com conf < N (0-100)

    Lança:
        RuntimeError se pytesseract/pdf2image não estiverem instalados
    """
    if not _OCR_DISPONIVEL:
        raise RuntimeError(ocr_unavailable_reason())

    images = convert_from_path(path, dpi=dpi)
    config = f"--psm {psm}"

    for page_num, img in enumerate(images, start=1):
        data = pytesseract.image_to_data(
            img,
            lang=lang,
            config=config,
            output_type=pytesseract.Output.DICT,
        )

        palavras: list[dict] = []
        confs: list[int] = []
        n = len(data["text"])
        for i in range(n):
            text = data["text"][i].strip()
            if not text:
                continue
            try:
                conf = int(data["conf"][i])
            except (ValueError, TypeError):
                conf = -1
            if conf < min_confidence:
                continue

            x0 = float(data["left"][i])
            y0 = float(data["top"][i])
            w = float(data["width"][i])
            h = float(data["height"][i])

            palavras.append({
                "text": text,
                "x0": x0,
                "x1": x0 + w,
                "top": y0,
                "bottom": y0 + h,
                "confidence": conf,
            })
            confs.append(conf)

        mean_conf = sum(confs) / len(confs) if confs else 0.0

        yield PaginaOcr(
            page_number=page_num,
            width=float(img.width),
            height=float(img.height),
            words=palavras,
            mean_confidence=mean_conf,
        )


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Uso: python -m scripts.ocr <caminho.pdf>")
        sys.exit(1)

    for pagina in ocr_pdf(sys.argv[1]):
        print(
            f"Pág {pagina.page_number}: {len(pagina.words)} palavras, "
            f"conf média {pagina.mean_confidence:.1f}%"
        )
