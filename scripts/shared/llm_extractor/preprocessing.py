"""PDF → list[image bytes] with size and sharpness normalised.

LLM token cost scales with image size, but accuracy collapses below
roughly 1200px on the long side for dense tables. We resize to a
target max dimension, sharpen slightly to recover from low-quality
scans, and re-encode as JPEG to shave further bytes.
"""

from __future__ import annotations

import io
from dataclasses import dataclass

from pdf2image import convert_from_path
from PIL import Image, ImageFilter


@dataclass(frozen=True)
class PreprocessConfig:
    dpi: int = 200
    max_dimension: int = 2048
    jpeg_quality: int = 92
    sharpen: bool = True


def pdf_to_images(path: str, config: PreprocessConfig = PreprocessConfig()) -> list[bytes]:
    """Render each PDF page to a preprocessed JPEG.

    Returns a list of JPEG byte buffers (one per page) ready to be
    attached to an LLM vision request.
    """
    pages = convert_from_path(path, dpi=config.dpi, fmt="png")
    return [_normalise(page, config) for page in pages]


def _normalise(image: Image.Image, config: PreprocessConfig) -> bytes:
    image = image.convert("RGB")

    if max(image.size) > config.max_dimension:
        # Preserve aspect ratio; the longer side defines the bound.
        scale = config.max_dimension / max(image.size)
        new_size = (int(image.width * scale), int(image.height * scale))
        image = image.resize(new_size, Image.Resampling.LANCZOS)

    if config.sharpen:
        # Mild unsharp mask — boosts legibility on faded scans without
        # introducing ringing artifacts.
        image = image.filter(ImageFilter.UnsharpMask(radius=1.0, percent=80, threshold=2))

    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=config.jpeg_quality, optimize=True)
    return buffer.getvalue()
