"""Genera la casa in pixel art (tile 64x32) -> assets/sprites/house.png

Il modello 3D della casa (muri, tetto a due falde, comignolo, finestre, porta,
gradino, vialetto e cespugli) viene "fotografato" pixel per pixel: per ogni
pixel si cerca la faccia più vicina e la si colora con una scala di toni
(ramp), come si fa nella pixel art a mano.

Foglio: 4 colonne (rotazioni 0..3) x 3 righe (varianti di colore).
Ogni cella è CELL_W x CELL_H; l'angolo in alto del tile è in (ANCHOR_X, ANCHOR_Y).

Uso:  python3 tools/sprites/house.py        (poi: node tools/sprites/build.js)
"""
import math, os
from PIL import Image

CELL_W, CELL_H = 64, 84
ANCHOR_X, ANCHOR_Y = 32, 52
D = (1.0, 1.0, 32.0)          # direzione di vista in (u, v, h px): stessi pixel sullo schermo

def hexc(h):
    h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

def ramp(*cols): return [hexc(c) for c in cols]

# ---------- Tavolozza (dal tono chiaro allo scuro) ----------
TRIM = ramp('#ffffff', '#f1f0ea', '#dcdad2', '#bfbcb2', '#9b988e', '#6e6b63')
GLASS = ramp('#e4f6ff', '#a9dcf2', '#74b4d8', '#4f8ab6', '#3a6a93', '#28496a')
WOOD = ramp('#b47b4e', '#98633b', '#7d4e2d', '#653d23', '#4d2d19', '#331d10')
STONE = ramp('#c4beb2', '#aaa398', '#918a7f', '#787267', '#5f5a51', '#47433c')
BRICK = ramp('#d0805f', '#b76546', '#9c5138', '#80412d', '#653223', '#4a2419')
SOOT = ramp('#4a4a4e', '#3c3c40', '#303034', '#26262a', '#1e1e22', '#161618')
LEAF = ramp('#9ad66a', '#76c04f', '#5aa53f', '#478a35', '#346b2a', '#244d1f')
PATH = ramp('#d9cfb8', '#c6bba2', '#b0a58b', '#968b72', '#7b715b', '#5f5745')
FLOWERS = [hexc('#ff8fb0'), hexc('#ffe066'), hexc('#ffffff'), hexc('#c890ff')]

VARIANTS = [
    dict(wall=ramp('#f8ebcf', '#ecd8b2', '#dbc29b', '#c3a680', '#a58967', '#7d664d'),
         roof=ramp('#e8735c', '#cf5641', '#b34333', '#933529', '#71281f', '#4e1b15'),
         shutter=ramp('#6fbf73', '#4f9f57', '#3c8044', '#2e6434', '#224a27', '#17331b')),
    dict(wall=ramp('#ffffff', '#eff1f3', '#dadfe4', '#bec5cd', '#9da6b1', '#747d89'),
         roof=ramp('#86a6d6', '#6585bd', '#4d6ca3', '#3c5687', '#2d4268', '#1f2f4b'),
         shutter=ramp('#7c8da6', '#5f718c', '#4a5a73', '#39465a', '#2a3443', '#1c232e')),
    dict(wall=ramp('#e3edd2', '#cfdeb8', '#b6c99c', '#9aaf81', '#7c9166', '#5d6f4c'),
         roof=ramp('#bd8a5f', '#a06e47', '#865839', '#6d462d', '#533523', '#3a2418'),
         shutter=ramp('#d9a35a', '#bd8640', '#9c6b31', '#7c5326', '#5c3d1c', '#3e2913')),
]

# ---------- Dimensioni (u, v in tile, h in pixel) ----------
U0, U1, V0, V1 = 0.12, 0.88, 0.16, 0.84      # muri
WALL_H, RIDGE_H = 24, 17                      # altezza muri, colmo sopra i muri
OV_E, OV_G = 0.06, 0.05                       # sporgenza del tetto: gronda e testate
VM = (V0 + V1) / 2
SLOPE = RIDGE_H / (VM - V0)                   # px di salita per tile
EAVE_H = WALL_H - SLOPE * OV_E                # quota della gronda
LIGHT = (0.35, 0.78, 0.52)

