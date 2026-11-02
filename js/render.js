// ---------- Disegno ----------
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

const ROAD_COLOR = '#5c5c66';
const RAMP_LIGHT = '#6b6b76';   // rampa che sale verso il fondo (guarda verso di noi)
const RAMP_DARK = '#4d4d57';    // rampa che sale verso il davanti
const CURB_COLOR = '#a0a0a8';
const LANE_COLOR = '#e8d24a';
const DIRT_COLORS = ['#a07c4c', '#ad8a59', '#8c6a3d'];  // piano, rampa chiara, rampa scura
const DIRT_EDGE = '#7d5f38';
const BALLAST = '#8d8273', SLEEPER = '#5e4128', STEEL = '#d5dade';
const SOIL = '#8b5e34';
const GROUND = { farm: '#b89a5e', warehouse: '#9a9a92' };   // terreno sotto gli edifici grandi

const HOUSE_STYLES = [
  { l: '#d9c3a0', r: '#b39d7c', roof: '#b5473a', lip: '#8f372d' },
  { l: '#e6d9c2', r: '#c0b399', roof: '#4a6fa5', lip: '#385782' },
  { l: '#c9d6b8', r: '#a4b394', roof: '#8a5a3a', lip: '#6b432a' },
];

function poly(c, pts, color) {
  c.fillStyle = color; c.strokeStyle = color; c.lineWidth = 1;
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  c.closePath(); c.fill(); c.stroke();
}

function line(c, a, b, color) {
  c.strokeStyle = color; c.lineWidth = 1;
  c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
}

// Punto (u, v) del tile (x, y) all'altezza h (in livelli) -> coordinate mondo.
// u e v possono andare oltre 1: serve per gli edifici grandi.
function iso(x, y, u, v, h) {
  return [(x + u - y - v) * TW / 2, (x + u + y + v) * TH / 2 - h * STEP];
}

// Altezza dentro al tile, interpolata tra i 4 angoli (serve per le rampe)
function heightIn(h, u, v) {
  return h[0] * (1 - u) * (1 - v) + h[1] * u * (1 - v) + h[2] * u * v + h[3] * (1 - u) * v;
}

// Funzione che trasforma (u, v) del tile in un punto sullo schermo, seguendo la sua superficie
function surface(x, y) {
  const h = cornerHeights(x, y);
  return (u, v) => iso(x, y, u, v, heightIn(h, u, v));
}

function drawTree(c, sx, sy, x, y) {
  const ox = Math.round((hash(x, y, 5) - 0.5) * 10);
  const oy = Math.round((hash(x, y, 9) - 0.5) * 4);
  const bx = Math.round(sx) + ox, by = Math.round(sy) + 8 + oy;
  c.fillStyle = '#5b3a1e'; c.fillRect(bx - 1, by - 3, 2, 4);
  c.fillStyle = '#1f5a24'; c.fillRect(bx - 4, by - 9, 8, 6);
  c.fillStyle = '#2f7a30'; c.fillRect(bx - 3, by - 12, 6, 4);
  c.fillStyle = '#4a9a3c'; c.fillRect(bx - 1, by - 14, 3, 3);
}

// ---------- Percorsi ----------
// P(u, v) segue la superficie del tile (funziona anche sulle rampe);
// links[d] = true se il percorso è collegato al vicino in direzione d.
const EDGE_UV = [[[0, 0], [1, 0]], [[1, 0], [1, 1]], [[1, 1], [0, 1]], [[0, 1], [0, 0]]];
const MID_UV = [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]];

// Strada asfaltata: cordoli sui lati non collegati, linea gialla verso i vicini collegati
function drawRoad(c, P, links) {
  const center = P(0.5, 0.5);
  for (let d = 0; d < 4; d++) {
    if (links[d]) line(c, center, P(...MID_UV[d]), LANE_COLOR);
    else line(c, P(...EDGE_UV[d][0]), P(...EDGE_UV[d][1]), CURB_COLOR);
  }
}

// Strada di terra: bordi scuri e due solchi delle ruote verso i vicini collegati
function drawDirt(c, P, links) {
  for (let d = 0; d < 4; d++) {
    if (!links[d]) { line(c, P(...EDGE_UV[d][0]), P(...EDGE_UV[d][1]), DIRT_EDGE); continue; }
    const [mu, mv] = MID_UV[d];
    for (const o of [-0.17, 0.17]) {
      const a = d % 2 === 0 ? [0.5 + o, 0.5] : [0.5, 0.5 + o];
      const b = d % 2 === 0 ? [mu + o, mv] : [mu, mv + o];
      line(c, P(...a), P(...b), DIRT_COLORS[2]);
    }
  }
}

