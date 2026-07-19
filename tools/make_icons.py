"""Generate the app icons.

Three diamonds in the three Set colours on the ink field — the same geometry
the cards use. Run from the repo root:  py tools/make_icons.py
"""

from PIL import Image, ImageDraw

INK = (20, 17, 14)
COLORS = [(216, 65, 44), (23, 135, 106), (112, 80, 168)]  # red, green, purple
SIZES = (180, 192, 512)


def diamond(draw, cx, cy, half_w, half_h, fill):
    draw.polygon(
        [(cx, cy - half_h), (cx + half_w, cy), (cx, cy + half_h), (cx - half_w, cy)],
        fill=fill,
    )


def build(size):
    # Supersample then downscale — PIL has no polygon antialiasing of its own.
    scale = 4
    s = size * scale
    img = Image.new("RGB", (s, s), INK)
    draw = ImageDraw.Draw(img)

    # Keep the mark inside the maskable safe zone (centre 80%).
    half_h = s * 0.22
    half_w = s * 0.085
    gap = s * 0.105
    cy = s / 2

    for i, color in enumerate(COLORS):
        diamond(draw, cy + (i - 1) * gap * 2, cy, half_w, half_h, color)

    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    import os

    out = os.path.join(os.path.dirname(__file__), "..", "icons")
    os.makedirs(out, exist_ok=True)
    for size in SIZES:
        path = os.path.join(out, f"icon-{size}.png")
        build(size).save(path)
        print("wrote", os.path.normpath(path))
