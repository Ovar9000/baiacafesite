"""
Trace the BAIA logo mark (public/images/Logo.webp: flower, palm, cup, waves,
white on blue) into outlines Blender can extrude. There is no vector master
in the repo, so this is the next best thing.

  python blender/trace_logo.py      -> blender/logo_mark.json

Each glyph is a list of closed outlines in logo units (the mark's 2x2 grid
spans about -1..1), with y up. Holes (the cup's handle) are just more
outlines: Blender fills curves even-odd.
"""

import json
import os

import numpy as np
from PIL import Image
from skimage import measure

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "public", "images", "Logo.webp")
OUT = os.path.join(HERE, "logo_mark.json")


def main():
    img = np.asarray(Image.open(SRC).convert("RGB")).astype(float) / 255
    # White marks on blue: whiteness = how much red there is (blue has little)
    white = np.clip((img[..., 0] - 0.15) / 0.7, 0, 1)
    h, w = white.shape
    ys, xs = np.nonzero(white > 0.5)
    cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
    scale = 2.0 / max(xs.max() - xs.min(), ys.max() - ys.min())

    glyphs = {"flower": [], "palm": [], "cup": [], "waves": []}
    for c in measure.find_contours(white, 0.5):
        if len(c) < 12:
            continue
        poly = measure.approximate_polygon(c, tolerance=0.7)
        ry, rx = c[:, 0].mean(), c[:, 1].mean()
        key = ("flower" if rx < cx else "palm") if ry < cy else ("cup" if rx < cx else "waves")
        pts = [[round((x - cx) * scale, 5), round((cy - y) * scale, 5)] for y, x in poly[:-1]]
        glyphs[key].append(pts)

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(glyphs, f)
    for k, v in glyphs.items():
        print(f"{k}: {len(v)} outlines, {sum(len(p) for p in v)} points")


main()