// Binari: massicciata, traversine e due rotaie per ogni braccio collegato.
// Un binario isolato o alla fine della linea viene disegnato dritto.
function drawRail(c, P, links) {
  let arms = [0, 1, 2, 3].filter(d => links[d]);
  if (arms.length === 0) arms = [1, 3];
  else if (arms.length === 1) arms.push((arms[0] + 2) % 4);
  const w = 0.3;
  const rect = (u0, v0, u1, v1, col) => poly(c, [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)], col);
  // punto a distanza s dal centro lungo il braccio d, spostato di o di lato
  const at = (d, s, o) => {
    const { dx, dy } = DIRS[d];
    return dx ? P(0.5 + dx * s, 0.5 + o) : P(0.5 + o, 0.5 + dy * s);
  };
  rect(0.5 - w, 0.5 - w, 0.5 + w, 0.5 + w, BALLAST);
  for (const d of arms) {
    const { dx, dy } = DIRS[d];
    if (dx) rect(Math.min(0.5, 0.5 + dx * 0.5), 0.5 - w, Math.max(0.5, 0.5 + dx * 0.5), 0.5 + w, BALLAST);
    else rect(0.5 - w, Math.min(0.5, 0.5 + dy * 0.5), 0.5 + w, Math.max(0.5, 0.5 + dy * 0.5), BALLAST);
  }
  for (const d of arms) for (const s of [0.08, 0.25, 0.42]) line(c, at(d, s, -0.24), at(d, s, 0.24), SLEEPER);
  for (const d of arms) for (const o of [-0.12, 0.12]) line(c, at(d, 0, o), at(d, 0.5, o), STEEL);
}

// Campo coltivabile: terra arata con file di piante. crop = coltura della fattoria (null se il
// campo non ha una fattoria), stage = 0 semina, 1 germogli, 2 piante, 3 maturo
function drawField(c, P, crop, stage) {
  const rows = [0.15, 0.32, 0.5, 0.68, 0.85];
  if (!crop) { for (const v of rows) line(c, P(0.08, v), P(0.92, v), '#6e4826'); return; }
  const C = CROPS[crop];
  for (const v of rows) {
    if (stage === 0) {
      line(c, P(0.08, v), P(0.92, v), '#6e4826');
      c.fillStyle = '#4e3018';
      for (const u of [0.2, 0.45, 0.7]) { const p = P(u, v); c.fillRect(Math.round(p[0]), Math.round(p[1]), 1, 1); }
    } else if (stage === 1) {
      for (const u of [0.12, 0.37, 0.62]) line(c, P(u, v), P(u + 0.12, v), C.young);
    } else {
      line(c, P(0.08, v), P(0.92, v), stage === 2 ? C.young : C.ripe);
      if (stage === 3) {
        c.fillStyle = crop === 'carrot' ? '#5dae3a' : shade(C.ripe, 0.3);
        for (const u of [0.25, 0.55, 0.85]) { const p = P(u, v); c.fillRect(Math.round(p[0]), Math.round(p[1]) - 1, 1, 1); }
      }
    }
  }
}

function fieldLook(t) {
  const farm = t.farm && game.buildings.get(t.farm);
  if (!farm) return [null, 0];
  return [farm.crop, Math.min(3, Math.floor(farm.growth * 4))];
}

// ---------- Rotonda ----------
// Ogni tile disegna la sua parte (un quarto) dell'isola e della corsia circolare,
// ritagliata dentro il proprio rombo. Sul gradino i tile bassi sono inclinati.
const ISLAND_COLOR = '#5aa845';
const ISLAND_INNER = '#4a9a3c';
function drawRoundabout(c, x, y, P) {
  const rb = game.map[y][x].rb;
  const qx = x - rb.ax, qy = y - rb.ay;            // quale quarto del quadrato 2x2
  const B = (U, V) => P(U - qx, V - qy);            // (U, V) da 0 a 2 nel quadrato -> schermo
  const circle = r => {
    const pts = [];
    for (let i = 0; i < 48; i++) {
      const a = i / 48 * Math.PI * 2;
      pts.push(B(1 + r * Math.cos(a), 1 + r * Math.sin(a)));
    }
    return pts;
  };
  const path = pts => {
    c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.closePath();
  };
  const RING = 0.72; // raggio della corsia (in tile)

  // ritaglio = rombo del tile allargato di ~1 pixel: copre il bordo che il tile appena
  // disegnato lascia sui vicini, così nell'isola non restano righe tra i 4 quarti
  const ex = 0.06;
  c.save();
  path([P(-ex, -ex), P(1 + ex, -ex), P(1 + ex, 1 + ex), P(-ex, 1 + ex)]);
  c.clip();

  // ingressi: linea gialla dal bordo collegato fino alla corsia circolare
  for (let d = 0; d < 4; d++) {
    const nx = x + DIRS[d].dx, ny = y + DIRS[d].dy;
    if (sameRoundabout(x, y, nx, ny) || !roadLinked(x, y, d)) continue;
    const mU = qx + MID_UV[d][0], mV = qy + MID_UV[d][1];
    const len = Math.hypot(mU - 1, mV - 1);
    line(c, B(mU, mV), B(1 + (mU - 1) / len * RING, 1 + (mV - 1) / len * RING), LANE_COLOR);
  }

  c.setLineDash([3, 3]);
  path(circle(RING));
  c.strokeStyle = LANE_COLOR; c.lineWidth = 1; c.stroke();
  c.setLineDash([]);

  path(circle(0.42));
  c.fillStyle = ISLAND_COLOR; c.fill();
  c.strokeStyle = CURB_COLOR; c.lineWidth = 1; c.stroke();
  path(circle(0.22));
  c.fillStyle = ISLAND_INNER; c.fill();
  c.restore();

  // cordoli sui lati esterni senza strada collegata
  for (let d = 0; d < 4; d++) {
    const nx = x + DIRS[d].dx, ny = y + DIRS[d].dy;
    if (sameRoundabout(x, y, nx, ny) || roadLinked(x, y, d)) continue;
    line(c, P(...EDGE_UV[d][0]), P(...EDGE_UV[d][1]), CURB_COLOR);
  }
}

