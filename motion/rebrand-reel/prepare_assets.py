"""Extract clean, transparent brand layers from the source images.

Outputs (assets/):
  old_black.png   - "مركز" from the old Al-Huwaish poster (alpha mask, black ink)
  old_brown.png   - "الحويش" from the old poster (alpha mask, brown ink)
  old_bg.jpg      - the old poster backdrop, blurred, 1080x1920 cover
  word_0..2.png   - the three words of "مكتب سفيان للموبايل" (white alpha masks, right-to-left order)
  latin_*.png     - letters of "SUFYAN MOBILE" (white alpha masks)
  layout.json     - measured logo geometry, colours and glyph positions
"""
import json
import os

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "assets", "source")
OUT = os.path.join(HERE, "assets")

LUMA = np.array([0.299, 0.587, 0.114])


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def save_mask(alpha, path, rgb=(255, 255, 255)):
    h, w = alpha.shape
    out = np.zeros((h, w, 4), np.uint8)
    out[..., 0], out[..., 1], out[..., 2] = rgb
    out[..., 3] = np.clip(alpha * 255 + 0.5, 0, 255).astype(np.uint8)
    Image.fromarray(out, "RGBA").save(path, optimize=True)


def bbox(mask, thr=0.04):
    ys, xs = np.where(mask > thr)
    return xs.min(), xs.max() + 1, ys.min(), ys.max() + 1


def column_groups(alpha, min_gap):
    """Split an ink mask into runs of columns separated by >= min_gap empty columns."""
    ink = (alpha > 0.04).any(0)
    cols = np.where(ink)[0]
    groups, start, prev = [], cols[0], cols[0]
    for c in cols[1:]:
        if c - prev > min_gap:
            groups.append((start, prev + 1))
            start = c
        prev = c
    groups.append((start, prev + 1))
    return groups


def old_brand(layout):
    im = Image.open(os.path.join(SRC, "alhuwaish-old.jpg")).convert("RGB")
    a = np.asarray(im).astype(float)
    lum = a @ LUMA
    mx, mn = a.max(2), a.min(2)
    sat = (mx - mn) / np.maximum(mx, 1)

    # Name block only (the phone line starts lower down).
    y0, y1, x0, x1 = 170, 520, 200, 1080
    L, S, A = lum[y0:y1, x0:x1], sat[y0:y1, x0:x1], a[y0:y1, x0:x1]
    brownish = (A[..., 0] > A[..., 2] + 25).astype(float)

    alpha_brown = smoothstep(0.28, 0.62, S) * brownish * smoothstep(215, 150, L)
    alpha_black = smoothstep(118, 48, L) * (1 - smoothstep(0.30, 0.55, S))
    # Anti-aliased brown edges darken the luma too; keep them out of the black layer.
    alpha_black = np.clip(alpha_black - alpha_brown, 0, 1)

    # Crop both layers to their shared bounding box so they stay registered.
    bx0, bx1, by0, by1 = bbox(np.maximum(alpha_black, alpha_brown))
    pad = 6
    bx0, by0 = max(bx0 - pad, 0), max(by0 - pad, 0)
    bx1, by1 = bx1 + pad, by1 + pad
    save_mask(alpha_black[by0:by1, bx0:bx1], os.path.join(OUT, "old_black.png"), (28, 28, 30))
    save_mask(alpha_brown[by0:by1, bx0:bx1], os.path.join(OUT, "old_brown.png"), (127, 74, 27))
    layout["old"] = {"w": int(bx1 - bx0), "h": int(by1 - by0)}

    # Backdrop: the old poster with its lettering and phone line painted out
    # (normalised-convolution inpaint), softened and scaled to cover 1080x1920.
    band = np.zeros(lum.shape, bool)
    band[160:640] = True
    ink = band & ((lum < 95) | ((sat > 0.3) & (a[..., 0] > a[..., 2] + 25)))
    hole = ndimage.binary_dilation(ink, iterations=7)
    keep = (~hole).astype(float)
    filled = a.copy()
    for sigma in (6, 14, 30):
        num = np.stack([ndimage.gaussian_filter(a[..., c] * keep, sigma) for c in range(3)], -1)
        den = ndimage.gaussian_filter(keep, sigma)[..., None]
        est = num / np.maximum(den, 1e-4)
        still = hole & (den[..., 0] > 0.02)
        filled[still] = est[still]
        a, keep = filled, np.maximum(keep, (den[..., 0] > 0.02).astype(float))
    clean = Image.fromarray(np.clip(filled, 0, 255).astype(np.uint8), "RGB")

    W, H = 1080, 1920
    s = H / clean.height
    bg = clean.resize((int(clean.width * s), H), Image.LANCZOS)
    left = (bg.width - W) // 2
    bg = bg.crop((left, 0, left + W, H)).filter(ImageFilter.GaussianBlur(9))
    bg.save(os.path.join(OUT, "old_bg.jpg"), quality=92)


