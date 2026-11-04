"""Genera auto e furgoni in pixel art (tile 64x32) -> assets/sprites/vehicles.png

Come per la casa: un piccolo modello 3D "fotografato" pixel per pixel con scale di toni.
Foglio: 4 colonne (direzione di marcia 0..3, come DIRS del gioco) x 3 righe
(berlina, utilitaria, furgone). Ogni cella è CELL_W x CELL_H; il centro del veicolo a terra
è in (ANCHOR_X, ANCHOR_Y).

La carrozzeria delle auto e la striscia del furgone sono disegnate con un colore "maschera"
(rosso 255, verde 0, blu = tono x 40): il gioco le ricolora con il colore di ogni veicolo.

Uso:  python3 tools/sprites/vehicles.py        (poi: node tools/sprites/build.js)
"""
import math, os, sys
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from house import Face, norm, hexc, ramp, hsh, LIGHT   # stessi strumenti della casa

CELL_W, CELL_H = 40, 32
ANCHOR_X, ANCHOR_Y = 20, 22
D = (1.0, 1.0, 32.0)

MASK = [(255, 0, k * 40) for k in range(6)]            # carrozzeria: la ricolora il gioco
GLASS = ramp('#d8f0fb', '#a3d3ea', '#6fa9cf', '#4a7fa8', '#355f82', '#233f5a')
TYRE = ramp('#4a4a50', '#3a3a40', '#2c2c32', '#222226', '#1a1a1e', '#121215')
CHROME = ramp('#f2f4f6', '#d6dade', '#b4b9bf', '#8d939a', '#6b7178', '#4c5157')
WHITE = ramp('#ffffff', '#f1f2f4', '#dcdfe4', '#c0c5cc', '#9da3ab', '#767c85')
HEAD = hexc('#fff6c8')
TAIL = hexc('#e83a3a')


def shade_tone(n, bias=0):
    s = 0.3 + 0.7 * max(0.0, sum(n[i] * LIGHT[i] for i in range(3)))
    return max(0, min(5, round((1 - s) * 6) + bias))


def quad(faces, O, A, B, n, tex):
    faces.append(Face(O, A, B, n, tex))


def box(faces, u0, v0, u1, v1, h0, h1, tex, top=True):
    quad(faces, (u0, v1, h0), (u1 - u0, 0, 0), (0, 0, h1 - h0), (0, 1, 0), tex('side', +1))
    quad(faces, (u0, v0, h0), (u1 - u0, 0, 0), (0, 0, h1 - h0), (0, -1, 0), tex('side', -1))
    quad(faces, (u1, v0, h0), (0, v1 - v0, 0), (0, 0, h1 - h0), (1, 0, 0), tex('front', 0))
    quad(faces, (u0, v0, h0), (0, v1 - v0, 0), (0, 0, h1 - h0), (-1, 0, 0), tex('back', 0))
    if top: quad(faces, (u0, v0, h1), (u1 - u0, 0, 0), (0, v1 - v0, 0), (0, 0, 1), tex('top', 0))


def wheels(faces, us, vw, r=4.5):
    """ruote: dischi scuri sui fianchi (cerchio nel parallelogramma), con il cerchione chiaro"""
    for u in us:
        for side in (+1, -1):
            v = vw * side
            def tex(a, b, hit, n, u=u):
                x, y = a - 0.5, b - 0.5
                d = x * x + y * y
                if d > 0.25: return None
                if d < 0.05: return (CHROME, 2)
                return (TYRE, shade_tone(n, 0))
            quad(faces, (u - 0.06, v, 0), (0.12, 0, 0), (0, 0, r * 2), (0, side, 0), tex)


def car_model(kind):
    faces = []
    if kind == 'van':
        L0, L1, W = -0.26, 0.26, 0.125
    elif kind == 'hatch':
        L0, L1, W = -0.17, 0.17, 0.105
    else:
        L0, L1, W = -0.21, 0.21, 0.11
    lower, belt = 2.5, 7.5

    def body(part, side):
        def tex(a, b, hit, n):
            bt = shade_tone(n, -1)
            h = hit[2]
            if kind == 'van' and part != 'front' and hit[0] < L1 - 0.17:   # cassone bianco con la striscia
                if part == 'top': return (WHITE, bt)
                if part == 'side' and 9 <= h <= 11.5: return (MASK, bt)
                if h < 3.4: return (TYRE, 2)
                return (WHITE, bt + (1 if int(h) % 5 == 0 and part == 'side' else 0))
            if h < 3.4 and part != 'top': return (TYRE, 1)                 # paraurti / sottoscocca
            if part == 'front' and 4.5 <= h <= 6.2:
                return (HEAD,) if abs(abs(local_v(hit)) - W * 0.7) < W * 0.2 else (CHROME, 3)
            if part == 'back' and 4.5 <= h <= 6.2 and abs(abs(local_v(hit)) - W * 0.7) < W * 0.2: return (TAIL,)
            if part == 'side' and kind != 'van':
                lu = local_u(hit)
                if abs(lu - (L0 + L1) / 2 + 0.01) < 0.006 and h > 3.5: return (MASK, min(5, bt + 2))   # riga della portiera
                if abs(lu - 0.02) < 0.012 and 5.8 < h < 6.6: return (CHROME, 1)                       # maniglia
            return (MASK, bt)
        return tex

    box(faces, L0, -W, L1, W, lower, belt, body)
    wheels(faces, [L0 + 0.075, L1 - 0.075], W + 0.001, 3.6)

    # abitacolo: vetri sui fianchi, montanti color carrozzeria, tetto
    if kind == 'van':
        c0, c1, ch, cw = L1 - 0.17, L1 - 0.02, 13.0, W - 0.01
        cargo = (L0, -W, L1 - 0.17, W, belt, 16.5)
    elif kind == 'hatch':
        c0, c1, ch, cw = L0 + 0.02, L1 - 0.09, 12.0, W - 0.012
        cargo = None
    else:
        c0, c1, ch, cw = L0 + 0.08, L1 - 0.1, 12.0, W - 0.012
        cargo = None

    def cabin(part, side):
        def tex(a, b, hit, n):
            bt = shade_tone(n, -1)
            lu, h = local_u(hit), hit[2]
            if part == 'top': return (MASK, max(0, bt - 1)) if kind != 'van' else (MASK, max(0, bt - 1))
            if part in ('front', 'back'):
                if h > ch - 1.2 or h < belt + 0.8: return (MASK, bt)
                return (GLASS, 1 if part == 'front' else 3)
            # fianchi: due finestrini separati da un montante
            if h > ch - 1.0 or h < belt + 0.9: return (MASK, bt)
            if abs(lu - c0) < 0.02 or abs(lu - c1) < 0.02: return (MASK, bt)
            if kind != 'van' and abs(lu - (c0 + c1) / 2) < 0.012: return (MASK, bt + 1)
            hl = (lu - c0) / (c1 - c0)
            return (GLASS, 1 if (h - belt) > (ch - belt) * 0.6 - hl * 2 else 3)
        return tex

    box(faces, c0, -cw, c1, cw, belt, ch, cabin)
    if cargo:
        def cargo_tex(part, side):
            def tex(a, b, hit, n):
                bt = shade_tone(n, -1)
                h = hit[2]
                if part == 'side' and 9 <= h <= 11.5: return (MASK, bt)
                if part == 'back' and abs(local_v(hit)) < 0.004: return (WHITE, bt + 2)   # fessura delle porte
                return (WHITE, bt + (1 if part == 'side' and int(local_u(hit) * 100) % 9 == 0 else 0))
            return tex
        box(faces, *cargo, cargo_tex)
    return faces