// ---------- Edifici ----------
function drawHouse(c, sx, sy, variant, rot) {
  const s = HOUSE_STYLES[variant % HOUSE_STYLES.length];
  const hw = 12, hh = 6, h = 14;
  const cx = sx, cy = sy + TH / 2;
  const L = [cx - hw, cy], B = [cx, cy + hh], R = [cx + hw, cy], Tp = [cx, cy - hh];
  const up = (p, d) => [p[0], p[1] - d];

  poly(c, [L, B, up(B, h), up(L, h)], s.l);
  poly(c, [B, R, up(R, h), up(B, h)], s.r);
  poly(c, [up(Tp, h), up(R, h), up(B, h), up(L, h)], s.roof);
  poly(c, [up(L, h), up(B, h), up(B, h - 2), up(L, h - 2)], s.lip);
  poly(c, [up(B, h), up(R, h), up(R, h - 2), up(B, h - 2)], s.lip);

  c.fillStyle = '#2b3a4d';
  for (const t of [0.3, 0.7]) {
    c.fillRect(Math.round(L[0] + (B[0] - L[0]) * t) - 1, Math.round(L[1] + (B[1] - L[1]) * t - h * 0.5) - 1, 2, 3);
    c.fillRect(Math.round(B[0] + (R[0] - B[0]) * t) - 1, Math.round(B[1] + (R[1] - B[1]) * t - h * 0.5) - 1, 2, 3);
  }
  // porta: sul lato sinistro (rot 0) o destro (rot 3); con rot 1 e 2 è sul retro e non si vede
  const r = (rot || 0) & 3;
  if (r === 0 || r === 3) {
    const [a, b] = r === 0 ? [L, B] : [B, R];
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    poly(c, [[m[0] - 1.5, m[1] - 0.75 * (r === 0 ? 1 : -1)], [m[0] + 1.5, m[1] + 0.75 * (r === 0 ? 1 : -1)],
      [m[0] + 1.5, m[1] + 0.75 * (r === 0 ? 1 : -1) - 6], [m[0] - 1.5, m[1] - 0.75 * (r === 0 ? 1 : -1) - 6]], '#5a3a22');
  }
}

// Parallelepipedo da (u0, v0) a (u1, v1) rispetto all'angolo (ax, ay), alla quota base, alto hp pixel
function box(c, ax, ay, base, u0, v0, u1, v1, hp, col) {
  const top = base + hp / STEP;
  const P = (u, v, h) => iso(ax, ay, u, v, h);
  poly(c, [P(u0, v1, base), P(u1, v1, base), P(u1, v1, top), P(u0, v1, top)], col.l); // lato sinistro
  poly(c, [P(u1, v1, base), P(u1, v0, base), P(u1, v0, top), P(u1, v1, top)], col.r); // lato destro
  if (col.t) poly(c, [P(u0, v0, top), P(u1, v0, top), P(u1, v1, top), P(u0, v1, top)], col.t);   // sopra
  return top;
}

