"""
Tesseract wrapper for scanned PDFs.

Returns words with coordinates in the same shape as
`pdfplumber.extract_words()`, so downstream parsing can be shared.

Requires Tesseract 5+ with the Portuguese dictionary (tesseract-ocr-por).

System dependencies (not pip-installable):
  - tesseract-ocr >= 5.0
  - tesseract-ocr-por
  - poppler-utils (used by pdf2image)

In CI install with:
  sudo apt-get install -y tesseract-ocr tesseract-ocr-por poppler-utils

Typical usage:
    from scripts.parsing.ocr_engine import ocr_pdf

    for page in ocr_pdf("/path/scanned.pdf"):
        for w in page.words:
            print(w["text"], w["x0"], w["top"], w["confidence"])
"""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass

# Lazy imports — Tesseract is only required when OCR is actually used.
try:
    import pytesseract
    from pdf2image import convert_from_path

    _OCR_AVAILABLE = True
    _IMPORT_ERROR: Exception | None = None
except ImportError as e:
    _OCR_AVAILABLE = False
    _IMPORT_ERROR = e


DEFAULT_DPI = 300
# Tesseract language code for Portuguese — matches the language of the
# scanned source PDFs.
DEFAULT_LANG = "por"
DEFAULT_PSM = "6"  # assume a uniform block of text (good for tables)
DEFAULT_MIN_CONFIDENCE = 30  # filter low-confidence noise


def is_ocr_available() -> bool:
    """True if pytesseract and pdf2image are importable."""
    return _OCR_AVAILABLE


def ocr_unavailable_reason() -> str | None:
    """Returns a string explaining why OCR is unavailable, or None."""
    if _OCR_AVAILABLE:
        return None
    return f"OCR unavailable: {_IMPORT_ERROR}"


@dataclass
class OcrPage:
    """One PDF page extracted via OCR, with positioned words."""

    page_number: int
    width: float
    height: float
    words: list[dict]  # {text, x0, x1, top, bottom, confidence}
    mean_confidence: float  # mean confidence of kept (filtered) words

    @property
    def has_content(self) -> bool:
        return len(self.words) > 0


def ocr_pdf(
    path: str,
    dpi: int = DEFAULT_DPI,
    lang: str = DEFAULT_LANG,
    psm: str = DEFAULT_PSM,
    min_confidence: int = DEFAULT_MIN_CONFIDENCE,
) -> Iterator[OcrPage]:
    """
    Run Tesseract on every page of `path` and yield OcrPage objects.

    Raises RuntimeError if pytesseract/pdf2image are not installed.
    """
    if not _OCR_AVAILABLE:
        raise RuntimeError(ocr_unavailable_reason())

    images = convert_from_path(path, dpi=dpi)
    config = f"--psm {psm}"

    for page_number, img in enumerate(images, start=1):
        data = pytesseract.image_to_data(
            img,
            lang=lang,
            config=config,
            output_type=pytesseract.Output.DICT,
        )

        words: list[dict] = []
        confidences: list[int] = []
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

            words.append(
                {
                    "text": text,
                    "x0": x0,
                    "x1": x0 + w,
                    "top": y0,
                    "bottom": y0 + h,
                    "confidence": conf,
                }
            )
            confidences.append(conf)

        mean_conf = sum(confidences) / len(confidences) if confidences else 0.0

        yield OcrPage(
            page_number=page_number,
            width=float(img.width),
            height=float(img.height),
            words=words,
            mean_confidence=mean_conf,
        )


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python -m scripts.parsing.ocr_engine <path.pdf>")
        sys.exit(1)

    for page in ocr_pdf(sys.argv[1]):
        print(
            f"Page {page.page_number}: {len(page.words)} words, "
            f"mean conf {page.mean_confidence:.1f}%"
        )
