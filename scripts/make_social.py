#!/usr/bin/env python3
"""Generate social-preview.png (1280x640) — AeroFiles banner, pure stdlib."""
import struct, zlib
from pathlib import Path

W, H = 1280, 640
px = bytearray(W * H * 4)

def put(x, y, r, g, b, a=255):
    if 0 <= x < W and 0 <= y < H:
        i = (y * W + x) * 4
        px[i:i + 4] = bytes((r, g, b, a))

# background gradient with soft radial glow behind the prism
BG1, BG2 = (18, 16, 44), (86, 42, 130)
for y in range(H):
    for x in range(W):
        t = y / H
        r = BG1[0] + (BG2[0] - BG1[0]) * t
        g = BG1[1] + (BG2[1] - BG1[1]) * t
        b = BG1[2] + (BG2[2] - BG1[2]) * t
        # glow centered near prism apex
        dx, dy = x - 430, y - 190
        d2 = (dx * dx + dy * dy) / (560 * 560)
        glow = max(0.0, 1.0 - d2) * 0.35
        put(x, y, min(255, int(r + 90 * glow)), min(255, int(g + 80 * glow)),
            min(255, int(b + 150 * glow)))

# prism triangle (apex left-of-center, beam fans right)
AX, AY, BX, BY, CX, CY = 240, 470, 430, 130, 620, 470
def edge(p, q):
    (px_, py_), (qx, qy) = p, q
    return lambda x, y: (qx - px_) * (y - py_) - (qy - py_) * (x - px_)
e1, e2, e3 = edge((AX, AY), (BX, BY)), edge((BX, BY), (CX, CY)), edge((CX, CY), (AX, AY))
for y in range(H):
    for x in range(W):
        d1, d2, d3 = e1(x, y), e2(x, y), e3(x, y)
        if (d1 >= 0 and d2 >= 0 and d3 >= 0) or (d1 <= 0 and d2 <= 0 and d3 <= 0):
            i = (y * W + x) * 4
            r, g, b = px[i], px[i + 1], px[i + 2]
            f = 0.34 + 0.28 * (1 - (y - 130) / 340)
            px[i:i + 3] = bytes((min(255, int(r + (255 - r) * f)),
                                 min(255, int(g + (255 - g) * f)),
                                 min(255, int(b + (255 - b) * f))))

# spectrum beam
colors = [(255, 70, 98), (255, 160, 60), (255, 230, 80), (80, 220, 150), (90, 160, 255)]
for n, (r, g, b) in enumerate(colors):
    y0 = 240 + n * 52
    span = 190 + n * 58
    for y in range(y0, y0 + 34):
        for x in range(560, 560 + span):
            fade = 1.0 - (x - 560) / span
            put(x, y, int(r), int(g), int(b), int(225 * max(0.12, fade)))

def png(w, h, raw):
    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
    rows = b"".join(b"\x00" + raw[y * w * 4:(y + 1) * w * 4] for y in range(h))
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b"")

out = Path(__file__).resolve().parent.parent / "social-preview.png"
out.write_bytes(png(W, H, bytes(px)))
print(f"written {out}")