// Tetto a due falde con il colmo lungo u, appoggiato alla quota top, alto rh pixel
function gableRoof(c, ax, ay, top, u0, v0, u1, v1, rh, col, alongV) {
  const P = (u, v, h) => iso(ax, ay, u, v, h);
  const ridge = top + rh / STEP;
  if (!alongV) {
    const vm = (v0 + v1) / 2;
    poly(c, [P(u0, v0, top), P(u1, v0, top), P(u1, vm, ridge), P(u0, vm, ridge)], col.back);
    poly(c, [P(u1, v1, top), P(u1, v0, top), P(u1, vm, ridge)], col.gable);
    poly(c, [P(u0, v1, top), P(u1, v1, top), P(u1, vm, ridge), P(u0, vm, ridge)], col.roof);
  } else { // colmo lungo v (edificio ruotato)
    const um = (u0 + u1) / 2;
    poly(c, [P(u0, v0, top), P(u0, v1, top), P(um, v1, ridge), P(um, v0, ridge)], col.back);
    poly(c, [P(u0, v1, top), P(u1, v1, top), P(um, v1, ridge)], col.gableL || col.gable);
    poly(c, [P(u1, v0, top), P(u1, v1, top), P(um, v1, ridge), P(um, v0, ridge)], col.roof);
  }
}

// ---------- Edifici grandi ruotabili ----------
// Le parti sono descritte senza rotazione nel riquadro 2x2 (u, v da 0 a 2), con l'entrata
// davanti a sinistra (lato +v). Vengono ruotate, ordinate dalla più lontana alla più vicina e disegnate.
function rotVec(du, dv, r) {
  switch (r & 3) { case 0: return [du, dv]; case 1: return [-dv, du]; case 2: return [-du, -dv]; default: return [dv, -du]; }
}
function rotBox(bx, r) {
  const A = rotUV(bx[0], bx[1], r), B = rotUV(bx[2], bx[3], r);
  return [Math.min(A[0], B[0]), Math.min(A[1], B[1]), Math.max(A[0], B[0]), Math.max(A[1], B[1])];
}
// quadrilatero piano sul terreno (vialetti)
function groundRect(c, ax, ay, base, bx, r, color) {
  const [u0, v0, u1, v1] = rotBox(bx, r);
  poly(c, [iso(ax, ay, u0, v0, base), iso(ax, ay, u1, v0, base), iso(ax, ay, u1, v1, base), iso(ax, ay, u0, v1, base)], color);
}
// porta/insegna su una faccia (+v o +u) della parte; si vede solo se dopo la rotazione guarda verso di noi
function drawDoor(c, ax, ay, base, r, bx, d) {
  const n = rotVec(d.face === '+u' ? 1 : 0, d.face === '+u' ? 0 : 1, r);
  if (!((n[0] === 0 && n[1] === 1) || (n[0] === 1 && n[1] === 0))) return;
  const pa = d.face === '+u' ? [bx[2], d.a] : [d.a, bx[3]];
  const pb = d.face === '+u' ? [bx[2], d.b] : [d.b, bx[3]];
  const A = rotUV(pa[0], pa[1], r), B = rotUV(pb[0], pb[1], r);
  const z0 = base + (d.z0 || 0) / STEP, z1 = base + d.z1 / STEP;
  const q = [iso(ax, ay, A[0], A[1], z0), iso(ax, ay, B[0], B[1], z0), iso(ax, ay, B[0], B[1], z1), iso(ax, ay, A[0], A[1], z1)];
  poly(c, q, d.color);
  if (d.cross) { line(c, q[0], q[2], '#f2f5f8'); line(c, q[1], q[3], '#f2f5f8'); }
}
function drawParts(c, ax, ay, base, r, parts) {
  const items = parts.map(p => { const b = rotBox(p.box, r); return { p, b, depth: b[2] + b[3] }; })
    .sort((a, b) => a.depth - b.depth);
  for (const { p, b } of items) {
    const top = box(c, ax, ay, base, b[0], b[1], b[2], b[3], p.h, p.col);
    if (p.roof) gableRoof(c, ax, ay, top, b[0] - 0.04, b[1] - 0.04, b[2] + 0.04, b[3] + 0.04, p.roof.rh,
      Object.assign({ gableL: p.col.l }, p.roof), (r & 1) === 1);
    if (p.doors) for (const d of p.doors) drawDoor(c, ax, ay, base, r, p.box, d);
    if (p.after) p.after(b, top);
  }
}