def norm(a):
    l = math.sqrt(sum(x * x for x in a)); return tuple(x / l for x in a)

LIGHT = norm(LIGHT)

def hsh(*a):
    h = 2166136261
    for x in a:
        h = ((h ^ (int(x) & 0xffffffff)) * 16777619) & 0xffffffff
    return (h % 1000) / 1000.0


class Face:
    """Parallelogramma O + a*A + b*B (a, b in 0..1); tex(a, b, hit) -> (ramp, tono) o None"""
    def __init__(self, O, A, B, n, tex, tri=False):
        self.O, self.A, self.B, self.n, self.tex, self.tri = O, A, B, n, tex, tri

    def hit(self, base):
        A, B = self.A, self.B
        # risolve O + aA + bB = base + tD
        m = [[A[i], B[i], -D[i]] for i in range(3)]
        r = [base[i] - self.O[i] for i in range(3)]
        det = det3(m)
        if abs(det) < 1e-9: return None
        a = det3(col(m, 0, r)) / det; b = det3(col(m, 1, r)) / det; t = det3(col(m, 2, r)) / det
        if not (-1e-6 <= a <= 1 + 1e-6 and -1e-6 <= b <= 1 + 1e-6): return None
        if self.tri and b > 1 - abs(2 * a - 1) + 1e-6: return None
        return t, a, b


class Blob:
    """Cespuglio: ellissoide con foglie"""
    def __init__(self, C, r, rh, seed):
        self.C, self.r, self.rh, self.seed = C, r, rh, seed

    def hit(self, base):
        s = (self.r, self.r, self.rh)
        p = [(base[i] - self.C[i]) / s[i] for i in range(3)]
        d = [D[i] / s[i] for i in range(3)]
        A = sum(x * x for x in d); B = 2 * sum(p[i] * d[i] for i in range(3)); Cc = sum(x * x for x in p) - 1
        disc = B * B - 4 * A * Cc
        if disc < 0: return None
        t = (-B + math.sqrt(disc)) / (2 * A)
        q = [p[i] + d[i] * t for i in range(3)]
        if q[2] < -0.35: return None      # tagliato in basso (appoggiato a terra)
        return t, q


def det3(m):
    return (m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
            - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
            + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]))

def col(m, k, r):
    return [[r[i] if j == k else m[i][j] for j in range(3)] for i in range(3)]

def shade_tone(n, bias=0):
    s = 0.25 + 0.75 * max(0.0, sum(n[i] * LIGHT[i] for i in range(3)))
    return max(0, min(5, round((1 - s) * 6) + bias))