# ---------- rotazione: il modello guarda verso +u; dir = direzione di marcia come DIRS del gioco
# DIRS: 0 = (0,-1), 1 = (1,0), 2 = (0,1), 3 = (-1,0)
DIRV = [1, 0]
ROT = {1: lambda u, v: (u, v), 2: lambda u, v: (-v, u), 3: lambda u, v: (-u, -v), 0: lambda u, v: (v, -u)}
INV = {1: lambda u, v: (u, v), 2: lambda u, v: (v, -u), 3: lambda u, v: (-u, -v), 0: lambda u, v: (-v, u)}
CUR = {'r': 1}
def local_u(hit): return INV[CUR['r']](hit[0], hit[1])[0]
def local_v(hit): return INV[CUR['r']](hit[0], hit[1])[1]


def rotated(faces, r):
    out = []
    for f in faces:
        O = ROT[r](f.O[0], f.O[1]) + (f.O[2],)
        A = ROT[r](f.A[0], f.A[1]) + (f.A[2],)
        B = ROT[r](f.B[0], f.B[1]) + (f.B[2],)
        n = ROT[r](f.n[0], f.n[1]) + (f.n[2],)
        out.append(Face(O, A, B, n, f.tex, f.tri))
    return out


def render(kind, r):
    CUR['r'] = r
    faces = rotated(car_model(kind), r)
    img = Image.new('RGBA', (CELL_W, CELL_H), (0, 0, 0, 0))
    px = {}
    for Y in range(CELL_H):
        for X in range(CELL_W):
            sx, sy = X - ANCHOR_X + 0.5, Y - ANCHOR_Y + 0.5
            base = ((sx / 32 + sy / 16) / 2, (sy / 16 - sx / 32) / 2, 0.0)
            hits = []
            for f in faces:
                h = f.hit(base)
                if h: hits.append((h[0], f, h))
            hits.sort(key=lambda z: -z[0])
            for t, f, h in hits:
                _, a, b = h
                hit = tuple(base[k] + t * D[k] for k in range(3))
                res = f.tex(a, b, hit, f.n)
                if res is None: continue
                color = res[0] if len(res) == 1 else res[0][max(0, min(5, res[1]))]
                px[(X, Y)] = color
                break
    # ombra a terra sotto il veicolo
    L = 0.3 if kind == 'van' else 0.24
    for Y in range(CELL_H):
        for X in range(CELL_W):
            if (X, Y) in px: continue
            sx, sy = X - ANCHOR_X + 0.5, Y - ANCHOR_Y + 0.5
            u, v = (sx / 32 + sy / 16) / 2, (sy / 16 - sx / 32) / 2
            lu, lv = INV[r](u, v)
            if (lu / L) ** 2 + (lv / 0.15) ** 2 < 1: img.putpixel((X, Y), (0, 0, 0, 60))
    for (X, Y), color in px.items():
        edge = any((X + dx, Y + dy) not in px for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
        if edge:
            if color[0] == 255 and color[1] == 0: color = (255, 0, min(200, color[2] + 120))   # maschera: tono più scuro
            else: color = tuple(int(c * 0.55) for c in color)
        img.putpixel((X, Y), color + (255,))
    return img


def main():
    out = os.path.join(os.path.dirname(__file__), '..', '..', 'assets', 'sprites', 'vehicles.png')
    kinds = ['sedan', 'hatch', 'van']
    sheet = Image.new('RGBA', (CELL_W * 4, CELL_H * len(kinds)), (0, 0, 0, 0))
    for row, k in enumerate(kinds):
        for d in range(4):
            sheet.paste(render(k, d), (d * CELL_W, row * CELL_H))
    sheet.save(out)
    print('scritto', os.path.normpath(out))


if __name__ == '__main__':
    main()