// Fattoria 2x2: fienile rosso con il portone verso l'entrata, silo, casetta, balle di fieno
// e il vialetto di terra che parte dall'entrata
function drawFarm(c, ax, ay, base, r) {
  const P = (u, v, h) => iso(ax, ay, u, v, h);
  groundRect(c, ax, ay, base, [0.3, 0.95, 0.7, 2.0], r, '#a07c4c');
  const hay = { l: '#d9b44a', r: '#b8952f', t: '#ecd17a' };
  drawParts(c, ax, ay, base, r, [
    { box: [0.12, 0.15, 1.0, 0.95], h: 14, col: { l: '#b5473a', r: '#8f372d', t: '#b5473a' },
      roof: { rh: 8, back: '#5a4036', roof: '#6b4a3a', gable: '#8f372d' },
      doors: [{ face: '+v', a: 0.36, b: 0.74, z1: 9, color: '#5a2a22', cross: true }] },
    { box: [1.38, 0.18, 1.74, 0.54], h: 30, col: { l: '#c9d2dc', r: '#a5b0bd', t: '#e8eef3' },
      after(b, top) {
        poly(c, [P(b[0] + 0.04, b[1] + 0.04, top + 0.4), P(b[2] - 0.04, b[1] + 0.04, top + 0.4),
          P(b[2] - 0.04, b[3] - 0.04, top + 0.4), P(b[0] + 0.04, b[3] - 0.04, top + 0.4)], '#8f9aa6');
        for (const f of [0.3, 0.6]) line(c, P(b[0], b[3], base + 30 * f / STEP), P(b[2], b[3], base + 30 * f / STEP), '#a5b0bd');
      } },
    { box: [1.15, 1.2, 1.75, 1.75], h: 9, col: { l: '#e6d9c2', r: '#c0b399', t: '#e6d9c2' },
      roof: { rh: 5, back: '#7a2f27', roof: '#9a3a30', gable: '#c0b399' },
      doors: [{ face: '+v', a: 1.38, b: 1.52, z1: 6, color: '#5a3a22' }] },
    { box: [0.06, 1.25, 0.24, 1.45], h: 4, col: hay },
    { box: [0.06, 1.55, 0.24, 1.75], h: 4, col: hay },
  ]);
}

// Magazzino alimenti 2x2: capannone con i portoni di carico verso l'entrata, vialetto di cemento,
// insegna verde e casse
function drawWarehouse(c, ax, ay, base, r) {
  const P = (u, v, h) => iso(ax, ay, u, v, h);
  groundRect(c, ax, ay, base, [0.28, 1.45, 0.72, 2.0], r, '#7b7f86');
  const door = a => ({ face: '+v', a, b: a + 0.35, z1: 11, color: '#4a4f5a' });
  const crate = { l: '#a0703f', r: '#7f5630', t: '#c08a52' };
  drawParts(c, ax, ay, base, r, [
    { box: [0.15, 0.3, 1.85, 1.45], h: 18, col: { l: '#d2ccbe', r: '#aaa497', t: '#7d8a96' },
      doors: [door(0.32), door(0.82), door(1.32),
        { face: '+u', a: 0.5, b: 1.25, z0: 12, z1: 16, color: '#3fa34d' }],
      after(b, top) { // lamiere del tetto
        const alongU = b[2] - b[0] > b[3] - b[1];
        for (const f of [0.2, 0.4, 0.6, 0.8]) {
          if (alongU) { const u = b[0] + (b[2] - b[0]) * f; line(c, P(u, b[1], top), P(u, b[3], top), '#6b7682'); }
          else { const v = b[1] + (b[3] - b[1]) * f; line(c, P(b[0], v, top), P(b[2], v, top), '#6b7682'); }
        }
      } },
    { box: [1.1, 1.66, 1.32, 1.88], h: 5, col: crate },
    { box: [1.45, 1.66, 1.67, 1.88], h: 5, col: crate },
  ]);
}

// Disegna la parte di edificio di un tile: case subito, edifici grandi sul tile più avanti
// dell'impronta (così sono già stati disegnati tutti i tile su cui poggiano)
function drawBuildingOn(c, x, y, b) {
  const def = BUILDINGS[b.kind];
  if (b.kind === 'house') {
    const t = game.map[y][x];
    drawHouse(c, (x - y) * TW / 2, (x + y) * TH / 2 - t.elev * STEP, b.variant, b.rot);
    return;
  }
  if (x !== b.ax + def.w - 1 || y !== b.ay + def.h - 1) return;
  const base = game.map[b.ay][b.ax].elev;
  if (b.kind === 'farm') drawFarm(c, b.ax, b.ay, base, b.rot || 0);
  else if (b.kind === 'warehouse') drawWarehouse(c, b.ax, b.ay, base, b.rot || 0);
}

// ---------- Tile ----------
// Parete sul lato davanti verso la direzione d (1 = destra/SE, 2 = sinistra/SW):
// va dal bordo del tile fino al bordo del vicino (o al suolo fuori mappa)
function drawWall(c, x, y, h, d, color) {
  const [ka, kb] = d === 1 ? [1, 2] : [3, 2];
  const na = neighborCornerHeight(x, y, d, ka), nb = neighborCornerHeight(x, y, d, kb);
  const ba = Math.min(h[ka], na), bb = Math.min(h[kb], nb);
  if (h[ka] <= ba && h[kb] <= bb) return;
  const [ua, va] = CORNERS[ka], [ub, vb] = CORNERS[kb];
  poly(c, [iso(x, y, ua, va, h[ka]), iso(x, y, ub, vb, h[kb]), iso(x, y, ub, vb, bb), iso(x, y, ua, va, ba)], color);
}

