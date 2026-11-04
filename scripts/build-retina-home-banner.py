#!/usr/bin/env python3
"""Prepare high-DPI derivatives from the approved Miaowu banner artwork.

The source is the existing approved AVIF (1400 x 512), not a new
illustration. Lanczos 2x reconstruction + conservative edge treatment
improves tablet rendering and removes the 620px legacy fallback. It does
not invent native detail that is missing from the original artwork.
"""
from pathlib import Path
from PIL import Image, ImageFilter
import pillow_avif  # noqa: F401 - registers AVIF codec with Pillow

root = Path(__file__).resolve().parents[1] / "public"
source = root / "cat-reading-hd.avif"
with Image.open(source) as original:
    image = original.convert("RGB")
if image.size != (1400, 512):
    raise SystemExit(f"Unexpected source size: {image.size}")
# Preserve original-size data for low-density displays and older Safari.
one_x = root / "cat-reading-tablet-1x.webp"
image.save(one_x, format="WEBP", quality=89, method=6)
# Keep proportions and watercolor shading; avoid haloing fine hand-drawn edges.
image = image.resize((2800, 1024), Image.Resampling.LANCZOS)
image = image.filter(ImageFilter.UnsharpMask(radius=1.05, percent=100, threshold=3))
webp = root / "cat-reading-tablet-2x.webp"
avif = root / "cat-reading-tablet-2x.avif"
image.save(webp, format="WEBP", quality=91, method=6)
image.save(avif, format="AVIF", quality=87, speed=5)
for target, expected in ((one_x, (1400, 512)), (webp, (2800, 1024)), (avif, (2800, 1024))):
    with Image.open(target) as check:
        if check.size != expected:
            raise SystemExit(f"Unexpected output size {target}: {check.size}")
    print(f"{target.name}: {target.stat().st_size} bytes ({expected[0]}x{expected[1]})")
