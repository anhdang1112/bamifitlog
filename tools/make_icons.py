"""Generate PWA icons (run once: python tools/make_icons.py)."""
from PIL import Image, ImageDraw
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "icons")
BG, FG = (7, 11, 20), (249, 168, 37)


def draw(size, maskable):
    S = 4  # supersample
    n = size * S
    img = Image.new("RGB", (n, n), BG)
    d = ImageDraw.Draw(img)
    # maskable icons keep content inside the central 80% safe zone
    k = 0.62 if maskable else 0.78
    c = n / 2
    u = n * k / 100  # 1 unit = 1% of content box
    def rect(x0, y0, x1, y1, r=0):
        d.rounded_rectangle([c + x0 * u, c + y0 * u, c + x1 * u, c + y1 * u], radius=r * u, fill=FG)
    rect(-34, -4, 34, 4, 2)              # bar
    rect(-44, -22, -34, 22, 3)           # inner plates
    rect(34, -22, 44, 22, 3)
    rect(-54, -14, -44, 14, 3)           # outer plates
    rect(44, -14, 54, 14, 3)
    return img.resize((size, size), Image.LANCZOS)


for name, size, mask in [("icon-192.png", 192, False), ("icon-512.png", 512, False), ("icon-maskable-512.png", 512, True)]:
    draw(size, mask).save(os.path.join(OUT, name))
    print("wrote", name)