// Colore della superficie di un percorso: più chiaro/scuro se è una rampa
function slopeShade(x, y, colors) {
  const r = rampDir(x, y);
  return r < 0 ? colors[0] : (r === 0 || r === 3 ? colors[1] : colors[2]);
}

// Colori del terreno un po' più chiari in alto e più scuri in basso: così si capisce la quota
const tintCache = new Map();
function tint(type, elev, i) {
  const k = (type * 64 + elev) * 3 + i;
  let c = tintCache.get(k);
  if (!c) {
    c = type === T.WATER ? COLORS[type][i] : shade(COLORS[type][i], Math.max(-0.35, Math.min(0.3, (elev - 3) * 0.05)));
    tintCache.set(k, c);
  }
  return c;
}

// onlyTop = disegna solo la superficie e l'oggetto sopra (usato per l'anteprima)
function drawTile(c, x, y, detail, onlyTop) {
  const t = game.map[y][x];
  const h = cornerHeights(x, y);
  const col = [tint(t.type, t.elev, 0), tint(t.type, t.elev, 1), tint(t.type, t.elev, 2)];
  const P = (u, v) => iso(x, y, u, v, heightIn(h, u, v));

  if (!onlyTop) {
    drawWall(c, x, y, h, 2, col[1]); // sinistra, verso (x, y+1)
    drawWall(c, x, y, h, 1, col[2]); // destra, verso (x+1, y)
  }

  let top = col[0];
  if (t.path === 'road') top = slopeShade(x, y, [ROAD_COLOR, RAMP_LIGHT, RAMP_DARK]);
  else if (t.path === 'dirt') top = slopeShade(x, y, DIRT_COLORS);
  else if (t.field) top = SOIL;
  else if (t.building && GROUND[t.building.kind]) top = GROUND[t.building.kind];
  poly(c, [P(0, 0), P(1, 0), P(1, 1), P(0, 1)], top);

  // bordo scuro sui lati dietro dove il terreno scende: si vede subito che dietro c'è un salto
  if (!onlyTop && t.type !== T.WATER) {
    c.strokeStyle = 'rgba(20, 24, 30, 0.45)'; c.lineWidth = 1;
    for (const [d, ka, kb] of [[0, 0, 1], [3, 3, 0]]) {
      if (neighborCornerHeight(x, y, d, ka) < h[ka] || neighborCornerHeight(x, y, d, kb) < h[kb]) {
        const a = P(...CORNERS[ka]), b = P(...CORNERS[kb]);
        c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
      }
    }
  }

  if (t.path) {
    const links = [0, 1, 2, 3].map(d => roadLinked(x, y, d));
    if (t.rb) drawRoundabout(c, x, y, P);
    else if (t.path === 'road') drawRoad(c, P, links);
    else if (t.path === 'dirt') drawDirt(c, P, links);
    else drawRail(c, P, links);
    return;
  }
  if (t.field) { const [crop, stage] = fieldLook(t); drawField(c, P, crop, stage); return; }

  const sx = (x - y) * TW / 2;
  const sy = (x + y) * TH / 2 - t.elev * STEP;
  if (detail && !onlyTop && !t.building) {
    c.fillStyle = col[1];
    for (let i = 0; i < 3; i++) {
      const px = Math.round(sx + (hash(x, y, 20 + i) - 0.5) * 16);
      const py = Math.round(sy + 5 + (hash(x, y, 40 + i) - 0.5) * 6);
      c.fillRect(px, py, 1, 1);
    }
  }

  if (t.building) { drawBuildingOn(c, x, y, t.building); return; }
  if (t.type === T.FOREST && !onlyTop) drawTree(c, sx, sy, x, y);
}

// ---------- Anteprima (fantasma) di quello che si sta per costruire ----------
function isBuildTool(tool) { return !!(PATHS[tool] || BUILDINGS[tool] || tool === 'field'); }

function previewTile() {
  const h = game.hover;
  if (!h || !isBuildTool(game.tool)) return null;
  return canUseTool(game.tool, h.x, h.y) ? h : null;
}

// Tile da ridisegnare in anteprima: per i percorsi anche quelli vicini (possono diventare
// rampe, rotonde o collegarsi), per gli edifici tutta l'impronta
function previewTiles(p) {
  if (BUILDINGS[game.tool]) return footprint(game.tool, p.x, p.y);
  const list = [p];
  if (PATHS[game.tool])
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
      if ((dx || dy) && pathAt(p.x + dx, p.y + dy)) list.push({ x: p.x + dx, y: p.y + dy });
  return list;
}