def new_brand(layout):
    im = Image.open(os.path.join(SRC, "sufyan-logo.jpg")).convert("RGB")
    a = np.asarray(im).astype(float)
    lum = a @ LUMA
    sand = np.array([242, 238, 227.0])
    petrol = np.array([20, 52, 63.0])
    gold = np.array([200, 169, 105.0])
    ink = (sand @ LUMA - lum) / (sand @ LUMA - petrol @ LUMA)

    # Icon geometry measured on the 2576px master.
    icon = {"x0": 932, "x1": 1644, "y0": 753, "y1": 1467}
    size = icon["x1"] - icon["x0"]
    cx = (icon["x0"] + icon["x1"]) / 2
    cy = (icon["y0"] + icon["y1"]) / 2
    bars = [(1141, 1213, 1106, 1238), (1252, 1324, 1044, 1238), (1363, 1435, 982, 1238)]

    # Arabic wordmark.
    wy0, wy1, wx0, wx1 = 1580, 1790, 440, 2000
    wa = np.clip(ink[wy0:wy1, wx0:wx1], 0, 1)
    bx0, bx1, by0, by1 = bbox(wa, 0.06)
    wa = wa[by0:by1, bx0:bx1]
    wa = smoothstep(0.05, 0.95, wa)
    word_x0, word_y0 = wx0 + bx0, wy0 + by0
    groups = column_groups(wa, min_gap=18)
    words = []
    # Right-to-left reading order.
    for i, (c0, c1) in enumerate(sorted(groups, key=lambda g: -g[0])):
        seg = np.zeros_like(wa[:, c0:c1])
        seg[:] = wa[:, c0:c1]
        save_mask(seg, os.path.join(OUT, f"word_{i}.png"))
        words.append({"file": f"word_{i}.png", "x": (word_x0 + c0 - cx) / size,
                      "y": (word_y0 - cy) / size, "w": (c1 - c0) / size, "h": (by1 - by0) / size})

    # Latin line, letter by letter.
    ly0, ly1, lx0, lx1 = 1795, 1865, 900, 1660
    la = np.clip(ink[ly0:ly1, lx0:lx1] / 0.62, 0, 1)
    bx0, bx1, by0, by1 = bbox(la, 0.08)
    la = smoothstep(0.06, 0.9, la[by0:by1, bx0:bx1])
    strong = la > 0.9
    latin_rgb = a[ly0 + by0:ly0 + by1, lx0 + bx0:lx0 + bx1][strong].mean(0)
    letters = []
    for i, (c0, c1) in enumerate(column_groups(la, min_gap=6)):
        save_mask(la[:, c0:c1], os.path.join(OUT, f"latin_{i}.png"))
        letters.append({"file": f"latin_{i}.png", "x": (lx0 + bx0 + c0 - cx) / size,
                        "y": (ly0 + by0 - cy) / size, "w": (c1 - c0) / size, "h": (by1 - by0) / size})

    layout["new"] = {
        "master_px": size,
        "radius": 195 / size,
        "bars": [{"x": (x0 - cx) / size, "y": (y0 - cy) / size, "w": (x1 - x0) / size,
                  "h": (y1 - y0) / size} for (x0, x1, y0, y1) in bars],
        "words": words,
        "letters": letters,
        "colors": {"sand": "#F2EEE3", "petrol": "#14343F", "gold": "#C8A969",
                   "latin": "#%02X%02X%02X" % tuple(int(v) for v in latin_rgb)},
    }


def main():
    layout = {}
    old_brand(layout)
    new_brand(layout)
    with open(os.path.join(OUT, "layout.json"), "w") as f:
        json.dump(layout, f, indent=2)
    print(json.dumps(layout, indent=2)[:1500])


if __name__ == "__main__":
    main()