def build_model(var):
    V = VARIANTS[var]
    W, R, SH = V['wall'], V['roof'], V['shutter']
    faces = []
    L = (U1 - U0) * 32          # lunghezza dei muri lunghi in colonne di pixel
    Dp = (V1 - V0) * 32         # muri di testata

    def window(c, r, c0, r0, shutters=True):
        """finestra 6x8 con cornice, croce, riflesso e persiane; None se fuori"""
        x, y = c - c0, r - r0
        if shutters and (-2 <= x < 0 or 6 <= x < 8) and 0 <= y < 8:
            return (SH, 1 if (y % 2) else 0)
        if not (0 <= x < 6 and -1 <= y < 8): return None
        if y == -1: return (TRIM, 2)                         # davanzale
        if x in (0, 5) or y in (0, 7): return (TRIM, 0)      # cornice
        if x == 3 or y == 4: return (TRIM, 1)                # croce
        if (x, y) in ((1, 6), (1, 5), (2, 6)): return (GLASS, 0)
        return (GLASS, 2 if y > 4 else 3)

    def door(c, r, c0):
        x, y = c - c0, r
        if not (0 <= x < 7 and 2 <= y < 17): return None
        if x in (0, 6) or y == 16: return (TRIM, 1)          # cornice
        if 13 <= y <= 14 and 2 <= x <= 4: return (GLASS, 1)  # vetrino
        if x == 4 and y == 8: return (hexc('#f2d14a'),)      # maniglia
        if x == 3 or y in (11, 6): return (WOOD, 3)          # pannelli
        return (WOOD, 1 if x < 3 else 2)

    def siding(c, r, length, base_tone, extra):
        if r < 3:                                            # zoccolo di pietra
            stagger = 2 if r == 1 else 0
            return (STONE, base_tone + (1 if (int(c) + stagger) % 5 == 0 or r == 2 else 0))
        if c < 1.5 or c > length - 1.5: return (TRIM, base_tone)   # spigoli
        if extra:
            e = extra(c, r)
            if e: return e if len(e) == 1 else (e[0], min(5, e[1] + base_tone // 2))
        if r >= WALL_H - 1.2: return (W, min(5, base_tone + 2))    # ombra sotto la gronda
        tone = base_tone + (1 if int(r) % 3 == 0 else 0)
        if hsh(int(c), int(r) // 3, var) > 0.93: tone += 1        # assi un po' irregolari
        return (W, min(5, tone))

    def wall_tex(kind):
        def tex(a, b, hit, n):
            bt = shade_tone(n, -1)
            if kind == 'front':
                c = a * L
                ex = lambda c, r: door(c, r, L / 2 - 3.5) or window(c, r, 4.5, 8) or window(c, r, L - 10.5, 8)
            elif kind == 'back':
                c = a * L
                ex = lambda c, r: window(c, r, 5, 8) or window(c, r, L - 11, 8)
            else:
                c = a * Dp
                ex = lambda c, r: window(c, r, Dp / 2 - 3, 8)
            return siding(c, hit[2], L if kind != 'side' else Dp, bt, ex)
        return tex

    def gable_tex(a, b, hit, n):
        bt = shade_tone(n, -1)
        c, r = a * Dp, hit[2]
        x, y = c - Dp / 2, r - (WALL_H + 7)
        if -2.5 <= x <= 2.5 and -2.5 <= y <= 2.5:              # finestrella tonda in soffitta
            d = x * x + y * y
            if d <= 2.6: return (GLASS, 1 if x < 0 and y > 0 else 3)
            if d <= 6.6: return (TRIM, 0)
        tone = bt + (1 if int(r) % 3 == 0 else 0)
        return (W, min(5, tone))

    def roof_tex(a, b, hit, n):
        bt = shade_tone(n)
        c = a * (L / (U1 - U0) * (U1 - U0 + 2 * OV_G))
        rows = 7
        row = min(rows - 1, int(b * rows)); fr = b * rows - row
        if b > 0.95: return (R, max(0, bt - 1)) if int(c) % 4 else (R, bt + 1)   # colmo
        if a < 0.035 or a > 0.965: return (TRIM, bt + 1)                         # testate
        if fr < 0.22: return (R, min(5, bt + 2))                                 # ombra tra le file
        if (int(c) + row * 3) % 6 == 0: return (R, min(5, bt + 1))                # giunti delle tegole
        tone = bt + (1 if hsh(int(c) // 6 + row * 7, row, var) > 0.85 else 0)
        if fr > 0.8 and (int(c) + row * 3) % 6 == 1: tone = max(0, tone - 1)     # luce sul bordo
        return (R, min(5, tone))

    def trim_tex(bias):
        return lambda a, b, hit, n: (TRIM, shade_tone(n, bias))

    def brick_tex(a, b, hit, n):
        bt = shade_tone(n, -1)
        r = hit[2]; c = a * 5
        if r > CH_TOP - 2.5: return (STONE, bt + 1)              # cappello di pietra
        if int(r) % 3 == 0: return (STONE, bt + 2)               # malta
        if (int(c * 1.6) + (int(r) // 3) * 2) % 4 == 0: return (BRICK, bt + 2)
        return (BRICK, bt + (1 if hsh(int(c), int(r) // 3, 3) > 0.7 else 0))

    def path_tex(a, b, hit, n):
        x, y = int(a * 6), int(b * 8)
        if hsh(x, y, 11) > 0.72: return (PATH, 3)
        return (PATH, 1 if (x + y) % 3 else 2)

    def add(O, A, B, n, tex, tri=False): faces.append(Face(O, A, B, n, tex, tri))

    def box(u0, v0, u1, v1, h0, h1, tex):
        add((u0, v1, h0), (u1 - u0, 0, 0), (0, 0, h1 - h0), (0, 1, 0), tex)      # +v
        add((u0, v0, h0), (u1 - u0, 0, 0), (0, 0, h1 - h0), (0, -1, 0), tex)     # -v
        add((u1, v0, h0), (0, v1 - v0, 0), (0, 0, h1 - h0), (1, 0, 0), tex)      # +u
        add((u0, v0, h0), (0, v1 - v0, 0), (0, 0, h1 - h0), (-1, 0, 0), tex)     # -u
        add((u0, v0, h1), (u1 - u0, 0, 0), (0, v1 - v0, 0), (0, 0, 1), tex)      # sopra

    # muri: davanti (+v, con la porta), dietro, testate
    add((U0, V1, 0), (U1 - U0, 0, 0), (0, 0, WALL_H), (0, 1, 0), wall_tex('front'))
    add((U0, V0, 0), (U1 - U0, 0, 0), (0, 0, WALL_H), (0, -1, 0), wall_tex('back'))
    add((U1, V0, 0), (0, V1 - V0, 0), (0, 0, WALL_H), (1, 0, 0), wall_tex('side'))
    add((U0, V0, 0), (0, V1 - V0, 0), (0, 0, WALL_H), (-1, 0, 0), wall_tex('side'))
    # timpani (triangoli sopra le testate)
    add((U1, V0, WALL_H), (0, V1 - V0, 0), (0, 0, RIDGE_H), (1, 0, 0), gable_tex, tri=True)
    add((U0, V0, WALL_H), (0, V1 - V0, 0), (0, 0, RIDGE_H), (-1, 0, 0), gable_tex, tri=True)
    # falde del tetto (dalla gronda al colmo) + bordo della gronda e delle testate
    ua, ub = U0 - OV_G, U1 + OV_G
    rise = WALL_H + RIDGE_H - EAVE_H
    nf, nb = norm((0, SLOPE / 32, 1)), norm((0, -SLOPE / 32, 1))
    add((ua, V1 + OV_E, EAVE_H), (ub - ua, 0, 0), (0, VM - V1 - OV_E, rise), nf, roof_tex)
    add((ua, V0 - OV_E, EAVE_H), (ub - ua, 0, 0), (0, VM - V0 + OV_E, rise), nb, roof_tex)
    add((ua, V1 + OV_E, EAVE_H - 2), (ub - ua, 0, 0), (0, 0, 2), (0, 1, 0), trim_tex(0))
    add((ua, V0 - OV_E, EAVE_H - 2), (ub - ua, 0, 0), (0, 0, 2), (0, -1, 0), trim_tex(0))
    for u, nu in ((ub, 1), (ua, -1)):
        for v, dv in ((V1 + OV_E, VM - V1 - OV_E), (V0 - OV_E, VM - V0 + OV_E)):
            add((u, v, EAVE_H - 2), (0, dv, rise), (0, 0, 2), (nu, 0, 0), trim_tex(0))
    # comignolo sulla falda dietro
    global CH_TOP
    CH_TOP = WALL_H + RIDGE_H + 7
    box(U1 - 0.24, VM - 0.15, U1 - 0.12, VM - 0.03, WALL_H, CH_TOP, brick_tex)
    faces[-1].tex = lambda a, b, hit, n: (SOOT, 3 if 0.25 < a < 0.75 and 0.25 < b < 0.75 else 1)
    # gradino davanti alla porta e vialetto
    um = (U0 + U1) / 2
    box(um - 0.11, V1, um + 0.11, V1 + 0.07, 0, 2.5, lambda a, b, hit, n: (STONE, shade_tone(n, -1)))
    add((um - 0.08, V1 + 0.07, 0.4), (0.16, 0, 0), (0, 1 - V1 - 0.07, 0), (0, 0, 1), path_tex)
    blobs = [Blob((U0 + 0.12, V1 + 0.07, 3.5), 0.085, 6, 1), Blob((U1 - 0.1, V1 + 0.08, 3), 0.075, 5, 2),
             Blob((U1 + 0.06, V0 + 0.3, 3), 0.065, 5, 3)]
    return faces, blobs


ROT = {0: lambda u, v: (u, v), 1: lambda u, v: (1 - v, u), 2: lambda u, v: (1 - u, 1 - v), 3: lambda u, v: (v, 1 - u)}
ROTV = {0: lambda u, v: (u, v), 1: lambda u, v: (-v, u), 2: lambda u, v: (-u, -v), 3: lambda u, v: (v, -u)}

def rotated(faces, blobs, r):
    out = []
    for f in faces:
        O = ROT[r](f.O[0], f.O[1]) + (f.O[2],)
        A = ROTV[r](f.A[0], f.A[1]) + (f.A[2],)
        B = ROTV[r](f.B[0], f.B[1]) + (f.B[2],)
        n = ROTV[r](f.n[0], f.n[1]) + (f.n[2],)
        out.append(Face(O, A, B, n, f.tex, f.tri))
    bl = [Blob(ROT[r](b.C[0], b.C[1]) + (b.C[2],), b.r, b.rh, b.seed) for b in blobs]
    return out, bl


def render(var, r):
    faces, blobs = rotated(*build_model(var), r)
    px = {}
    for Y in range(CELL_H):
        for X in range(CELL_W):
            sx, sy = X - ANCHOR_X + 0.5, Y - ANCHOR_Y + 0.5
            base = ((sx / 32 + sy / 16) / 2, (sy / 16 - sx / 32) / 2, 0.0)
            best = None
            for i, f in enumerate(faces):
                h = f.hit(base)
                if h and (best is None or h[0] > best[0]): best = (h[0], 'f', i, h)
            for j, bl in enumerate(blobs):
                h = bl.hit(base)
                if h and (best is None or h[0] > best[0]): best = (h[0], 'b', j, h)
            if not best: continue
            if best[1] == 'f':
                f = faces[best[2]]; t, a, b = best[3]
                hit = tuple(base[k] + t * D[k] for k in range(3))
                res = f.tex(a, b, hit, f.n)
                if res is None: continue
                color = res[0] if len(res) == 1 else res[0][max(0, min(5, res[1]))]
                px[(X, Y)] = (color, ('f', best[2]))
            else:
                bl = blobs[best[2]]; t, q = best[3]
                n = norm((q[0], q[1], q[2] * 0.8))
                tone = shade_tone(n, -1) + (1 if hsh(X, Y, bl.seed) > 0.7 else 0)
                color = LEAF[max(0, min(5, tone))]
                if hsh(X * 3, Y * 5, bl.seed) > 0.9 and q[2] > -0.1:
                    color = FLOWERS[int(hsh(X, Y, 77) * 4) % 4]
                px[(X, Y)] = (color, ('b', best[2]))
    # contorno scuro sul bordo della sagoma (pixel art "selettiva")
    img = Image.new('RGBA', (CELL_W, CELL_H), (0, 0, 0, 0))
    for (X, Y), (color, fid) in px.items():
        edge = any((X + dx, Y + dy) not in px for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
        if edge and fid[0] == 'f' and Y < ANCHOR_Y + 30:
            color = tuple(int(c * 0.55) for c in color)
        elif edge and fid[0] == 'b':
            color = LEAF[5]
        img.putpixel((X, Y), color + (255,))
    return img


def main():
    out = os.path.join(os.path.dirname(__file__), '..', '..', 'assets', 'sprites', 'house.png')
    sheet = Image.new('RGBA', (CELL_W * 4, CELL_H * len(VARIANTS)), (0, 0, 0, 0))
    for var in range(len(VARIANTS)):
        for r in range(4):
            sheet.paste(render(var, r), (r * CELL_W, var * CELL_H))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    sheet.save(out)
    print('scritto', os.path.normpath(out))


if __name__ == '__main__':
    main()