// Esegue draw() come se l'oggetto fosse già costruito, poi rimette tutto com'era
function withPreview(p, draw) {
  const tool = game.tool;
  const t = game.map[p.y][p.x];
  const saved = footprint(BUILDINGS[tool] ? tool : 'house', p.x, p.y).map(q => [q, game.map[q.y][q.x].building]);
  const savedField = t.field;
  if (PATHS[tool]) { setPath(p.x, p.y, tool); updateRoundabouts(); }
  else if (tool === 'field') t.field = true;
  else if (BUILDINGS[tool]) {
    const b = { kind: tool, variant: houseVariant(p.x, p.y), ax: p.x, ay: p.y, rot: game.rotation };
    for (const [q] of saved) game.map[q.y][q.x].building = b;
  }
  try { draw(); } finally {
    if (PATHS[tool]) { setPath(p.x, p.y, null); updateRoundabouts(); }
    t.field = savedField;
    for (const [q, b] of saved) game.map[q.y][q.x].building = b;
  }
}

// Dimensioni dell'impronta dello strumento (1x1 per tutto tranne gli edifici grandi)
function toolSize(tool) { return BUILDINGS[tool] ? BUILDINGS[tool] : { w: 1, h: 1 }; }

// Tile su cui disegnare il contorno: il più avanti dell'impronta (dentro la mappa)
function hoverAnchorTile() {
  const h = game.hover, s = toolSize(game.tool);
  return { x: Math.min(h.x + s.w - 1, game.size - 1), y: Math.min(h.y + s.h - 1, game.size - 1) };
}

function drawHover(c) {
  const h = game.hover;
  if (!h) return;
  let color = '#ffffff';
  if (game.tool === 'demolish') color = canUseTool('demolish', h.x, h.y) ? '#ffb347' : '#888888';
  else if (game.tool !== 'hand') color = canUseTool(game.tool, h.x, h.y) ? '#5dff7a' : '#ff5d5d';
  const s = toolSize(game.tool);

  const draw = () => {
    // 1x1: segue la superficie (rampe); edifici grandi: rettangolo piano alla quota del tile
    let pts;
    if (s.w === 1 && s.h === 1) {
      const P = surface(h.x, h.y), a = 0.1, b = 0.9;
      pts = [P(a, a), P(b, a), P(b, b), P(a, b)];
    } else {
      const e = game.map[h.y][h.x].elev, a = 0.1;
      pts = [iso(h.x, h.y, a, a, e), iso(h.x, h.y, s.w - a, a, e), iso(h.x, h.y, s.w - a, s.h - a, e), iso(h.x, h.y, a, s.h - a, e)];
    }
    c.strokeStyle = color; c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts.slice(1)) c.lineTo(p[0], p[1]);
    c.closePath(); c.stroke();
  };
  // con l'anteprima il contorno segue la forma finale (es. la rampa)
  if (previewTile()) withPreview(h, draw); else draw();
  if (BUILDINGS[game.tool] && s.w > 1) drawEntrance(c, { kind: game.tool, ax: h.x, ay: h.y, rot: game.rotation });
}

// Segno dell'entrata (lato da collegare alla strada): verde se la strada c'è già, giallo se manca
function drawEntrance(c, b) {
  const ent = entranceOf(b);
  if (!ent || !inMap(ent.x, ent.y)) return;
  const e = game.map[b.ay][b.ax].elev;
  const [k1, k2] = EDGES[ent.d];
  const A = iso(ent.x, ent.y, ...CORNERS[k1], e), B = iso(ent.x, ent.y, ...CORNERS[k2], e);
  const M = iso(ent.x, ent.y, 0.5 + DIRS[ent.d].dx * 0.5, 0.5 + DIRS[ent.d].dy * 0.5, e);
  const O = iso(ent.x, ent.y, 0.5 + DIRS[ent.d].dx * 1.0, 0.5 + DIRS[ent.d].dy * 1.0, e);
  const ok = roadAt(ent.rx, ent.ry);
  c.strokeStyle = ok ? '#5dff7a' : '#ffd966'; c.lineWidth = 3;
  c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.stroke();
  c.lineWidth = 2;
  c.beginPath(); c.moveTo(M[0], M[1]); c.lineTo(O[0], O[1]); c.stroke();
}

