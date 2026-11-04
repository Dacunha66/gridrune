# Usage: python3 scripts/gen-stone-wall.py src/assets/stone-wall.webp preview.png
# Procedural "old stone wall with runes" background for GridRune (own artwork, no external assets).
import sys, math, random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H = 1080, 2340
rng = np.random.default_rng(7)
random.seed(7)

def fbm(w, h, octaves=6, base=4):
    out = np.zeros((h, w), np.float32)
    amp, total = 1.0, 0.0
    for o in range(octaves):
        n = base * 2 ** o
        small = rng.random((max(2, int(h / w * n)) + 1, n + 1)).astype(np.float32)
        layer = np.asarray(Image.fromarray((small * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC), np.float32) / 255
        out += layer * amp
        total += amp
        amp *= 0.55
    return out / total

stone_noise = fbm(W, H, 7, 6)
fine = fbm(W, H, 5, 40)
crack_noise = fbm(W, H, 5, 12)
grain = rng.random((H, W)).astype(np.float32)

# Blocks: staggered rows of irregular stones.
block_id = np.zeros((H, W), np.int32)
edge = np.full((H, W), 99.0, np.float32)   # distance to the nearest mortar line
shade = np.zeros((H, W), np.float32)       # bevel light (top/left light, bottom/right dark)
tone = np.zeros((H, W), np.float32)
blocks = []
y = -40
bid = 1
while y < H:
    rh = random.randint(170, 260)
    x = -random.randint(0, 200)
    while x < W:
        bw = random.randint(240, 460)
        x0, x1, y0, y1 = max(0, x), min(W, x + bw), max(0, y), min(H, y + rh)
        if x1 > x0 and y1 > y0:
            yy, xx = np.mgrid[y0:y1, x0:x1]
            d = np.minimum.reduce([xx - x, (x + bw) - xx, yy - y, (y + rh) - yy]).astype(np.float32)
            # slightly irregular edges
            d += (crack_noise[y0:y1, x0:x1] - 0.5) * 26
            edge[y0:y1, x0:x1] = d
            t = random.uniform(-0.12, 0.1)
            tone[y0:y1, x0:x1] = t
            # soft light from the top left across each stone
            bev = 0.6 - ((yy - y) / rh) * 0.8 - ((xx - x) / bw) * 0.3 + np.clip(1 - d / 18, 0, 1) * 0.5 * np.sign(0.5 - (yy - y) / rh)
            shade[y0:y1, x0:x1] = bev
            blocks.append((x, y, bw, rh))
        x += bw
        bid += 1
    y += rh

mortar = np.clip(1 - (edge - 3) / 6, 0, 1)  # 1 inside the joint
pits = np.clip((fine - 0.62) * 6, 0, 1)
cracks = np.clip(1 - np.abs(crack_noise - 0.5) * 90, 0, 1) * (crack_noise > 0.3)
lum = 0.40 + (stone_noise - 0.5) * 0.7 + (fine - 0.5) * 0.35 + tone + (grain - 0.5) * 0.12 + shade * 0.12 - pits * 0.18 - cracks * 0.22
lum = lum * (1 - mortar) + (0.05 + (fine - 0.5) * 0.08) * mortar
lum = np.clip(lum, 0, 1)

# Ink-blue stone colour.
base = np.array([46, 56, 80], np.float32) / 255
hi = np.array([96, 106, 128], np.float32) / 255
img = (base[None, None, :] * (1 - lum[..., None]) * 0.9 + hi[None, None, :] * lum[..., None]) * 255

# Runes (Elder Futhark-like strokes in a 0..1 box).
RUNES = {
    'fehu': [((0.3, 0), (0.3, 1)), ((0.3, 0.2), (0.75, 0)), ((0.3, 0.45), (0.75, 0.25))],
    'raido': [((0.3, 0), (0.3, 1)), ((0.3, 0), (0.7, 0.22)), ((0.7, 0.22), (0.3, 0.45)), ((0.3, 0.45), (0.72, 1))],
    'othala': [((0.5, 0), (0.15, 0.4)), ((0.5, 0), (0.85, 0.4)), ((0.15, 0.4), (0.85, 0.75)), ((0.85, 0.4), (0.15, 0.75)), ((0.15, 0.75), (0, 1)), ((0.85, 0.75), (1, 1))],
    'algiz': [((0.5, 0.15), (0.5, 1)), ((0.5, 0.45), (0.15, 0.05)), ((0.5, 0.45), (0.85, 0.05))],
    'thurisaz': [((0.3, 0), (0.3, 1)), ((0.3, 0.25), (0.7, 0.5)), ((0.7, 0.5), (0.3, 0.75))],
    'ansuz': [((0.3, 0), (0.3, 1)), ((0.3, 0.05), (0.72, 0.3)), ((0.3, 0.3), (0.72, 0.55))],
    'sowilo': [((0.7, 0), (0.3, 0.35)), ((0.3, 0.35), (0.7, 0.65)), ((0.7, 0.65), (0.3, 1))],
    'tiwaz': [((0.5, 0), (0.5, 1)), ((0.5, 0), (0.15, 0.3)), ((0.5, 0), (0.85, 0.3))],
    'dagaz': [((0.1, 0), (0.1, 1)), ((0.9, 0), (0.9, 1)), ((0.1, 0), (0.9, 1)), ((0.9, 0), (0.1, 1))],
    'ingwaz': [((0.5, 0), (0.95, 0.5)), ((0.95, 0.5), (0.5, 1)), ((0.5, 1), (0.05, 0.5)), ((0.05, 0.5), (0.5, 0))],
}
groove = Image.new('L', (W, H), 0)
glow = Image.new('L', (W, H), 0)
gd, gl = ImageDraw.Draw(groove), ImageDraw.Draw(glow)
chosen = random.sample([b for b in blocks if 60 < b[1] < H - 300 and 40 < b[0] < W - 260], 7)
names = list(RUNES)
for i, (x, y, bw, rh) in enumerate(chosen):
    s = min(bw, rh) * 0.42
    cx, cy = x + bw / 2 + random.uniform(-20, 20), y + rh / 2
    strokes = RUNES[names[i % len(names)]]
    lit = i in (0, 3, 5)
    for (a, b) in strokes:
        p0 = (cx + (a[0] - 0.5) * s * 0.8, cy + (a[1] - 0.5) * s)
        p1 = (cx + (b[0] - 0.5) * s * 0.8, cy + (b[1] - 0.5) * s)
        gd.line([p0, p1], fill=255, width=8)
        if lit:
            gl.line([p0, p1], fill=255, width=7)

g = np.asarray(groove.filter(ImageFilter.GaussianBlur(1.2)), np.float32) / 255
g_shift = np.roll(g, 3, axis=0)
img = img * (1 - g[..., None] * 0.45) + np.array([110, 120, 140]) * np.clip(g_shift - g, 0, 1)[..., None] * 0.3

core = np.asarray(glow.filter(ImageFilter.GaussianBlur(1.5)), np.float32) / 255
halo = np.asarray(glow.filter(ImageFilter.GaussianBlur(18)), np.float32) / 255
cyan = np.array([69, 227, 207], np.float32)
img = img * (1 - core[..., None] * 0.7) + cyan * core[..., None] * 0.7
img = img + cyan * np.clip(halo * 1.4, 0, 1)[..., None] * 0.28

# Vignette and a darker middle band so menus stay readable.
yy, xx = np.mgrid[0:H, 0:W]
v = 1 - 0.55 * (((xx - W / 2) / (W * 0.75)) ** 2 + ((yy - H * 0.45) / (H * 0.7)) ** 2)
img = img * np.clip(v, 0.25, 1)[..., None] * 0.7

out = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
out.save(sys.argv[1], 'WEBP', quality=68, method=6)
out.resize((390, 845)).save(sys.argv[2])
print('ok')
