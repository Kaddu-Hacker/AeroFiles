#!/usr/bin/env python3
"""Generate app-icon.png (512x512) — Prism Files logo, pure stdlib."""
import struct, zlib

W = H = 512
px = bytearray(W * H * 4)

def put(x, y, r, g, b, a=255):
    if 0 <= x < W and 0 <= y < H:
        i = (y * W + x) * 4
        px[i:i + 4] = bytes((r, g, b, a))

def rounded(bg1, bg2, radius=96):
    for y in range(H):
        for x in range(W):
            # corner mask
            dx = min(x, W - 1 - x) if x >= W - radius or x < radius else None
            dy = min(y, H - 1 - y) if y >= H - radius or y < radius else None
            if x < radius and y < radius:
                if (radius - x) ** 2 + (radius - y) ** 2 > radius * radius:
                    continue
            elif x < radius and y >= H - radius:
                if (radius - x) ** 2 + (y - (H - radius)) ** 2 > radius * radius:
                    continue
            elif x >= W - radius and y < radius:
                if (x - (W - radius)) ** 2 + (radius - y) ** 2 > radius * radius:
                    continue
            elif x >= W - radius and y >= H - radius:
                if (x - (W - radius)) ** 2 + (y - (H - radius)) ** 2 > radius * radius:
                    continue
            t = y / H
            put(x, y, int(bg1[0] + (bg2[0] - bg1[0]) * t),
                int(bg1[1] + (bg2[1] - bg1[1]) * t),
                int(bg1[2] + (bg2[2] - bg1[2]) * t))

def tri_edges(ax, ay, bx, by, cx, cy):
    def edge(p, q):
        (px_, py_), (qx, qy) = p, q
        return lambda x, y: (qx - px_) * (y - py_) - (qy - py_) * (x - px_)
    return edge((ax, ay), (bx, by)), edge((bx, by), (cx, cy)), edge((cx, cy), (ax, ay))

# background: deep indigo -> violet
rounded((24, 22, 52), (72, 38, 112))

# white glass prism triangle (filled, semi-translucent white)
e1, e2, e3 = tri_edges(150, 330, 256, 140, 362, 330)
for y in range(H):
    for x in range(W):
        d1, d2, d3 = e1(x, y), e2(x, y), e3(x, y)
        if (d1 >= 0 and d2 >= 0 and d3 >= 0) or (d1 <= 0 and d2 <= 0 and d3 <= 0):
            i = (y * W + x) * 4
            r, g, b, a = px[i], px[i + 1], px[i + 2], px[i + 3]
            f = 0.30 + 0.25 * (1 - y / H)          # top brighter
            px[i:i + 3] = bytes((min(255, int(r + (255 - r) * f)),
                                 min(255, int(g + (255 - g) * f)),
                                 min(255, int(b + (255 - b) * f))))

# spectrum beam: 5 colored bars fanning right of the prism
colors = [(255, 70, 98), (255, 160, 60), (255, 230, 80), (80, 220, 150), (90, 160, 255)]
for n, (r, g, b) in enumerate(colors):
    y0 = 190 + n * 34
    span = 90 + n * 26
    for y in range(y0, y0 + 20):
        for x in range(300, 300 + span):
            fade = 1.0 - (x - 300) / span
            put(x, y, int(r), int(g), int(b), int(230 * max(0.15, fade)))

def png(w, h, raw):
    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
    rows = b"".join(b"\x00" + raw[y * w * 4:(y + 1) * w * 4] for y in range(h))
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b"")

from pathlib import Path
out = Path(__file__).resolve().parent.parent / "app-icon.png"
out.write_bytes(png(W, H, bytes(px)))
print(f"written {out}")