function drawFrame() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#1a1c2c';
  ctx.fillRect(0, 0, view.w, view.h);
  if (!game.map) return;

  const z = zoomLevel();
  ctx.setTransform(z, 0, 0, z, Math.round(cam.x), Math.round(cam.y));
  ctx.imageSmoothingEnabled = false;

  const r = visibleRange();
  const detail = z >= 1;
  const pv = previewTile();
  const pvList = pv ? previewTiles(pv) : [];
  const inPreview = (x, y) => pvList.some(p => p.x === x && p.y === y);
  const ha = game.hover ? hoverAnchorTile() : null;
  const vmap = vehiclesByTile();
  const sel = game.selected && game.buildings.get(game.selected);
  const selFront = sel ? [sel.ax + BUILDINGS[sel.kind].w - 1, sel.ay + BUILDINGS[sel.kind].h - 1] : null;

  // zona visibile in coordinate mondo (con margine per pareti, alberi ed edifici alti)
  const left = -cam.x / z - TW, right = (view.w - cam.x) / z + TW;
  const topY = -cam.y / z - TH, bottomY = (view.h - cam.y) / z + 48;

  // dal fondo al fronte (ordine del pittore).
  // Anteprima e contorno della selezione si disegnano subito dopo il loro tile:
  // così i blocchi davanti li coprono, come farebbero con l'oggetto vero.
  for (let y = r.y0; y <= r.y1; y++) {
    // in questa fila solo le x che cadono dentro lo schermo in orizzontale
    const xa = Math.max(r.x0, Math.floor(y + left / (TW / 2)));
    const xb = Math.min(r.x1, Math.ceil(y + right / (TW / 2)));
    for (let x = xa; x <= xb; x++) {
      const gy = (x + y) * TH / 2; // posizione a quota 0
      if (gy - game.map[y][x].elev * STEP > bottomY || gy + TH < topY) continue;
      drawTile(ctx, x, y, detail);
      if (pv && inPreview(x, y)) {
        ctx.globalAlpha = 0.75;
        withPreview(pv, () => drawTile(ctx, x, y, detail, true));
        ctx.globalAlpha = 1;
      }
      if (ha && x === ha.x && y === ha.y) drawHover(ctx);
      if (selFront && x === selFront[0] && y === selFront[1]) drawSelection(ctx, sel);
      const vs = vmap.get(y * game.size + x);
      if (vs) for (const v of vs) drawVehicle(ctx, v);
    }
  }
  if (game.fieldMode) drawFieldArea(ctx);
  drawWorkerIcons(ctx);
}

// Contorno giallo dell'edificio selezionato (pannello aperto)
function drawSelection(c, b) {
  const d = BUILDINGS[b.kind], e = game.map[b.ay][b.ax].elev, a = 0.05;
  const pts = [iso(b.ax, b.ay, a, a, e), iso(b.ax, b.ay, d.w - a, a, e), iso(b.ax, b.ay, d.w - a, d.h - a, e), iso(b.ax, b.ay, a, d.h - a, e)];
  c.strokeStyle = '#ffd966'; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) c.lineTo(p[0], p[1]);
  c.closePath(); c.stroke();
  if (d.w > 1) drawEntrance(c, b);
}

// Icona sopra le attività senza abbastanza lavoratori: rossa se non c'è nessuno, arancione se ne mancano
function drawWorkerIcons(c) {
  for (const b of game.buildings.values()) {
    const need = JOBS[b.kind];
    if (!need || (b.workers || 0) >= need) continue;
    const d = BUILDINGS[b.kind], e = game.map[b.ay][b.ax].elev;
    const [x, y] = iso(b.ax, b.ay, d.w / 2, d.h / 2, e + (d.height + 10) / STEP);
    c.fillStyle = b.workers ? '#e8a33a' : '#d94141';
    c.strokeStyle = '#1a1c2c'; c.lineWidth = 1;
    c.beginPath(); c.arc(x, y, 6, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(x, y - 2.5, 1.6, 0, Math.PI * 2); c.fill();   // testa
    c.fillRect(x - 2, y - 0.5, 4, 4);                                  // corpo
    c.fillStyle = b.workers ? '#e8a33a' : '#d94141';
    c.fillRect(x - 0.5, y + 1.5, 1, 2);                                // gambe
  }
}

// In modalità campi: zona tratteggiata dove si possono mettere i campi della fattoria
function drawFieldArea(c) {
  const f = game.buildings.get(game.fieldMode);
  if (!f) return;
  const R = FARM.fieldRadius, e = game.map[f.ay][f.ax].elev;
  const x0 = f.ax - R, y0 = f.ay - R, w = 2 + 2 * R;
  const pts = [iso(x0, y0, 0, 0, e), iso(x0, y0, w, 0, e), iso(x0, y0, w, w, e), iso(x0, y0, 0, w, e)];
  c.setLineDash([4, 3]);
  c.strokeStyle = '#ffd966'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) c.lineTo(p[0], p[1]);
  c.closePath(); c.stroke();
  c.setLineDash([]);
}

// Ridisegna al prossimo frame (evita di disegnare più volte inutilmente)
let needsDraw = true;
function requestDraw() { needsDraw = true; }
