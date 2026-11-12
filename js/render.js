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
const HW_COLORS = ['#44444e', '#51515c', '#393942'];     // autostrada: piano, rampa chiara, rampa scura
const HW_LINE = '#f2f2f2', RAIL_GUARD = '#8f959d', GUARD_POST = '#7e848c';
const DECK = { top: ROAD_COLOR, l: '#a7a7ae', r: '#86868e', pillarL: '#b3b3ba', pillarR: '#8e8e96', rail: '#dfe2e6' };
const BALLAST = '#8d8273', SLEEPER = '#5e4128', STEEL = '#d5dade';
const SOIL = '#8b5e34';
const GROUND = { farm: '#b89a5e', warehouse: '#9a9a92', factory: '#8f8f88', supermarket: '#9a9a92',
  cowFarm: '#7cbf5a', chickenFarm: '#c9b07a', pigFarm: '#9a7a52', sheepFarm: '#8fc96a', dairy: '#9a9a92', slaughterhouse: '#8f8f88',
  forestry: '#8a6a40', sawmill: '#a08a64', furnitureFactory: '#8f8f88', furnitureStore: '#9a9a92',
  goodsWarehouse: '#9a9a92', textileMill: '#8f8f88', clothingFactory: '#8f8f88', clothingStore: '#9a9a92',
  charcoalKiln: '#7a6a50', coalPlant: '#7a7a74', solarPlant: '#a9c48a', refinery: '#8f8f88', port: '#9a9a92', oilWell: '#8a7a5a', gasStation: '#8f8f88' };   // terreno sotto gli edifici grandi

// colori delle case: muri (l = lato sinistro, r = destro), tetto, falda dietro, persiane
const HOUSE_STYLES = [
  { l: '#efe0c2', r: '#cdbb9a', roof: '#c4533f', back: '#8f372d', shutter: '#4f9f57' },
  { l: '#f4f4f0', r: '#d2d4d6', roof: '#4f74b0', back: '#385782', shutter: '#5f718c' },
  { l: '#d6e3c4', r: '#b2c2a0', roof: '#9a6540', back: '#6b432a', shutter: '#bd8640' },
];

function poly(c, pts, color) {
  c.fillStyle = color; c.strokeStyle = color; c.lineWidth = 1;
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  c.closePath(); c.fill(); c.stroke();
}

// Livello di dettaglio: falso quando lo zoom è lontano (si disegna più semplice per andare veloci)
let DETAIL = true;
let animT = 0;      // tempo (secondi) per le animazioni (acqua)
let waterSeen = false;   // nell'ultimo fotogramma si vedeva acqua (allora si anima)
let animSeen = false;    // si vedevano pale eoliche, pompe, fumo o navi: si ridisegna più spesso (movimento fluido)
let FINE = true;    // dettagli minuti (ciuffi, sassi, alberi elaborati): solo da zoom 2 in su

// linea sottile (mezzo pixel del mondo = 1 pixel dello schermo a zoom normale) con trasparenza
function aline(c, a, b, color, alpha, w) {
  const ga = c.globalAlpha;
  c.globalAlpha = ga * (alpha == null ? 1 : alpha);
  c.strokeStyle = color; c.lineWidth = w || 0.5;
  c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
  c.globalAlpha = ga;
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

// Alberi: pini e latifoglie (scelti a caso ma sempre uguali per ogni tile), con ombra a terra,
// luce da sinistra e un po' di variazione di grandezza. Da lontano la versione semplice.
function drawTree(c, sx, sy, x, y) {
  const ox = Math.round((hash(x, y, 5) - 0.5) * 10);
  const oy = Math.round((hash(x, y, 9) - 0.5) * 4);
  const bx = Math.round(sx) + ox, by = Math.round(sy) + 8 + oy;
  if (!FINE) {
    c.fillStyle = '#5b3a1e'; c.fillRect(bx - 1, by - 3, 2, 4);
    c.fillStyle = '#1f5a24'; c.fillRect(bx - 4, by - 9, 8, 6);
    c.fillStyle = '#2f7a30'; c.fillRect(bx - 3, by - 12, 6, 4);
    c.fillStyle = '#4a9a3c'; c.fillRect(bx - 1, by - 14, 3, 3);
    return;
  }
  const s = 0.85 + hash(x, y, 17) * 0.35;
  const fillEll = (cx, cy, rx, ry, col) => { c.fillStyle = col; c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); c.fill(); };
  fillEll(bx + 1.5, by, 5 * s, 2 * s, 'rgba(10,30,10,0.22)');                       // ombra
  c.fillStyle = '#5b3a1e'; c.fillRect(bx - 1, by - 4 * s, 2, 4 * s);                  // tronco
  c.fillStyle = '#7a5230'; c.fillRect(bx - 1, by - 4 * s, 0.75, 4 * s);
  if (hash(x, y, 13) < 0.55) {   // pino: tre piani di rami, metà al sole e metà in ombra
    for (let i = 0; i < 3; i++) {
      const w = (6 - i * 1.5) * s, yb = by - (3 + i * 3.6) * s, yt = yb - 6 * s;
      poly(c, [[bx - w, yb], [bx, yt], [bx, yb + 1]], ['#2f7a35', '#3a8a3e', '#4a9a48'][i]);
      poly(c, [[bx, yt], [bx + w, yb], [bx, yb + 1]], ['#1f5a28', '#256a2e', '#2f7a35'][i]);
    }
    aline(c, [bx - 0.5, by - 15 * s], [bx - 2.5, by - 11 * s], '#7ac06a', 0.6);
  } else {       // latifoglia: chioma tonda a palle, luce in alto a sinistra
    const cy = by - 9 * s;
    fillEll(bx + 0.5, cy + 1, 5.5 * s, 4.8 * s, '#2a6a2c');
    fillEll(bx - 1.5 * s, cy - 1.5 * s, 3.6 * s, 3.2 * s, '#3f8a3a');
    fillEll(bx + 2 * s, cy - 2 * s, 3 * s, 2.8 * s, '#367d34');
    fillEll(bx - 2 * s, cy - 2.8 * s, 1.6 * s, 1.3 * s, '#5aa84a');
    if (hash(x, y, 19) > 0.7) for (const [fx, fy] of [[-2, 0], [2, -1], [0, -3]])   // frutti o fiori
      { c.fillStyle = hash(x, y, 23) > 0.5 ? '#e84a4a' : '#f2e66a'; c.fillRect(bx + fx * s, cy + fy * s, 0.8, 0.8); }
  }
}

// Piccoli dettagli sul terreno (solo da vicino): ciuffi d'erba e fiori, increspature della sabbia,
// crepe e sassi sulla roccia, brillii sulla neve, onde sull'acqua
function terrainDetail(c, x, y, t, P, col) {
  const H = k => hash(x, y, k);
  const dot = (u, v, color, w, h) => { const p = P(u, v); c.fillStyle = color; c.fillRect(p[0], p[1], w || 0.5, h || 0.5); };
  if (t.type === T.GRASS || t.type === T.FOREST) {
    for (let i = 0; i < 4; i++) {
      const u = 0.1 + H(20 + i) * 0.8, v = 0.1 + H(40 + i) * 0.8, p = P(u, v);
      c.fillStyle = i % 2 ? shadeC(col[0], 0.18) : col[1];
      c.fillRect(p[0], p[1] - 1, 0.5, 1); c.fillRect(p[0] + 0.5, p[1] - 0.5, 0.5, 0.5);
    }
    if (H(61) > 0.78) dot(0.2 + H(62) * 0.6, 0.2 + H(63) * 0.6, ['#ffffff', '#f2e66a', '#e87aa8', '#a98ae8'][Math.floor(H(64) * 4)], 1, 1);
  } else if (t.type === T.SAND) {
    for (let i = 0; i < 2; i++) {
      const u = 0.15 + H(30 + i) * 0.6, v = 0.2 + H(50 + i) * 0.6;
      aline(c, P(u, v), P(u + 0.22, v), shadeC(col[0], 0.15), 0.8);
    }
    if (H(66) > 0.7) dot(0.3 + H(67) * 0.4, 0.3 + H(68) * 0.4, '#f6f1e0', 1, 0.5);   // conchiglia
  } else if (t.type === T.ROCK) {
    const u = 0.2 + H(31) * 0.5, v = 0.2 + H(32) * 0.5;
    aline(c, P(u, v), P(u + 0.15, v + 0.1), col[2], 0.7); aline(c, P(u + 0.15, v + 0.1), P(u + 0.2, v + 0.25), col[2], 0.7);
    for (let i = 0; i < 3; i++) dot(0.1 + H(70 + i) * 0.8, 0.1 + H(75 + i) * 0.8, i ? shadeC(col[0], 0.2) : col[1], 1, 0.5);
  } else if (t.type === T.SNOW) {
    for (let i = 0; i < 3; i++) dot(0.1 + H(80 + i) * 0.8, 0.1 + H(85 + i) * 0.8, i ? '#ffffff' : '#c8d8ea');
  }
}

// Acqua animata: le increspature scorrono piano e brillano a turno, la schiuma sulle rive pulsa
function waterDetail(c, x, y, P) {
  const H = k => hash(x, y, k);
  for (let i = 0; i < 3; i++) {
    const ph = animT * 0.9 + H(100 + i) * 6.28;
    const a = 0.35 + 0.45 * Math.max(0, Math.sin(ph));                 // brilla e si spegne
    if (a < 0.4) continue;
    const drift = ((animT * 0.06 + H(90 + i)) % 1) * 0.6;              // scivola lungo il tile
    const u = 0.1 + drift, v = 0.15 + H(95 + i) * 0.7;
    aline(c, P(u, v), P(u + 0.16, v - 0.04), i ? '#7fb6e6' : '#cfe6f8', a, 0.8);
  }
}

// Colore della parete di terra sotto un tile (le scarpate d'erba mostrano la terra sotto)
const WALL_COLORS = {
  [T.GRASS]: ['#8a6a44', '#6f5536'], [T.FOREST]: ['#7d6040', '#654c32'],
};
function wallColor(t, side, col) {
  const w = WALL_COLORS[t.type];
  if (!w) return col[side];
  return shadeC(w[side - 1], Math.max(-0.3, Math.min(0.2, (t.elev - 3) * 0.04)));
}

// ---------- Percorsi ----------
// P(u, v) segue la superficie del tile (funziona anche sulle rampe);
// links[d] = true se il percorso è collegato al vicino in direzione d.
const EDGE_UV = [[[0, 0], [1, 0]], [[1, 0], [1, 1]], [[1, 1], [0, 1]], [[0, 1], [0, 0]]];
const MID_UV = [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]];

// ---------- Strade più dettagliate ----------
// Asfalto con un po' di grana, marciapiedi lastricati con cordolo sui lati senza collegamento,
// angoli di marciapiede agli incroci, mezzeria tratteggiata, qualche tombino.
// (x, y) servono solo per scegliere sempre gli stessi dettagli per ogni tile; detail = zoom vicino.
const SIDEWALK = '#b9b5ab', SIDE_CURB = '#8b877e', SIDE_JOINT = '#a6a298', SIDE_LIGHT = '#cfcbc1';
const SW = 0.15;                                   // larghezza del marciapiede (in tile)
const INWARD = DIRS.map(D => [-D.dx, -D.dy]);       // dal bordo d verso il centro

function uvAt(a, inw, w) { return [a[0] + inw[0] * w, a[1] + inw[1] * w]; }

function asphaltGrain(c, P, x, y, light, dark) {
  for (let i = 0; i < 9; i++) {
    const u = 0.08 + hash(x, y, 60 + i) * 0.84, v = 0.08 + hash(x, y, 80 + i) * 0.84;
    const p = P(u, v);
    c.fillStyle = i % 3 ? dark : light;
    c.fillRect(p[0], p[1], 0.5, 0.5);
  }
}

// marciapiedi sui lati liberi e angoli tra due bracci collegati (da lontano solo il cordolo)
function sidewalks(c, P, links, detail) {
  if (!detail) { for (let d = 0; d < 4; d++) if (!links[d]) line(c, P(...EDGE_UV[d][0]), P(...EDGE_UV[d][1]), SIDEWALK); return; }
  for (let d = 0; d < 4; d++) {
    if (links[d]) continue;
    const [A, B] = EDGE_UV[d], inw = INWARD[d];
    const A2 = uvAt(A, inw, SW), B2 = uvAt(B, inw, SW);
    poly(c, [P(...A), P(...B), P(...B2), P(...A2)], SIDEWALK);
    line(c, P(...A2), P(...B2), SIDE_CURB);                         // cordolo verso la strada
    line(c, P(...A), P(...B), SIDE_LIGHT);                          // bordo esterno
    if (detail) for (const f of [0.25, 0.5, 0.75]) {               // giunti delle lastre
      const q = [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f];
      line(c, P(...q), P(...uvAt(q, inw, SW)), SIDE_JOINT);
    }
  }
  for (let d = 0; d < 4; d++) {                                     // angoli agli incroci e nelle curve
    const e = (d + 1) % 4;
    if (!links[d] || !links[e]) continue;
    const C = EDGE_UV[d][1];
    const a = uvAt(C, INWARD[d], SW), b = uvAt(a, INWARD[e], SW), cc = uvAt(C, INWARD[e], SW);
    poly(c, [P(...C), P(...a), P(...b), P(...cc)], SIDEWALK);
    line(c, P(...a), P(...b), SIDE_CURB); line(c, P(...b), P(...cc), SIDE_CURB);
  }
}

// tratti di linea lungo il braccio d, da s0 a s1 dal centro, spostati di o di lato
function armLine(c, P, d, s0, s1, o, color) {
  const { dx, dy } = DIRS[d];
  line(c, P(0.5 + dx * s0 - dy * o, 0.5 + dy * s0 + dx * o), P(0.5 + dx * s1 - dy * o, 0.5 + dy * s1 + dx * o), color);
}

// Strada asfaltata
function drawRoad(c, P, links, x, y, detail) {
  if (detail) asphaltGrain(c, P, x || 0, y || 0, '#666670', '#54545d');
  sidewalks(c, P, links, detail);
  const n = links.filter(Boolean).length;
  if (!detail) { if (n <= 2) for (let d = 0; d < 4; d++) if (links[d]) line(c, P(0.5, 0.5), P(...MID_UV[d]), LANE_COLOR); return; }
  if (n <= 2) for (let d = 0; d < 4; d++) if (links[d]) {         // mezzeria tratteggiata (agli incroci niente)
    armLine(c, P, d, 0.02, 0.16, 0, LANE_COLOR);
    armLine(c, P, d, 0.3, 0.44, 0, LANE_COLOR);
  }
  if (n >= 3) for (let d = 0; d < 4; d++) if (links[d]) {          // strisce di stop all'ingresso dell'incrocio
    const { dx, dy } = DIRS[d];
    const at = (s, o) => P(0.5 + dx * s - dy * o, 0.5 + dy * s + dx * o);
    line(c, at(0.36, 0.02), at(0.36, 0.33), '#e8e8e8');
  }
}

// Strada a senso unico: come la strada, con le frecce bianche nella direzione di marcia
function drawOneway(c, P, links, dir, x, y, detail) {
  if (detail) asphaltGrain(c, P, x || 0, y || 0, '#666670', '#54545d');
  sidewalks(c, P, links, detail);
  const { dx, dy } = DIRS[dir ?? 1];
  const at = (s, o) => P(0.5 + dx * s - dy * o, 0.5 + dy * s + dx * o);   // s lungo la freccia, o di lato
  line(c, at(-0.3, 0), at(0.16, 0), HW_LINE);
  poly(c, [at(0.33, 0), at(0.12, -0.13), at(0.12, 0.13)], HW_LINE);
}

// Autostrada: asfalto scuro, linee bianche (tratteggiate in mezzo, continue sui bordi), guardrail
function drawHighway(c, P, links, x, y, detail) {
  if (detail) asphaltGrain(c, P, x || 0, y || 0, '#5a5a64', '#34343c');
  for (let d = 0; d < 4; d++) {
    if (links[d]) {
      armLine(c, P, d, 0.06, 0.2, 0, HW_LINE);
      armLine(c, P, d, 0.34, 0.48, 0, HW_LINE);
      continue;
    }
    const a = P(...EDGE_UV[d][0]), b = P(...EDGE_UV[d][1]);
    const up = p => [p[0], p[1] - 2];
    for (const f of [0.1, 0.36, 0.63, 0.9]) {
      const q = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
      line(c, q, up(q), GUARD_POST);
    }
    line(c, up(a), up(b), RAIL_GUARD);
    line(c, [a[0], a[1] - 1], [b[0], b[1] - 1], '#6f757d');
  }
}

// Strada di terra: bordi d'erba, due solchi delle ruote verso i vicini collegati, sassolini
function drawDirt(c, P, links, x, y, detail) {
  if (detail) for (let i = 0; i < 8; i++) {
    const p = P(0.1 + hash(x || 0, y || 0, 70 + i) * 0.8, 0.1 + hash(x || 0, y || 0, 50 + i) * 0.8);
    c.fillStyle = i % 2 ? '#7d5f38' : '#c2a378'; c.fillRect(p[0], p[1], 0.5, 0.5);
  }
  for (let d = 0; d < 4; d++) {
    if (!links[d]) {
      line(c, P(...EDGE_UV[d][0]), P(...EDGE_UV[d][1]), DIRT_EDGE);
      if (detail) for (const f of [0.2, 0.5, 0.8]) {                 // ciuffi d'erba sul bordo
        const [A, B] = EDGE_UV[d], q = [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f];
        const p = P(...uvAt(q, INWARD[d], 0.05));
        c.fillStyle = '#5aa845'; c.fillRect(p[0] - 0.5, p[1] - 1, 1, 1);
      }
      continue;
    }
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
  if (DETAIL) for (let i = 0; i < 10; i++) {                                     // ghiaia della massicciata
    const p = P(0.22 + ((i * 37) % 10) / 18, 0.22 + ((i * 53) % 10) / 18);
    c.fillStyle = i % 2 ? '#a59a8a' : '#6f6658'; c.fillRect(p[0], p[1], 0.5, 0.5);
  }
  for (const d of arms) for (const s of [0.08, 0.25, 0.42]) {
    line(c, at(d, s, -0.24), at(d, s, 0.24), SLEEPER);
    if (DETAIL) aline(c, at(d, s - 0.02, -0.24), at(d, s - 0.02, 0.24), '#8a6440', 0.8);   // luce sulle traversine
  }
  for (const d of arms) for (const o of [-0.12, 0.12]) {
    line(c, at(d, 0, o), at(d, 0.5, o), STEEL);
    if (DETAIL) aline(c, at(d, 0, o + 0.03), at(d, 0.5, o + 0.03), '#6b7178', 0.8);          // ombra della rotaia
  }
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
// La casa è uno sprite in pixel art (assets/sprites/house.png: colonne = rotazioni, righe = colori).
// Finché l'immagine non è caricata si usa il disegno semplice qui sotto.
// Casa 1x1, disegnata come gli altri edifici: muri, tetto a due falde con il comignolo,
// porta (sul lato che dice la rotazione: 0 = +v, 1 = -u, 2 = -v, 3 = +u), finestre con persiane,
// vialetto e cespugli. Due tipi (villetta e casa a due piani) e tre colori.
const TALL_HOUSES = false;   // case a due piani in pausa (scelta dell'utente): true per riattivarle
function drawHouse(c, x, y, base, variant, rot) {
  const s = HOUSE_STYLES[(variant || 0) % HOUSE_STYLES.length];
  const r = (rot || 0) & 3;
  const tall = TALL_HOUSES && hash(x, y, 42) > 0.6;                      // casa a due piani
  const P = (u, v, z) => iso(x, y, u, v, base + z / STEP);
  const A = 0.17, B = 0.83, H = tall ? 21 : 13;
  const doorFace = ['+v', '-u', '-v', '+u'][r];
  // quadrilatero su un lato del muro: face '+v' (v = B) o '+u' (u = B), da a0 a a1, alto da z0 a z1
  const onFace = (face, a0, a1, z0, z1, color) => {
    const pt = (a, z) => face === '+v' ? P(a, B, z) : P(B, a, z);
    const q = [pt(a0, z0), pt(a1, z0), pt(a1, z1), pt(a0, z1)];
    poly(c, q, color);
    return q;
  };
  const windowOn = (face, a, z0) => {
    const q = onFace(face, a - 0.065, a + 0.065, z0, z0 + 5, '#9fd3e8');
    if (!DETAIL) return;
    aline(c, [(q[0][0] + q[1][0]) / 2, (q[0][1] + q[1][1]) / 2], [(q[3][0] + q[2][0]) / 2, (q[3][1] + q[2][1]) / 2], '#ffffff', 0.9);
    aline(c, [(q[0][0] + q[3][0]) / 2, (q[0][1] + q[3][1]) / 2], [(q[1][0] + q[2][0]) / 2, (q[1][1] + q[2][1]) / 2], '#ffffff', 0.9);
    for (let k = 0; k < 4; k++) aline(c, q[k], q[(k + 1) % 4], '#ffffff', 0.9);       // cornice
    onFace(face, a - 0.105, a - 0.07, z0, z0 + 5, s.shutter);                         // persiane
    onFace(face, a + 0.07, a + 0.105, z0, z0 + 5, s.shutter);
    onFace(face, a - 0.08, a + 0.08, z0 - 0.8, z0, '#f2f0ea');                        // davanzale
  };
  // vialetto davanti alla porta e due cespugli
  const toEdge = { '+v': [0.43, B, 0.57, 1], '+u': [B, 0.43, 1, 0.57], '-v': [0.43, 0, 0.57, A], '-u': [0, 0.43, A, 0.57] }[doorFace];
  poly(c, [P(toEdge[0], toEdge[1], 0), P(toEdge[2], toEdge[1], 0), P(toEdge[2], toEdge[3], 0), P(toEdge[0], toEdge[3], 0)], '#c9bfa8');
  const bush = { l: '#4a9a3c', r: '#3a7f30', t: '#5aae48', plain: true };
  // corpo della casa (senza coperchio: sopra c'è il tetto)
  const top = box(c, x, y, base, A, A, B, B, H, { l: s.l, r: s.r });
  const alongV = (r & 1) === 1;                           // il colmo è parallelo al lato della porta
  const chim = alongV ? [0.3, 0.6, 0.4, 0.7] : [0.6, 0.3, 0.7, 0.4];
  gableRoof(c, x, y, top, A - 0.07, A - 0.07, B + 0.07, B + 0.07, 8, { back: s.back, roof: s.roof, gable: s.r, gableL: s.l }, alongV,
    () => box(c, x, y, top, chim[0], chim[1], chim[2], chim[3], 13, { l: '#b5634a', r: '#8f4a36', t: '#3a3034', plain: true }));
  // porta, finestre (sui due lati che si vedono)
  for (const face of ['+v', '+u']) {
    const floors = tall ? [4, 12] : [4];
    if (face === doorFace) {
      const q = onFace(face, 0.43, 0.57, 0, 9, '#6b4424');
      if (DETAIL) {
        for (let k = 0; k < 4; k++) aline(c, q[k], q[(k + 1) % 4], '#f2f0ea', 0.9);
        const kn = face === '+v' ? P(0.54, B, 4.5) : P(B, 0.54, 4.5);
        c.fillStyle = '#f2d14a'; c.fillRect(kn[0], kn[1], 0.6, 0.6);           // maniglia
      }
      windowOn(face, 0.27, 4); windowOn(face, 0.73, 4);
      if (tall) { windowOn(face, 0.3, 12); windowOn(face, 0.7, 12); }
    } else for (const z of floors) { windowOn(face, 0.33, z); windowOn(face, 0.67, z); }
  }
  // cespugli agli angoli davanti
  box(c, x, y, base, 0.04, 0.86, 0.14, 0.96, 3, bush);
  box(c, x, y, base, 0.86, 0.04, 0.96, 0.14, 3, bush);
}

// Parallelepipedo da (u0, v0) a (u1, v1) rispetto all'angolo (ax, ay), alla quota base, alto hp pixel
// Con il dettaglio: righe leggere sui muri (mattoni / doghe), spigolo davanti illuminato,
// ombra alla base e contorno scuro come nella pixel art.
function box(c, ax, ay, base, u0, v0, u1, v1, hp, col) {
  const top = base + hp / STEP;
  const P = (u, v, h) => iso(ax, ay, u, v, h);
  poly(c, [P(u0, v1, base), P(u1, v1, base), P(u1, v1, top), P(u0, v1, top)], col.l); // lato sinistro
  poly(c, [P(u1, v1, base), P(u1, v0, base), P(u1, v0, top), P(u1, v1, top)], col.r); // lato destro
  if (DETAIL && hp >= 7 && !col.plain) {
    for (let z = 3; z < hp - 1.5; z += 3) {
      const h = base + z / STEP;
      aline(c, P(u0, v1, h), P(u1, v1, h), '#000000', 0.09);
      aline(c, P(u1, v1, h), P(u1, v0, h), '#000000', 0.09);
    }
  }
  if (col.t) poly(c, [P(u0, v0, top), P(u1, v0, top), P(u1, v1, top), P(u0, v1, top)], col.t);   // sopra
  if (DETAIL) {
    aline(c, P(u1, v1, base), P(u1, v1, top), '#ffffff', 0.35);                     // spigolo davanti
    if (col.t) { aline(c, P(u0, v1, top), P(u1, v1, top), '#ffffff', 0.3); aline(c, P(u1, v1, top), P(u1, v0, top), '#ffffff', 0.2); }
    aline(c, P(u0, v1, base), P(u1, v1, base), '#000000', 0.45);                    // base
    aline(c, P(u1, v1, base), P(u1, v0, base), '#000000', 0.45);
    aline(c, P(u0, v1, base), P(u0, v1, top), '#000000', 0.4);                      // contorno
    aline(c, P(u1, v0, base), P(u1, v0, top), '#000000', 0.4);
    if (col.t) { aline(c, P(u0, v1, top), P(u0, v0, top), '#000000', 0.3); aline(c, P(u0, v0, top), P(u1, v0, top), '#000000', 0.3); }
  }
  return top;
}

// Tetto a due falde con il colmo lungo u, appoggiato alla quota top, alto rh pixel
// mid = disegno da fare tra la falda dietro e quella davanti (es. il comignolo)
function gableRoof(c, ax, ay, top, u0, v0, u1, v1, rh, col, alongV, mid) {
  const P = (u, v, h) => iso(ax, ay, u, v, h);
  const ridge = top + rh / STEP;
  if (!alongV) {
    const vm = (v0 + v1) / 2;
    poly(c, [P(u0, v0, top), P(u1, v0, top), P(u1, vm, ridge), P(u0, vm, ridge)], col.back);
    if (mid) mid();
    poly(c, [P(u1, v1, top), P(u1, v0, top), P(u1, vm, ridge)], col.gable);
    poly(c, [P(u0, v1, top), P(u1, v1, top), P(u1, vm, ridge), P(u0, vm, ridge)], col.roof);
    if (DETAIL) roofLines(c, P(u0, v1, top), P(u1, v1, top), P(u0, vm, ridge), P(u1, vm, ridge));
  } else { // colmo lungo v (edificio ruotato)
    const um = (u0 + u1) / 2;
    poly(c, [P(u0, v0, top), P(u0, v1, top), P(um, v1, ridge), P(um, v0, ridge)], col.back);
    if (mid) mid();
    poly(c, [P(u0, v1, top), P(u1, v1, top), P(um, v1, ridge)], col.gableL || col.gable);
    poly(c, [P(u1, v0, top), P(u1, v1, top), P(um, v1, ridge), P(um, v0, ridge)], col.roof);
    if (DETAIL) roofLines(c, P(u1, v0, top), P(u1, v1, top), P(um, v0, ridge), P(um, v1, ridge));
  }
}
// file di tegole parallele alla gronda (a-b), colmo (c1-c2) chiaro, gronda scura
function roofLines(c, a, b, c1, c2) {
  const lerp = (p, q, f) => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
  for (const f of [0.22, 0.44, 0.66, 0.88]) aline(c, lerp(a, c1, f), lerp(b, c2, f), '#000000', 0.16);
  aline(c, c1, c2, '#ffffff', 0.4);
  aline(c, a, b, '#000000', 0.45);
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
  const q = [iso(ax, ay, u0, v0, base), iso(ax, ay, u1, v0, base), iso(ax, ay, u1, v1, base), iso(ax, ay, u0, v1, base)];
  poly(c, q, color);
  if (DETAIL) for (let k = 0; k < 4; k++) aline(c, q[k], q[(k + 1) % 4], '#000000', 0.18);
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
  if (!DETAIL) return;
  const lerp = (p, r2, f) => [p[0] + (r2[0] - p[0]) * f, p[1] + (r2[1] - p[1]) * f];
  if (d.color === '#9fd3e8') {                       // vetrate: divisori, riflesso in alto
    const n = Math.max(1, Math.round(Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]) / 5));
    for (let k = 1; k < n; k++) aline(c, lerp(q[0], q[1], k / n), lerp(q[3], q[2], k / n), '#e8f4fa', 0.8);
    aline(c, lerp(q[3], q[0], 0.25), lerp(q[2], q[1], 0.25), '#ffffff', 0.55);
  }
  aline(c, q[0], q[1], '#000000', 0.35); aline(c, q[1], q[2], '#000000', 0.35);
  aline(c, q[2], q[3], '#000000', 0.35); aline(c, q[3], q[0], '#000000', 0.35);
}
// Ordine dei pezzi (dal più lontano al più vicino): A va prima di B se gli sta tutto dietro,
// cioè dalla parte delle u o delle v più piccole. Prima si usava solo la somma dell'angolo più
// lontano e una cassa davanti a un capannone poteva finire disegnata prima (e coperta).
// Pezzi che si sovrappongono a terra (camini e insegne dentro un edificio) restano nell'ordine
// di prima: il più piccolo prima, così l'edificio copre la parte bassa e sporge solo la cima.
function partBefore(A, B) {
  const a = A.b, b = B.b, e = 1e-6;
  const aBehind = a[2] <= b[0] + e || a[3] <= b[1] + e;
  const bBehind = b[2] <= a[0] + e || b[3] <= a[1] + e;
  if (aBehind && !bBehind) return true;
  if (bBehind && !aBehind) return false;
  if (aBehind && bBehind) return A.i < B.i;       // non si coprono sullo schermo: ordine qualsiasi
  return A.depth < B.depth || (A.depth === B.depth && A.i < B.i);
}
function sortParts(items) {
  const left = items.slice(), out = [];
  while (left.length) {
    let k = left.findIndex(a => !left.some(b => b !== a && partBefore(b, a)));
    if (k < 0) k = 0;                              // (non dovrebbe succedere) si va avanti comunque
    out.push(left.splice(k, 1)[0]);
  }
  return out;
}
function drawParts(c, ax, ay, base, r, parts) {
  const items = sortParts(parts.map((p, i) => { const b = rotBox(p.box, r); return { p, b, i, depth: b[2] + b[3] }; }));
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
// goods = magazzino merci: muri azzurrini, insegna arancione, bancali di scatoloni invece delle casse
function drawWarehouse(c, ax, ay, base, r, goods) {
  const P = (u, v, h) => iso(ax, ay, u, v, h);
  groundRect(c, ax, ay, base, [0.28, 1.45, 0.72, 2.0], r, '#7b7f86');
  const door = a => ({ face: '+v', a, b: a + 0.35, z1: 11, color: goods ? '#5a4a3a' : '#4a4f5a' });
  const crate = goods ? { l: '#c9a46a', r: '#a8854f', t: '#dcbf8a' } : { l: '#a0703f', r: '#7f5630', t: '#c08a52' };
  drawParts(c, ax, ay, base, r, [
    { box: [0.15, 0.3, 1.85, 1.45], h: 18, col: goods ? { l: '#c3cbd6', r: '#9da6b2', t: '#6f7a86' } : { l: '#d2ccbe', r: '#aaa497', t: '#7d8a96' },
      doors: [door(0.32), door(0.82), door(1.32),
        { face: '+u', a: 0.5, b: 1.25, z0: 12, z1: 16, color: goods ? '#e07b39' : '#3fa34d' }],
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

// ---------- Settore del legno ----------
const LOG = { l: '#8a5a32', r: '#6b4424', t: '#d9b98a' };       // tronchi: corteccia e taglio chiaro
const PLANK = { l: '#e3c48a', r: '#c4a46c', t: '#f0d9a8' };
// catasta di tronchi: tre file sfalsate
function logPile(u0, v0, u1, v1, rows) {
  const out = [];
  for (let k = 0; k < rows; k++) out.push({ box: [u0 + k * 0.03, v0 + k * 0.02, u1 - k * 0.03, v1 - k * 0.02], h: 3 + k * 3, col: LOG });
  return out;
}

// Azienda forestale 2x2: baita di legno con tetto verde, cataste di tronchi e legna da ardere, piccolo camion
function drawForestry(c, ax, ay, base, r) {
  groundRect(c, ax, ay, base, [0.28, 1.2, 0.72, 2.0], r, '#7a5a32');
  drawParts(c, ax, ay, base, r, [
    { box: [0.12, 0.15, 1.05, 0.9], h: 11, col: { l: '#a8743f', r: '#86592f', t: '#a8743f' },
      roof: { rh: 7, back: '#2f5a2a', roof: '#3f7a35', gable: '#86592f' },
      doors: [{ face: '+v', a: 0.4, b: 0.6, z1: 7, color: '#4a2f1a' }, { face: '+v', a: 0.75, b: 0.92, z0: 4, z1: 8, color: '#9fd3e8' }] },
    ...logPile(1.2, 0.2, 1.88, 0.62, 3),
    ...logPile(1.2, 0.78, 1.88, 1.2, 2),
    { box: [1.0, 1.35, 1.3, 1.85], h: 6, col: { l: '#b07a48', r: '#8a5e36', t: '#c99560' } },   // legna da ardere
    { box: [1.45, 1.4, 1.85, 1.62], h: 6, col: { l: '#3f7a35', r: '#2f5a2a', t: '#5a9a48' } },   // camion
    { box: [1.45, 1.62, 1.85, 1.86], h: 4, col: LOG },
  ]);
}

// Segheria 2x2: capannone con tetto di lamiera aperto davanti, sega circolare, tronchi e pile di assi
function drawSawmill(c, ax, ay, base, r) {
  const P = (u, v, h) => iso(ax, ay, u, v, h);
  groundRect(c, ax, ay, base, [0.28, 1.3, 0.72, 2.0], r, '#8a7a5a');
  drawParts(c, ax, ay, base, r, [
    ...logPile(0.1, 0.15, 0.55, 1.1, 3),
    { box: [0.7, 0.15, 1.88, 1.25], h: 17, col: { l: '#c9a46a', r: '#a8854f', t: '#8a96a2' },
      roof: { rh: 6, back: '#6f7a86', roof: '#8a96a2', gable: '#a8854f' },
      doors: [{ face: '+v', a: 0.85, b: 1.45, z1: 12, color: '#3a2a1a' }, { face: '+u', a: 0.4, b: 0.9, z0: 9, z1: 13, color: '#9fd3e8' }],
      after(b, top) {   // lama della sega nel portone (lato +v senza rotazione): solo se quel lato si vede
        const n = rotVec(0, 1, r);
        if (!((n[0] === 0 && n[1] === 1) || (n[0] === 1 && n[1] === 0))) return;
        const [du, dv] = rotUV(1.15, 1.25, r);
        const [sx, sy] = P(du, dv, base + 6 / STEP);
        c.fillStyle = '#d5dade'; c.beginPath(); c.arc(sx, sy, 3.5, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#8a8f96'; c.beginPath(); c.arc(sx, sy, 1.2, 0, Math.PI * 2); c.fill();
      } },
    { box: [1.0, 1.45, 1.4, 1.85], h: 5, col: PLANK },
    { box: [1.5, 1.45, 1.88, 1.85], h: 8, col: PLANK },
  ]);
}

// Fabbrica di mobili 2x2: edificio di mattoni con tetto a denti di sega e un tavolo esposto fuori
function drawFurnitureFactory(c, ax, ay, base, r) {
  const P = (u, v, h) => iso(ax, ay, u, v, h);
  groundRect(c, ax, ay, base, [0.28, 1.45, 0.72, 2.0], r, '#7b7f86');
  const brick = { l: '#c27a52', r: '#9c5f3e', t: '#7d8590' };
  drawParts(c, ax, ay, base, r, [
    { box: [0.1, 0.2, 1.9, 1.4], h: 16, col: brick,
      doors: [{ face: '+v', a: 0.3, b: 0.72, z1: 11, color: '#4a4f5a' },
        { face: '+v', a: 0.95, b: 1.75, z0: 8, z1: 13, color: '#9fd3e8' },
        { face: '+u', a: 0.35, b: 1.25, z0: 8, z1: 13, color: '#9fd3e8' },
        { face: '+v', a: 0.95, b: 1.75, z0: 14, z1: 16, color: '#8a5a3a' }],
      after(b, top) {   // tetto a denti di sega
        const alongU = b[2] - b[0] >= b[3] - b[1];
        for (let i = 0; i < 5; i++) {
          const f0 = i / 5 + 0.02, f1 = i / 5 + 0.17;
          const q = alongU
            ? [P(b[0] + (b[2] - b[0]) * f0, b[1], top), P(b[0] + (b[2] - b[0]) * f1, b[1], top + 0.5), P(b[0] + (b[2] - b[0]) * f1, b[3], top + 0.5), P(b[0] + (b[2] - b[0]) * f0, b[3], top)]
            : [P(b[0], b[1] + (b[3] - b[1]) * f0, top), P(b[0], b[1] + (b[3] - b[1]) * f1, top + 0.5), P(b[2], b[1] + (b[3] - b[1]) * f1, top + 0.5), P(b[2], b[1] + (b[3] - b[1]) * f0, top)];
          poly(c, q, '#a9b6c2');
        }
      } },
    { box: [1.62, 0.32, 1.84, 0.54], h: 30, col: brick },
    { box: [1.05, 1.6, 1.45, 1.82], h: 3, col: { l: '#8a5a3a', r: '#6b4424', t: '#b07a48' } },   // tavolo
    { box: [1.55, 1.6, 1.72, 1.77], h: 2, col: { l: '#8a5a3a', r: '#6b4424', t: '#b07a48' } },   // sedia
  ]);
}

// Mercato dell'arredamento 2x2: grande negozio con vetrine, fascia arancione e insegna con un divano
function drawFurnitureStore(c, ax, ay, base, r) {
  const P = (u, v, h) => iso(ax, ay, u, v, h);
  groundRect(c, ax, ay, base, [0.08, 1.4, 1.92, 1.96], r, '#55555e');
  for (const u of [0.85, 1.2, 1.55]) {
    const A = rotUV(u, 1.5, r), B = rotUV(u, 1.88, r);
    line(c, P(A[0], A[1], base), P(B[0], B[1], base), '#e8e8e8');
  }
  drawParts(c, ax, ay, base, r, [
    { box: [0.12, 0.12, 1.88, 1.3], h: 15, col: { l: '#efe6d6', r: '#cbc1ae', t: '#9aa3ad' },
      doors: [{ face: '+v', a: 0.2, b: 1.8, z0: 11, z1: 14, color: '#e07b39' },
        { face: '+u', a: 0.12, b: 1.3, z0: 11, z1: 14, color: '#e07b39' },
        { face: '+v', a: 0.28, b: 0.62, z0: 0, z1: 8, color: '#9fd3e8' },
        { face: '+v', a: 0.75, b: 1.75, z0: 2, z1: 9, color: '#9fd3e8' },
        { face: '+u', a: 0.3, b: 1.15, z0: 2, z1: 9, color: '#9fd3e8' }] },
    { box: [0.7, 0.45, 1.3, 0.7], h: 21, col: { l: '#e07b39', r: '#b8602a', t: '#f09a5a' } },     // insegna
    { box: [0.8, 0.55, 1.2, 0.7], h: 24, col: { l: '#3f6fd9', r: '#2f55a8', t: '#5a86e8' } },     // divano sull'insegna
  ]);
}

// ---------- Settore tessile ----------
// Fabbrica tessile 2x2: vecchio opificio di mattoni con file di finestre, torre dell'acqua e balle di cotone
function drawTextileMill(c, ax, ay, base, r) {
  groundRect(c, ax, ay, base, [0.28, 1.45, 0.72, 2.0], r, '#7b7f86');
  const brick = { l: '#b5563f', r: '#8f4230', t: '#6f5a50' };
  const win = (face, a, z0) => ({ face, a, b: a + 0.14, z0, z1: z0 + 4, color: '#9fd3e8' });
  const wins = [];
  for (const z0 of [4, 12]) {
    for (const a of [0.2, 0.45, 0.95, 1.2]) wins.push(win('+v', a, z0));
    for (const a of [0.4, 0.65, 0.9]) wins.push(win('+u', a, z0));
  }
  drawParts(c, ax, ay, base, r, [
    { box: [0.12, 0.2, 1.5, 1.4], h: 20, col: brick, roof: { rh: 5, back: '#4a3a34', roof: '#5a4a42', gable: '#8f4230' },
      doors: [{ face: '+v', a: 0.66, b: 0.9, z1: 9, color: '#4a3020' }, ...wins] },
    { box: [1.6, 0.25, 1.86, 0.51], h: 34, col: { l: '#9a958b', r: '#7a756b', t: '#5a564e' } },   // torre dell'acqua
    { box: [1.6, 0.65, 1.86, 0.91], h: 5, col: { l: '#f4f2ea', r: '#d6d3c8', t: '#ffffff' } },     // balle di cotone
    { box: [1.6, 1.0, 1.86, 1.26], h: 5, col: { l: '#f4f2ea', r: '#d6d3c8', t: '#ffffff' } },
    { box: [1.1, 1.58, 1.34, 1.82], h: 4, col: { l: '#d9d2c2', r: '#b8b0a0', t: '#eee8da' } },     // balla di lana
    { box: [1.45, 1.58, 1.62, 1.75], h: 6, col: { l: '#d94f8a', r: '#b03a6c', t: '#e87aa8' } },     // rocchetti di filo
    { box: [1.66, 1.58, 1.83, 1.75], h: 6, col: { l: '#3f6fd9', r: '#2f55a8', t: '#5a86e8' } },
  ]);
}

// Fabbrica di abbigliamento 2x2: edificio moderno lilla con grandi vetrate e tetto a shed
function drawClothingFactory(c, ax, ay, base, r) {
  const P = (u, v, h) => iso(ax, ay, u, v, h);
  groundRect(c, ax, ay, base, [0.28, 1.45, 0.72, 2.0], r, '#7b7f86');
  drawParts(c, ax, ay, base, r, [
    { box: [0.12, 0.2, 1.88, 1.4], h: 15, col: { l: '#c8b6e2', r: '#a592c4', t: '#7d8590' },
      doors: [{ face: '+v', a: 0.3, b: 0.72, z1: 10, color: '#4a4f5a' },
        { face: '+v', a: 0.9, b: 1.78, z0: 5, z1: 12, color: '#9fd3e8' },
        { face: '+u', a: 0.3, b: 1.3, z0: 5, z1: 12, color: '#9fd3e8' },
        { face: '+v', a: 0.9, b: 1.78, z0: 13, z1: 15, color: '#d94f8a' }],
      after(b, top) {   // tetto a shed
        const alongU = b[2] - b[0] >= b[3] - b[1];
        for (let i = 0; i < 4; i++) {
          const f0 = i / 4 + 0.03, f1 = i / 4 + 0.18;
          const q = alongU
            ? [P(b[0] + (b[2] - b[0]) * f0, b[1], top), P(b[0] + (b[2] - b[0]) * f1, b[1], top + 0.45), P(b[0] + (b[2] - b[0]) * f1, b[3], top + 0.45), P(b[0] + (b[2] - b[0]) * f0, b[3], top)]
            : [P(b[0], b[1] + (b[3] - b[1]) * f0, top), P(b[0], b[1] + (b[3] - b[1]) * f1, top + 0.45), P(b[2], b[1] + (b[3] - b[1]) * f1, top + 0.45), P(b[2], b[1] + (b[3] - b[1]) * f0, top)];
          poly(c, q, '#e8eef3');
        }
      } },
    { box: [1.05, 1.58, 1.45, 1.84], h: 5, col: { l: '#c9a46a', r: '#a8854f', t: '#dcbf8a' } },   // scatoloni pronti
    { box: [1.55, 1.58, 1.85, 1.84], h: 3, col: { l: '#c9a46a', r: '#a8854f', t: '#dcbf8a' } },
  ]);
}

// Negozio di abbigliamento 2x2: boutique bianca con tenda a strisce rosa e una maglietta gigante sul tetto
function drawClothingStore(c, ax, ay, base, r) {
  const P = (u, v, h) => iso(ax, ay, u, v, h);
  groundRect(c, ax, ay, base, [0.08, 1.4, 1.92, 1.96], r, '#c9b89a');
  drawParts(c, ax, ay, base, r, [
    { box: [0.15, 0.15, 1.85, 1.3], h: 14, col: { l: '#f6f2ec', r: '#d6d0c6', t: '#b7aeb8' },
      doors: [{ face: '+v', a: 0.25, b: 0.6, z0: 0, z1: 8, color: '#9fd3e8' },
        { face: '+v', a: 0.75, b: 1.75, z0: 2, z1: 8, color: '#9fd3e8' },
        { face: '+u', a: 0.3, b: 1.15, z0: 2, z1: 8, color: '#9fd3e8' },
        { face: '+v', a: 0.2, b: 1.8, z0: 11, z1: 13, color: '#d94f8a' }],
      after(b) {   // tenda a strisce sopra le vetrine (sul lato davanti, quello verso l'entrata)
        const F = rotUV(0, 1.3, r);
        const n = rotVec(0, 1, r);
        if (!((n[0] === 0 && n[1] === 1) || (n[0] === 1 && n[1] === 0))) return;
        for (let i = 0; i < 8; i++) {
          const a0 = 0.2 + i * 0.2, a1 = a0 + 0.2;
          const A = rotUV(a0, 1.3, r), B = rotUV(a1, 1.3, r), A2 = rotUV(a0, 1.45, r), B2 = rotUV(a1, 1.45, r);
          poly(c, [P(A[0], A[1], base + 10 / STEP), P(B[0], B[1], base + 10 / STEP), P(B2[0], B2[1], base + 8 / STEP), P(A2[0], A2[1], base + 8 / STEP)], i % 2 ? '#ffffff' : '#e87aa8');
        }
      } },
    { box: [0.75, 0.5, 1.25, 0.66], h: 22, col: { l: '#3fa34d', r: '#2f7f3b', t: '#5abf68' } },    // maglietta sul tetto
    { box: [0.62, 0.5, 1.38, 0.66], h: 19, col: { l: '#3fa34d', r: '#2f7f3b', t: '#5abf68' } },    // maniche
  ]);
}

// Disegna la parte di edificio di un tile: case subito, edifici grandi sul tile più avanti
// dell'impronta (così sono già stati disegnati tutti i tile su cui poggiano)
function drawBuildingOn(c, x, y, b) {
  const def = BUILDINGS[b.kind];
  if (b.kind === 'house') {
    const t = game.map[y][x];
    drawHouse(c, x, y, t.elev, b.variant, b.rot);
    return;
  }
  if (b.kind === 'bakery') { drawBakery(c, x, y, game.map[y][x].elev, b.rot || 0); return; }
  if (b.kind === 'charcoalKiln') { drawCharcoalKiln(c, x, y, game.map[y][x].elev, b.rot || 0); return; }
  if (b.kind === 'waterWell') { drawWaterWell(c, x, y, game.map[y][x].elev, b.rot || 0); return; }
  if (b.kind === 'busStop') { drawBusStop(c, x, y, game.map[y][x].elev, b.rot || 0); return; }
  if (b.kind === 'pylon') { drawPylon(c, x, y, game.map[y][x].elev, b.armV !== false, game.map[y][x].type === T.WATER); return; }
  if (b.kind === 'pole') { drawPole(c, x, y, game.map[y][x].elev, b.armV !== false, b.feed); return; }
  if (b.kind === 'substation') { drawSubstation(c, x, y, game.map[y][x].elev, b.rot || 0); return; }
  if (b.kind === 'oilWell') { drawOilWell(c, x, y, game.map[y][x].elev, b.rot || 0); return; }
  if (b.kind === 'gasStation') { drawGasStation(c, x, y, game.map[y][x].elev, b.rot || 0); return; }
  if (x !== b.ax + def.w - 1 || y !== b.ay + def.h - 1) return;
  const base = game.map[b.ay][b.ax].elev;
  if (b.kind === 'farm') drawFarm(c, b.ax, b.ay, base, b.rot || 0);
  else if (b.kind === 'warehouse') drawWarehouse(c, b.ax, b.ay, base, b.rot || 0);
  else if (b.kind === 'goodsWarehouse') drawWarehouse(c, b.ax, b.ay, base, b.rot || 0, true);
  else if (b.kind === 'textileMill') drawTextileMill(c, b.ax, b.ay, base, b.rot || 0);
  else if (b.kind === 'clothingFactory') drawClothingFactory(c, b.ax, b.ay, base, b.rot || 0);
  else if (b.kind === 'clothingStore') drawClothingStore(c, b.ax, b.ay, base, b.rot || 0);
  else if (b.kind === 'factory') drawFactory(c, b.ax, b.ay, base, b.rot || 0);
  else if (b.kind === 'supermarket') drawSupermarket(c, b.ax, b.ay, base, b.rot || 0);
  else if (b.kind === 'dairy') drawDairy(c, b.ax, b.ay, base, b.rot || 0);
  else if (b.kind === 'slaughterhouse') drawSlaughterhouse(c, b.ax, b.ay, base, b.rot || 0);
  else if (b.kind === 'forestry') drawForestry(c, b.ax, b.ay, base, b.rot || 0);
  else if (b.kind === 'sawmill') drawSawmill(c, b.ax, b.ay, base, b.rot || 0);
  else if (b.kind === 'furnitureFactory') drawFurnitureFactory(c, b.ax, b.ay, base, b.rot || 0);
  else if (b.kind === 'furnitureStore') drawFurnitureStore(c, b.ax, b.ay, base, b.rot || 0);
  else if (b.kind === 'sewage') drawSewage(c, b.ax, b.ay, base, b.rot || 0, b.flow || 0);
  else if (b.kind === 'waterPlant') drawWaterPlant(c, b.ax, b.ay, base, b.rot || 0);
  else if (b.kind === 'busDepot') drawBusDepot(c, b.ax, b.ay, base, b.rot || 0);
  else if (b.kind === 'livestock') drawLivestock(c, b.ax, b.ay, base, b.rot || 0, b.animal || 'cowFarm', b.level || 0);
  else if (b.kind === 'coalPlant') drawCoalPlant(c, b.ax, b.ay, base, b.rot || 0);
  else if (b.kind === 'solarPlant') drawSolarPlant(c, b.ax, b.ay, base, b.rot || 0);
  else if (b.kind === 'windPlant') drawWindPlant(c, b.ax, b.ay, base, b.rot || 0);
  else if (b.kind === 'oilPlatform') drawOilPlatform(c, b.ax, b.ay, base, b.rot || 0);
  else if (b.kind === 'port') drawPort(c, b.ax, b.ay, base, b.rot || 0);
  else if (b.kind === 'refinery') drawRefinery(c, b.ax, b.ay, base, b.rot || 0);
}

// ---------- Allevamenti ----------
// Recinto di legno sui bordi (con un varco all'entrata), un ricovero sul fondo e gli animali
const ANIMALS = {
  cowFarm: { col: { l: '#f2f2f2', r: '#cfcfcf', t: '#ffffff' }, head: '#2b2b33', len: 0.2, wid: 0.1, h: 6, spots: '#2b2b33',
    at: [[0.55, 1.15], [1.25, 1.0], [1.4, 1.55], [0.85, 1.6]] },
  chickenFarm: { col: { l: '#f6f6f2', r: '#d8d8d0', t: '#ffffff' }, head: '#d94141', len: 0.06, wid: 0.06, h: 3,
    at: [[0.5, 1.1], [0.7, 1.35], [1.1, 1.05], [1.3, 1.4], [0.95, 1.65], [1.55, 1.2], [1.6, 1.65], [0.4, 1.6]] },
  pigFarm: { col: { l: '#f0a0b0', r: '#d0808f', t: '#f8b8c4' }, head: '#e8899a', len: 0.15, wid: 0.09, h: 4,
    at: [[0.6, 1.2], [1.15, 1.05], [1.4, 1.5], [0.85, 1.6], [1.6, 1.1]] },
  sheepFarm: { col: { l: '#f4f1e8', r: '#d6d2c6', t: '#fbf9f2' }, head: '#3a3a40', len: 0.14, wid: 0.1, h: 5,
    at: [[0.5, 1.1], [1.0, 1.0], [1.45, 1.25], [0.75, 1.55], [1.25, 1.65], [1.65, 1.6]] },
};
const SHEDS = {
  cowFarm: { box: [0.1, 0.1, 1.0, 0.7], h: 12, col: { l: '#b5473a', r: '#8f372d', t: '#b5473a' }, roof: { rh: 6, back: '#5a4036', roof: '#6b4a3a', gable: '#8f372d' } },
  chickenFarm: { box: [0.1, 0.1, 0.85, 0.6], h: 9, col: { l: '#f2f2ee', r: '#cfcfc8', t: '#f2f2ee' }, roof: { rh: 5, back: '#8a2a22', roof: '#b5473a', gable: '#cfcfc8' } },
  pigFarm: { box: [0.1, 0.1, 1.0, 0.6], h: 8, col: { l: '#b08a5a', r: '#8a6a42', t: '#b08a5a' }, roof: { rh: 4, back: '#5a4036', roof: '#7a5a3a', gable: '#8a6a42' } },
  sheepFarm: { box: [0.1, 0.1, 0.85, 0.6], h: 9, col: { l: '#a07c4c', r: '#7d5f38', t: '#a07c4c' }, roof: { rh: 5, back: '#4a3a2a', roof: '#6b5a42', gable: '#7d5f38' } },
};
function drawLivestock(c, ax, ay, base, r, kind, level = UPGRADE.max) {
  const P = (u, v, h) => iso(ax, ay, u, v, h);
  const A = ANIMALS[kind];
  // recinto: lati (senza rotazione) con il varco dell'entrata su v = 2, u da 0 a 1
  const fence = [[[0, 0], [2, 0]], [[0, 0], [0, 2]], [[2, 0], [2, 2]], [[1, 2], [2, 2]]].map(([a, b]) => [rotUV(...a, r), rotUV(...b, r)]);
  const isFront = ([a, b]) => (a[0] === 2 && b[0] === 2) || (a[1] === 2 && b[1] === 2);
  const drawFence = seg => {
    const [a, b] = seg;
    for (const z of [2, 4]) line(c, P(a[0], a[1], base + z / STEP), P(b[0], b[1], base + z / STEP), '#7a5230');
    const n = Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) * 3);
    for (let i = 0; i <= n; i++) {
      const u = a[0] + (b[0] - a[0]) * i / n, v = a[1] + (b[1] - a[1]) * i / n;
      line(c, P(u, v, base), P(u, v, base + 5 / STEP), '#5e3c20');
    }
  };
  fence.filter(f => !isFront(f)).forEach(drawFence);
  groundRect(c, ax, ay, base, [0.3, 1.7, 0.7, 2.0], r, '#a07c4c');      // passaggio dell'entrata
  const parts = [Object.assign({}, SHEDS[kind])];
  // più miglioramenti = più animali (mucche: 1 all'inizio, 4 al massimo; gli altri in proporzione)
  const shown = Math.max(1, Math.ceil(A.at.length * (Math.min(level, UPGRADE.max) + 1) / (UPGRADE.max + 1)));
  for (const [u, v] of A.at.slice(0, shown)) {
    parts.push({ box: [u - A.len, v - A.wid, u + A.len, v + A.wid], h: A.h, col: A.col,
      after(b, top) {
        // testa sul lato +u (dopo la rotazione su uno dei lati del corpo) e macchie per le mucche
        const hu = b[2] - b[0] >= b[3] - b[1];
        const hb = hu ? [b[2], (b[1] + b[3]) / 2 - A.wid * 0.6, b[2] + A.wid * 0.9, (b[1] + b[3]) / 2 + A.wid * 0.6]
                      : [(b[0] + b[2]) / 2 - A.wid * 0.6, b[3], (b[0] + b[2]) / 2 + A.wid * 0.6, b[3] + A.wid * 0.9];
        box(c, ax, ay, base + A.h * 0.3 / STEP, ...hb, A.h * 0.6, { l: A.head, r: shade(A.head, -0.2), t: A.head });
        if (A.spots) poly(c, [P(b[0] + 0.05, b[1] + 0.03, top), P(b[0] + 0.15, b[1] + 0.03, top), P(b[0] + 0.15, b[1] + 0.09, top), P(b[0] + 0.05, b[1] + 0.09, top)], A.spots);
      } });
  }
  drawParts(c, ax, ay, base, r, parts);
  fence.filter(isFront).forEach(drawFence);
}

// Caseificio 2x2: edificio bianco con tetto azzurro e due grandi cisterne del latte
function drawDairy(c, ax, ay, base, r) {
  groundRect(c, ax, ay, base, [0.28, 1.45, 0.72, 2.0], r, '#7b7f86');
  const tank = { l: '#d5dade', r: '#aab2ba', t: '#eef2f5' };
  drawParts(c, ax, ay, base, r, [
    { box: [0.12, 0.25, 1.35, 1.45], h: 16, col: { l: '#f2f2ee', r: '#cfcfc8', t: '#f2f2ee' },
      roof: { rh: 7, back: '#2f55b0', roof: '#3f6fd9', gable: '#cfcfc8' },
      doors: [{ face: '+v', a: 0.3, b: 0.7, z1: 11, color: '#4a4f5a' }, { face: '+v', a: 0.85, b: 1.2, z0: 7, z1: 12, color: '#9fd3e8' }] },
    { box: [1.5, 0.2, 1.82, 0.52], h: 28, col: tank },
    { box: [1.5, 0.68, 1.82, 1.0], h: 28, col: tank },
    { box: [1.45, 1.3, 1.85, 1.8], h: 8, col: { l: '#e6d9c2', r: '#c0b399', t: '#b0a48c' } },
  ]);
}

// Macello e industria della carne 2x2: capannone con fascia rossa e cella frigorifera bianca
function drawSlaughterhouse(c, ax, ay, base, r) {
  groundRect(c, ax, ay, base, [0.28, 1.45, 0.72, 2.0], r, '#7b7f86');
  drawParts(c, ax, ay, base, r, [
    { box: [0.12, 0.2, 1.3, 1.45], h: 17, col: { l: '#c9c4b8', r: '#a59f91', t: '#7d8590' },
      doors: [{ face: '+v', a: 0.3, b: 0.72, z1: 11, color: '#4a4f5a' },
        { face: '+v', a: 0.12, b: 1.3, z0: 13, z1: 16, color: '#c83232' },
        { face: '+u', a: 0.2, b: 1.45, z0: 13, z1: 16, color: '#c83232' }] },
    { box: [1.42, 0.25, 1.88, 1.15], h: 14, col: { l: '#e8eef3', r: '#c4ccd4', t: '#f2f5f8' },
      doors: [{ face: '+v', a: 1.52, b: 1.78, z1: 9, color: '#9fb0c0' }] },
    { box: [0.95, 0.35, 1.1, 0.5], h: 26, col: { l: '#8a8f96', r: '#6b7077', t: '#5b5f66' } },
  ]);
}

// Fabbrica alimentare 2x2: capannone in mattoni con tetto a shed, ciminiera che fuma, cisterna e uffici
function drawFactory(c, ax, ay, base, r) {
  const P = (u, v, h) => iso(ax, ay, u, v, h);
  groundRect(c, ax, ay, base, [0.28, 1.45, 0.72, 2.0], r, '#7b7f86');
  const brick = { l: '#b0603f', r: '#8a4a30', t: '#7d8590' };
  drawParts(c, ax, ay, base, r, [
    { box: [0.1, 0.25, 1.5, 1.45], h: 18, col: brick,
      doors: [{ face: '+v', a: 0.32, b: 0.72, z1: 12, color: '#4a4f5a' },
        { face: '+v', a: 0.9, b: 1.35, z0: 9, z1: 14, color: '#9fd3e8' },
        { face: '+u', a: 0.45, b: 1.25, z0: 9, z1: 14, color: '#9fd3e8' }],
      after(b, top) { // tetto a shed: strisce chiare e scure
        const alongU = b[2] - b[0] >= b[3] - b[1];
        for (let i = 0; i < 4; i++) {
          const f0 = i / 4 + 0.03, f1 = i / 4 + 0.14;
          const q = alongU
            ? [P(b[0] + (b[2] - b[0]) * f0, b[1], top), P(b[0] + (b[2] - b[0]) * f1, b[1], top + 0.4), P(b[0] + (b[2] - b[0]) * f1, b[3], top + 0.4), P(b[0] + (b[2] - b[0]) * f0, b[3], top)]
            : [P(b[0], b[1] + (b[3] - b[1]) * f0, top), P(b[0], b[1] + (b[3] - b[1]) * f1, top + 0.4), P(b[2], b[1] + (b[3] - b[1]) * f1, top + 0.4), P(b[2], b[1] + (b[3] - b[1]) * f0, top)];
          poly(c, q, '#9fb0c0');
        }
      } },
    { box: [1.62, 0.25, 1.86, 0.49], h: 40, col: brick,
      after(b, top) { // fumo
        const [sx, sy] = P((b[0] + b[2]) / 2, (b[1] + b[3]) / 2, top);
        c.fillStyle = 'rgba(220,220,225,0.7)';
        for (const [dx, dy, rr] of [[0, -4, 3], [3, -9, 4], [7, -15, 5]]) { c.beginPath(); c.arc(sx + dx, sy + dy, rr, 0, Math.PI * 2); c.fill(); }
      } },
    { box: [1.6, 0.7, 1.9, 1.05], h: 16, col: { l: '#c9d2dc', r: '#a5b0bd', t: '#e8eef3' } },
    { box: [1.0, 1.55, 1.55, 1.9], h: 10, col: { l: '#e6d9c2', r: '#c0b399', t: '#b0a48c' },
      doors: [{ face: '+v', a: 1.15, b: 1.4, z0: 4, z1: 8, color: '#9fd3e8' }] },
  ]);
}

// Supermercato 2x2: negozio bianco con vetrina e fascia blu, parcheggio davanti all'entrata
function drawSupermarket(c, ax, ay, base, r) {
  const P = (u, v, h) => iso(ax, ay, u, v, h);
  groundRect(c, ax, ay, base, [0.08, 1.32, 1.92, 1.96], r, '#55555e');
  for (const u of [0.85, 1.2, 1.55]) { // strisce dei posti auto
    const A = rotUV(u, 1.45, r), B = rotUV(u, 1.85, r);
    line(c, P(A[0], A[1], base), P(B[0], B[1], base), '#e8e8e8');
  }
  drawParts(c, ax, ay, base, r, [
    { box: [0.15, 0.15, 1.85, 1.25], h: 16, col: { l: '#ece8de', r: '#cbc6ba', t: '#9aa3ad' },
      doors: [{ face: '+v', a: 0.25, b: 1.75, z0: 11, z1: 15, color: '#3f6fd9' },
        { face: '+u', a: 0.15, b: 1.25, z0: 11, z1: 15, color: '#3f6fd9' },
        { face: '+v', a: 0.3, b: 1.0, z0: 0, z1: 9, color: '#9fd3e8' },
        { face: '+v', a: 1.15, b: 1.7, z0: 3, z1: 8, color: '#9fd3e8' }] },
    { box: [0.85, 0.5, 1.25, 0.7], h: 22, col: { l: '#d94141', r: '#a83030', t: '#e86a6a' } }, // insegna sul tetto
  ]);
}

// Panificio 1x1: bottega con tetto a due falde, tenda a strisce e vetrina sul lato della porta
function drawBakery(c, x, y, base, r) {
  const P = (u, v, h) => iso(x, y, u, v, h);
  const top = box(c, x, y, base, 0.14, 0.14, 0.86, 0.86, 12, { l: '#efdcbc', r: '#cdb894', t: '#efdcbc' });
  gableRoof(c, x, y, top, 0.1, 0.1, 0.9, 0.9, 6, { back: '#6b3a24', roof: '#8a4a2a', gable: '#cdb894', gableL: '#efdcbc' }, (r & 1) === 1);
  const front = (r & 1) === 0 ? 'v' : 'u';   // lato con porta, vetrina e tenda (sempre uno dei due visibili)
  const F = (a, z, out) => front === 'v' ? P(a, 0.86 + (out || 0), base + z / STEP) : P(0.86 + (out || 0), a, base + z / STEP);
  poly(c, [F(0.22, 2), F(0.45, 2), F(0.45, 7), F(0.22, 7)], '#9fd3e8');      // vetrina
  poly(c, [F(0.55, 0), F(0.72, 0), F(0.72, 7), F(0.55, 7)], '#6b3a24');      // porta
  for (let i = 0; i < 5; i++) {                                              // tenda a strisce
    const a0 = 0.16 + i * 0.136, a1 = a0 + 0.136;
    poly(c, [F(a0, 10), F(a1, 10), F(a1, 8, 0.12), F(a0, 8, 0.12)], i % 2 ? '#f2f5f8' : '#d94141');
  }
}

// ---------- Tile ----------
// Parete sul lato davanti verso la direzione d (1 = destra/SE, 2 = sinistra/SW):
// va dal bordo del tile fino al bordo del vicino (o al suolo fuori mappa)
// lip = colore del bordo in cima (l'erba che sporge sopra la terra); con il dettaglio si vedono gli strati
function drawWall(c, x, y, h, d, color, lip) {
  const [ka, kb] = d === 1 ? [1, 2] : [3, 2];
  const na = neighborCornerHeight(x, y, d, ka), nb = neighborCornerHeight(x, y, d, kb);
  const ba = Math.min(h[ka], na), bb = Math.min(h[kb], nb);
  if (h[ka] <= ba && h[kb] <= bb) return;
  const [ua, va] = CORNERS[ka], [ub, vb] = CORNERS[kb];
  poly(c, [iso(x, y, ua, va, h[ka]), iso(x, y, ub, vb, h[kb]), iso(x, y, ub, vb, bb), iso(x, y, ua, va, ba)], color);
  if (!DETAIL) return;
  if (FINE) for (let k = 1; h[ka] - k > ba + 0.1 && h[kb] - k > bb + 0.1; k++)               // strati
    aline(c, iso(x, y, ua, va, h[ka] - k), iso(x, y, ub, vb, h[kb] - k), '#000000', 0.16);
  if (FINE) for (let k = 0; k < 3; k++) {                                          // sassi nella parete
    const f = hash(x * 7 + d, y, 110 + k), z = hash(x, y * 3 + d, 120 + k);
    const za = ba + (h[ka] - ba) * z, zb = bb + (h[kb] - bb) * z;
    if (h[ka] - ba < 0.6) break;
    const p = iso(x, y, ua + (ub - ua) * f, va + (vb - va) * f, za + (zb - za) * f);
    c.fillStyle = shadeC(color, k % 2 ? 0.2 : -0.25); c.fillRect(p[0], p[1], 1, 0.5);
  }
  if (lip) { aline(c, iso(x, y, ua, va, h[ka]), iso(x, y, ub, vb, h[kb]), lip, 1, 1.4); }   // bordo d'erba
  aline(c, iso(x, y, ua, va, ba), iso(x, y, ub, vb, bb), '#000000', 0.3);         // ombra alla base
}

// Colore della superficie di un percorso: più chiaro/scuro se è una rampa
function slopeShade(x, y, colors) {
  const r = rampDir(x, y);
  return r < 0 ? colors[0] : (r === 0 || r === 3 ? colors[1] : colors[2]);
}

// shade() con la memoria: nei disegni ripetuti (erba, sassi, pareti) non si ricalcola il colore
const shadeMem = new Map();
function shadeC(hex, f) {
  const k = hex + f;
  let v = shadeMem.get(k);
  if (!v) { v = shade(hex, f); shadeMem.set(k, v); }
  return v;
}

// Tono leggermente diverso per ogni tile (5 gradini, in memoria)
const varyCache = new Map();
function varyTone(color, r) {
  const k = color + ((r * 5) | 0);
  let v = varyCache.get(k);
  if (!v) { v = shade(color, (((r * 5) | 0) - 2) * 0.005); varyCache.set(k, v); }
  return v;
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
    const lip = (t.type === T.GRASS || t.type === T.FOREST || t.type === T.SNOW) && !t.path ? col[0] : null;
    drawWall(c, x, y, h, 2, wallColor(t, 1, col), lip); // sinistra, verso (x, y+1)
    drawWall(c, x, y, h, 1, wallColor(t, 2, col), lip); // destra, verso (x+1, y)
  }

  let top = col[0];
  if (t.path === 'road' || t.path === 'oneway') top = slopeShade(x, y, [ROAD_COLOR, RAMP_LIGHT, RAMP_DARK]);
  else if (t.path === 'highway') top = slopeShade(x, y, HW_COLORS);
  else if (t.path === 'dirt') top = slopeShade(x, y, DIRT_COLORS);
  else if (t.field) top = SOIL;
  else if (t.building && GROUND[t.building.kind === 'livestock' ? t.building.animal : t.building.kind]) top = GROUND[t.building.kind === 'livestock' ? t.building.animal : t.building.kind];
  else if (detail && t.type !== T.WATER) top = varyTone(top, hash(x, y, 7));   // un po' di variazione: il prato non sembra una scacchiera
  else if (t.type === T.WATER && detail) {              // l'acqua cambia tono piano piano, a onde
    waterSeen = true;
    const w = Math.sin(animT * 0.8 + x * 0.55 + y * 0.85) + Math.sin(animT * 0.5 - x * 0.3 + y * 0.2) * 0.5;
    top = shadeC(top, Math.round(w * 2) * 0.012);
  }
  poly(c, [P(0, 0), P(1, 0), P(1, 1), P(0, 1)], top);
  if (detail && t.type === T.WATER) {
    waterDetail(c, x, y, P);
    drawStain(c, x, y, P);
    const foam = 0.45 + 0.35 * Math.sin(animT * 1.6 + (x + y) * 0.7);   // schiuma lungo la riva
    for (let d = 0; d < 4; d++) {
      const nx = x + DIRS[d].dx, ny = y + DIRS[d].dy;
      if (!inMap(nx, ny) || game.map[ny][nx].type === T.WATER) continue;
      const [A, B] = EDGE_UV[d], inw = [-DIRS[d].dx * 0.08, -DIRS[d].dy * 0.08];
      aline(c, P(A[0] + inw[0], A[1] + inw[1]), P(B[0] + inw[0], B[1] + inw[1]), '#e4f3fb', foam, 0.8);
      const k2 = 0.16 + 0.04 * Math.sin(animT * 1.6 + (x + y) * 0.7 + 1.5);
      const in2 = [-DIRS[d].dx * k2, -DIRS[d].dy * k2];
      aline(c, P(A[0] + in2[0] + 0.2 * (B[0] - A[0]), A[1] + in2[1] + 0.2 * (B[1] - A[1])),
        P(A[0] + in2[0] + 0.8 * (B[0] - A[0]), A[1] + in2[1] + 0.8 * (B[1] - A[1])), '#bfe0f4', foam * 0.6, 0.6);
    }
  }

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
    // collegato anche verso un ponte che parte da qui
    const links = [0, 1, 2, 3].map(d => roadLinked(x, y, d) || !!bridgeFromHead(x, y, d));
    if (t.rb) drawRoundabout(c, x, y, P);
    else if (t.path === 'road') drawRoad(c, P, links, x, y, detail);
    else if (t.path === 'oneway') drawOneway(c, P, links, t.dir, x, y, detail);
    else if (t.path === 'highway') drawHighway(c, P, links, x, y, detail);
    else if (t.path === 'dirt') drawDirt(c, P, links, x, y, detail);
    else drawRail(c, P, links);
    return;
  }
  if (t.field) { const [crop, stage] = fieldLook(t); drawField(c, P, crop, stage); return; }

  const sx = (x - y) * TW / 2;
  const sy = (x + y) * TH / 2 - t.elev * STEP;
  if (detail && FINE && !onlyTop && !t.building) terrainDetail(c, x, y, t, P, col);

  if (t.building) { drawBuildingOn(c, x, y, t.building); return; }
  if (t.type === T.FOREST && !onlyTop) drawTree(c, sx, sy, x, y);
}

// ---------- Ponti ----------
// Impalcato del tile i del ponte b (sopra il tile x, y): pilastri ai lati, fianco visibile,
// strada con cordoli e ringhiere. alpha < 1 per l'anteprima.
const DECK_T = 0.4;   // spessore dell'impalcato (livelli)
function drawBridgeSpan(c, x, y, b, i) {
  const h = deckCorners(b, i);
  const P = (u, v) => iso(x, y, u, v, heightIn(h, u, v));
  const Pd = (u, v, dz) => iso(x, y, u, v, heightIn(h, u, v) - dz);
  const alongU = DIRS[b.d].dx !== 0;
  const ground = Math.max(...cornerHeights(x, y));
  const low = Math.min(...h) - DECK_T;
  // pilastri ai due lati, ma mai sopra strade, binari o case: lì il ponte passa sopra senza appoggiarsi
  const under = game.map[y] && game.map[y][x];
  const free = !(under && (under.path || under.building));
  if (low > ground + 0.15 && free) {
    for (const o of [0.1, 0.9]) {
      const [u0, v0, u1, v1] = alongU ? [0.43, o - 0.06, 0.57, o + 0.06] : [o - 0.06, 0.43, o + 0.06, 0.57];
      box(c, x, y, ground, u0, v0, u1, v1, (heightIn(h, 0.5, 0.5) - DECK_T - ground) * STEP, { l: DECK.pillarL, r: DECK.pillarR });
    }
  }
  // fianco davanti (quello che si vede) e fine dell'impalcato verso le teste
  if (alongU) poly(c, [P(0, 1), P(1, 1), Pd(1, 1, DECK_T), Pd(0, 1, DECK_T)], DECK.l);
  else poly(c, [P(1, 0), P(1, 1), Pd(1, 1, DECK_T), Pd(1, 0, DECK_T)], DECK.r);
  const hw = bridgePath(b) === 'highway';
  poly(c, [P(0, 0), P(1, 0), P(1, 1), P(0, 1)], hw ? HW_COLORS[0] : DECK.top);
  const links = [0, 1, 2, 3].map(d => d === b.d || d === (b.d + 2) % 4);
  if (hw) drawHighway(c, P, links, x, y, DETAIL); else drawRoad(c, P, links, x, y, true);
  // ringhiere sui due lati lunghi
  const sides = alongU ? [[[0, 0], [1, 0]], [[0, 1], [1, 1]]] : [[[0, 0], [0, 1]], [[1, 0], [1, 1]]];
  for (const [A, B] of sides) {
    const a = P(...A), bb = P(...B), up = p => [p[0], p[1] - 3];
    for (const f of [0, 0.34, 0.67, 1]) {
      const q = [a[0] + (bb[0] - a[0]) * f, a[1] + (bb[1] - a[1]) * f];
      line(c, q, up(q), GUARD_POST);
    }
    line(c, up(a), up(bb), DECK.rail);
  }
}

// Bocca del tunnel: arco di pietra sul fianco della collina verso la testa (solo sui lati che si vedono)
function drawPortal(c, x, y, face, floor) {
  if (face !== 1 && face !== 2) return;
  const [k1, k2] = EDGES[face];
  const [u1, v1] = CORNERS[k1], [u2, v2] = CORNERS[k2];
  const at = (f, z) => iso(x, y, u1 + (u2 - u1) * f, v1 + (v2 - v1) * f, floor + z);
  const arch = (f0, f1, z0, zs, zt) => {
    const pts = [at(f0, z0)];
    for (let k = 0; k <= 8; k++) { const f = f0 + (f1 - f0) * k / 8; pts.push(at(f, zs + (zt - zs) * Math.sin(Math.PI * k / 8))); }
    pts.push(at(f1, z0));
    return pts;
  };
  const s = Math.max(0.5, Math.min(1, (game.map[y][x].elev - floor) / 1.25));   // collina bassa: arco più basso
  poly(c, arch(0.1, 0.9, 0, 0.75 * s, 1.25 * s), face === 2 ? '#b9b4aa' : '#9a958b');   // cornice di pietra
  poly(c, arch(0.2, 0.8, 0, 0.6 * s, 1.0 * s), '#16161c');                               // galleria buia
  line(c, at(0.2, 0.02), at(0.8, 0.02), '#2c2c34');
}

// Anteprima del tunnel: entrata e uscita evidenziate, percorso tratteggiato sopra la collina
function drawTunnelPlanTile(c, x, y, plan, i) {
  const P = surface(x, y), a = 0.1, b = 0.9;
  const shape = () => { c.beginPath(); c.moveTo(...P(a, a)); c.lineTo(...P(b, a)); c.lineTo(...P(b, b)); c.lineTo(...P(a, b)); c.closePath(); };
  const head = i === 0 || i === plan.n;
  if (head) {
    shape();
    c.fillStyle = plan.ok ? (i === 0 ? 'rgba(93,255,122,0.35)' : 'rgba(93,200,255,0.45)') : 'rgba(255,93,93,0.35)'; c.fill();
    c.strokeStyle = plan.ok ? (i === 0 ? '#5dff7a' : '#5dc8ff') : '#ff5d5d'; c.lineWidth = 1.5; c.stroke();
    if (plan.ok && plan.n > 0) drawPortal(c, ...(i === 0 ? bridgeTile(plan, 1) : bridgeTile(plan, plan.n - 1)), i === 0 ? (plan.d + 2) % 4 : plan.d, plan.e[i === 0 ? 0 : plan.n - 1]);
    return;
  }
  c.setLineDash([3, 2]);
  shape(); c.strokeStyle = plan.ok ? '#ffd966' : '#ff5d5d'; c.lineWidth = 1; c.stroke();
  c.setLineDash([]);
}

// Anteprima del ponte che si sta trascinando: impalcato trasparente se va bene,
// contorno rosso sui tile se non si può fare
function drawBridgePlanTile(c, x, y, plan, i) {
  if (plan.kind === 'tunnel') { drawTunnelPlanTile(c, x, y, plan, i); return; }
  if (plan.ok && i > 0 && i < plan.n) {
    c.globalAlpha = 0.7;
    drawBridgeSpan(c, x, y, plan, i);
    c.globalAlpha = 1;
    return;
  }
  const P = surface(x, y), a = 0.1, b = 0.9;
  c.strokeStyle = plan.ok ? '#5dff7a' : '#ff5d5d'; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(...P(a, a)); c.lineTo(...P(b, a)); c.lineTo(...P(b, b)); c.lineTo(...P(a, b)); c.closePath(); c.stroke();
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
  const savedField = t.field, savedPipe = t.pipe;
  const old = { path: t.path, main: t.main, dir: t.dir };
  if (PATHS[tool]) {
    if (old.path) t.path = tool; else setPath(p.x, p.y, tool);
    if (PATHS[tool].oneway) t.dir = game.pathDir;
    updateRoundabouts();
  }
  else if (tool === 'field') t.field = true;
  else if (tool === 'pipe' && !checkTool('pipe', p.x, p.y)) t.pipe = true;
  else if (BUILDINGS[tool]) {
    const b = { kind: tool, variant: houseVariant(p.x, p.y), ax: p.x, ay: p.y, rot: game.rotation, animal: tool === 'livestock' ? defaultAnimal(p.x, p.y) : undefined };
    for (const [q] of saved) game.map[q.y][q.x].building = b;
  }
  try { draw(); } finally {
    if (PATHS[tool]) {
      if (old.path) Object.assign(t, old); else setPath(p.x, p.y, null);
      if (old.dir === undefined) delete t.dir;
      updateRoundabouts();
    }
    t.field = savedField; t.pipe = savedPipe;
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
function drawEntrance(c, b) { for (const ent of entrancesOf(b)) drawEntranceMark(c, b, ent); }
function drawEntranceMark(c, b, ent) {
  if (!inMap(ent.x, ent.y)) return;
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

// Segna quali tile sono già stati disegnati in questo fotogramma (senza azzerare ogni volta)
let drawStampData = null;
function drawStamp(N) {
  if (!drawStampData || drawStampData.arr.length !== N * N) drawStampData = { arr: new Uint32Array(N * N), id: 0 };
  drawStampData.id++;
  if (drawStampData.id > 4e9) { drawStampData.arr.fill(0); drawStampData.id = 1; }
  return drawStampData;
}

let drawStampData2 = null;
function drawStamp2(N) {
  if (!drawStampData2 || drawStampData2.arr.length !== N * N) drawStampData2 = { arr: new Uint32Array(N * N), id: 0 };
  drawStampData2.id++;
  return drawStampData2;
}

// Ordine del pittore (vedi drawFrame): fila per fila, ogni tile aspetta quello a sinistra e quello sopra,
// gli edifici grandi il loro tile più avanti, e chi sta davanti a un veicolo il tile del veicolo.
// Usato per lo schermo e per le immagini della vista da lontano (farcache).
function paintTiles(N, y0, y1, rowA, rowB, visible, foot, drawNode) {
  const stamp = drawStamp(N);
  const onStack = drawStamp2(N);
  const isDone = k => stamp.arr[k] === stamp.id;
  // tile da aspettare al posto di (px, py), visto da (x, y)
  const before = (px, py, x, y) => {
    if (px < 0 || py < 0 || !visible(px, py)) return -1;
    const b = game.map[py][px].building;
    if (b && b.kind !== 'house') {
      const d = BUILDINGS[b.kind];
      if ((d.w > 1 || d.h > 1) && game.map[y][x].building !== b) {
        const fx = b.ax + d.w - 1, fy = b.ay + d.h - 1;
        return inMap(fx, fy) && visible(fx, fy) ? fy * N + fx : -1;
      }
    }
    const pk = py * N + px, va = foot.get(pk);
    // un veicolo che sporge in questo tile: chi gli sta davanti aspetta il tile dove si disegna il veicolo
    if (va !== undefined && va !== y * N + x && foot.get(y * N + x) !== va) {
      const ax = va % N, ay = (va - ax) / N;
      if (visible(ax, ay)) return va;
    }
    return pk;
  };
  const stack = [];
  const run = k0 => {
    if (isDone(k0)) return;
    stack.push(k0);
    while (stack.length) {
      const k = stack[stack.length - 1];
      if (isDone(k)) { stack.pop(); continue; }
      const x = k % N, y = (k - x) / N;
      const a = before(x - 1, y, x, y), b = before(x, y - 1, x, y);
      // (onStack: se un tile è già in attesa più giù nella pila non si aspetta di nuovo: niente giri infiniti)
      if (a >= 0 && !isDone(a) && a !== k && onStack.arr[a] !== onStack.id) { onStack.arr[a] = onStack.id; stack.push(a); continue; }
      if (b >= 0 && !isDone(b) && b !== k && onStack.arr[b] !== onStack.id) { onStack.arr[b] = onStack.id; stack.push(b); continue; }
      stamp.arr[k] = stamp.id;
      stack.pop();
      drawNode(x, y);
    }
  };
  for (let y = y0; y <= y1; y++) {
    const xa = rowA(y), xb = rowB(y);
    for (let x = xa; x <= xb; x++) if (visible(x, y)) run(y * N + x);
  }
}

function drawFrame() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#1a1c2c';
  ctx.fillRect(0, 0, view.w, view.h);
  if (!game.map) return;

  clampCamera(); // la telecamera non esce dai bordi della mappa
  const z = zoomLevel();
  ctx.setTransform(z, 0, 0, z, Math.round(cam.x), Math.round(cam.y));
  ctx.imageSmoothingEnabled = false;
  DETAIL = z >= 1; FINE = z >= 2;
  animT = performance.now() / 1000; waterSeen = false; animSeen = false;

  const r = visibleRange();
  const detail = z >= 1;
  const pv = previewTile();
  const pvList = pv ? previewTiles(pv) : [];
  const inPreview = (x, y) => pvList.some(p => p.x === x && p.y === y);
  const ha = game.hover ? hoverAnchorTile() : null;
  const vmap = vehiclesByTile();
  const sel = game.selected && game.buildings.get(game.selected);
  const selFront = sel ? [sel.ax + BUILDINGS[sel.kind].w - 1, sel.ay + BUILDINGS[sel.kind].h - 1] : null;
  const plan = game.bridgePlan;
  const oilView = game.tool && BUILDINGS[game.tool] && BUILDINGS[game.tool].oil;   // con pozzo o piattaforma si vedono i giacimenti
  const planKeys = plan ? new Map(plan.tiles.map((p, i) => [p.y * game.size + p.x, i])) : null;

  // zona visibile in coordinate mondo (con margine per pareti, alberi ed edifici alti)
  const left = -cam.x / z - TW, right = (view.w - cam.x) / z + TW;
  const topY = -cam.y / z - TH, bottomY = (view.h - cam.y) / z + 48;

  // dal fondo al fronte (ordine del pittore), fila per fila.
  // Anteprima e contorno della selezione si disegnano subito dopo il loro tile:
  // così i blocchi davanti li coprono, come farebbero con l'oggetto vero.
  // Edifici grandi (2x2): si disegnano sul tile più avanti dell'impronta, ma i tile alla loro
  // destra nelle file di dietro (es. una casa accanto alla fattoria) stanno davanti e vanno disegnati
  // DOPO: ogni tile aspetta il tile a sinistra e quello sopra; se uno dei due è di un edificio
  // grande, aspetta il tile più avanti di quell'edificio (che a sua volta aspetta i suoi tile).
  // Prima la casa accanto alla fattoria veniva coperta dalla fattoria (segnalazione dell'utente).
  const N = game.size;
  const rowA = y => Math.max(r.x0, Math.floor(y + left / (TW / 2)));
  const rowB = y => Math.min(r.x1, Math.ceil(y + right / (TW / 2)));
  const visible = (x, y) => {
    if (y < r.y0 || y > r.y1 || x < rowA(y) || x > rowB(y)) return false;
    const gy = (x + y) * TH / 2;
    return !(gy - game.map[y][x].elev * STEP > bottomY || gy + TH < topY);
  };
  // zona dei campi della fattoria (modalità campi, o fattoria in mano): si colora tile per tile alla
  // quota di ogni tile, così segue il terreno (prima una linea sola alla quota della fattoria sembrava
  // sollevata e non si capiva quali tile ne facevano parte)
  const fArea = (() => {
    const f = game.fieldMode ? game.buildings.get(game.fieldMode) : (game.tool === 'farm' && game.hover ? { ax: game.hover.x, ay: game.hover.y } : null);
    if (f) { const R = FARM.fieldRadius; return { x0: f.ax - R, y0: f.ay - R, x1: f.ax + 1 + R, y1: f.ay + 1 + R }; }
    return null;
  })();
  const inArea = (x, y) => fArea && x >= fArea.x0 && x <= fArea.x1 && y >= fArea.y0 && y <= fArea.y1;
  const drawAreaTile = (x, y) => {
    const h = cornerHeights(x, y), P = k => iso(x, y, CORNERS[k][0], CORNERS[k][1], h[k]);
    const pts = [0, 1, 2, 3].map(P);
    ctx.fillStyle = fArea.elec ? 'rgba(111, 227, 255, 0.13)' : 'rgba(255, 217, 102, 0.16)';
    ctx.beginPath(); ctx.moveTo(...pts[0]); for (const p of pts.slice(1)) ctx.lineTo(...p); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = fArea.elec ? '#6fe3ff' : '#ffd966'; ctx.lineWidth = 1.4;
    for (let d = 0; d < 4; d++) {
      if (inArea(x + DIRS[d].dx, y + DIRS[d].dy)) continue;   // bordo solo verso fuori
      const [a, b] = EDGES[d];
      ctx.beginPath(); ctx.moveTo(...pts[a]); ctx.lineTo(...pts[b]); ctx.stroke();
    }
  };
  const drawNode = (x, y) => {
    drawTile(ctx, x, y, detail);
    if (inArea(x, y) && !game.map[y][x].building) drawAreaTile(x, y);
    if (oilView) drawOilSpot(ctx, x, y);
    if (game.tool === 'waterWell') drawWaterSpot(ctx, x, y);
    if (pv && inPreview(x, y)) {
      ctx.globalAlpha = 0.75;
      withPreview(pv, () => drawTile(ctx, x, y, detail, true));
      ctx.globalAlpha = 1;
    }
    if (ha && x === ha.x && y === ha.y) drawHover(ctx);
    if (selFront && x === selFront[0] && y === selFront[1]) drawSelection(ctx, sel);
    const vs = vmap.get(y * N + x);
    if (vs) for (const v of vs) drawVehicle(ctx, v);
    // ponte sopra questo tile, poi le auto che ci passano sopra
    const tb = game.map[y][x].bridge;
    if (tb) {
      const br = game.bridges.get(tb.id);
      if (!isTunnel(br)) drawBridgeSpan(ctx, x, y, br, tb.i);
      else if (tb.i === 1) drawPortal(ctx, x, y, (br.d + 2) % 4, br.e[0]);           // bocca verso la prima testa
      if (isTunnel(br) && tb.i === br.n - 1) drawPortal(ctx, x, y, br.d, br.e[br.n - 1]);  // e verso l'altra
    }
    if (planKeys && planKeys.has(y * N + x)) drawBridgePlanTile(ctx, x, y, plan, planKeys.get(y * N + x));
    const vb = vmap.get(nodeKey(x, y, 1));
    if (vb) for (const v of vb) drawVehicle(ctx, v);
  };
  if (z < 1 && FAR_CACHE && !window.FAR_OFF) {
    // vista da lontano: il paesaggio fermo viene dalle immagini in memoria (farcache), sopra si
    // disegnano solo le cose che cambiano (anteprima, contorni, veicoli, icone)
    drawFar(z, r, rowA, rowB, visible);
    for (let y = r.y0; y <= r.y1; y++) for (let x = rowA(y), xb = rowB(y); x <= xb; x++) {
      if (!visible(x, y)) continue;
      if (inArea(x, y) && !game.map[y][x].building) drawAreaTile(x, y);
      if (oilView) drawOilSpot(ctx, x, y);
      if (game.tool === 'waterWell') drawWaterSpot(ctx, x, y);
    }
    if (pv) { ctx.globalAlpha = 0.75; for (const p of pvList) if (inMap(p.x, p.y)) withPreview(pv, () => drawTile(ctx, p.x, p.y, false, true)); ctx.globalAlpha = 1; }
    if (planKeys) for (const [k, i] of planKeys) { const x = k % N; drawBridgePlanTile(ctx, x, (k - x) / N, plan, i); }
    if (ha) drawHover(ctx);
    if (sel) drawSelection(ctx, sel);
    const vs = [];
    for (const list of vmap.values()) vs.push(...list);
    vs.sort((a, b) => (a.pos.mx + a.pos.my) - (b.pos.mx + b.pos.my));
    for (const v of vs) drawVehicle(ctx, v);
  } else paintTiles(N, r.y0, r.y1, rowA, rowB, visible, vmap.foot, drawNode);
  drawPowerLines(ctx);
  drawSewagePipes(ctx);   // tubo dello scarico sopra il mare (dopo i tile d'acqua, così non ci finisce sotto)
  if (pipeViewOn()) drawPipeOverlay(ctx);   // mappa dei tubi sopra tutto (anche sotto le case)
  if ((game.tool === 'pylon' || game.tool === 'pole') && game.hover) drawPylonPreview(ctx, game.hover, game.tool === 'pole');
  if (game.tool === 'substation' && game.hover) drawSubstationPreview(ctx, game.hover);
  if (ELEC_TOOLS.includes(game.tool)) drawPowerIcons(ctx);
  drawWorkerIcons(ctx);
  for (const v of vehicles) if (v.crash > 0 && v.pos) drawCrash(ctx, v);   // incidenti: sopra a tutto, si devono vedere
  if (sel) drawOwnVehicles(ctx, sel);
  DETAIL = true; FINE = true;   // icone e altri disegni fuori dal fotogramma: sempre dettagliati
}

// Edificio selezionato: sopra i suoi furgoni (e le sue navi) una freccia gialla che dondola, così si
// vede quali sono (richiesta dell'utente)
function drawOwnVehicles(c, b) {
  const d = BUILDINGS[b.kind], e = game.map[b.ay][b.ax].elev;
  const [bx, by] = iso(b.ax, b.ay, d.w / 2, d.h / 2, e + (d.height || 20) * 0.6 / STEP);   // dal centro dell'edificio
  for (const v of vehicles) {
    if (v.from !== b.id || !v.pos) continue;
    const p = v.pos, ship = v.kind === 'ship';
    const [sx, sy] = iso(0, 0, p.mx, p.my, p.h + (ship ? 14 : 7) / STEP);
    const y = sy - 3 - Math.sin(animT * 5) * 1.5;
    // linea tratteggiata che scorre dall'edificio al veicolo (richiesta dell'utente: si vede meglio)
    // ad arco sopra la mappa e azzurra, così non si confonde con le strisce gialle della strada
    const mx = (bx + sx) / 2, my = (by + y - 6) / 2 - 18 - Math.hypot(sx - bx, y - by) * 0.18;
    const path = () => { c.beginPath(); c.moveTo(bx, by); c.quadraticCurveTo(mx, my, sx, y - 6); };
    c.save();
    c.strokeStyle = 'rgba(16, 18, 32, 0.6)'; c.lineWidth = 3; path(); c.stroke();
    c.setLineDash([5, 3]); c.lineDashOffset = -animT * 14;
    c.strokeStyle = '#6fe3ff'; c.lineWidth = 1.5; path(); c.stroke();
    c.restore();
    c.fillStyle = '#6fe3ff'; c.strokeStyle = '#1a1c2c'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(sx - 4, y - 6); c.lineTo(sx + 4, y - 6); c.lineTo(sx, y); c.closePath(); c.fill(); c.stroke();
    animSeen = true;
  }
}

// Con il traliccio (o il palo) in mano: linee tratteggiate verso quelli a cui si collegherebbe.
// Traliccio vicino al bordo: freccia che esce dalla mappa = si compra e si vende la corrente fuori.
const ELEC_TOOLS = ['pylon', 'pole', 'substation', 'coalPlant', 'solarPlant', 'windPlant'];
function drawPylonPreview(c, h, lv) {
  if (!inMap(h.x, h.y)) return;
  const N = game.size, t = game.map[h.y][h.x];
  const e = t.elev + (!lv && t.type === T.WATER ? 3 / STEP : 0);
  const from = iso(h.x, h.y, 0.5, 0.5, e + (lv ? POLE_TOP : PYLON_ARM - 3) / STEP);
  c.save(); c.setLineDash([4, 3]); c.lineWidth = 1.4; c.strokeStyle = lv ? '#ffd34d' : '#6fe3ff';
  for (const b of game.buildings.values()) {
    let ok = false, to;
    const be = game.map[b.ay][b.ax].elev, d = BUILDINGS[b.kind];
    if (lv) {
      if (b.kind === 'pole') { ok = (b.ax - h.x) ** 2 + (b.ay - h.y) ** 2 <= ELEC.poleRange ** 2; to = iso(b.ax, b.ay, 0.5, 0.5, be + POLE_TOP / STEP); }
      else if (b.kind !== 'pylon' && !d.water) { ok = distToBuilding(b, h.x, h.y) <= ELEC.poleReach && b.lv == null; to = iso(b.ax, b.ay, d.w / 2, d.h / 2, be + Math.min(d.height, 30) * 0.6 / STEP); }
    } else {
      if (b.kind === 'pylon') { ok = (b.ax - h.x) ** 2 + (b.ay - h.y) ** 2 <= ELEC.pylonRange ** 2; to = iso(b.ax, b.ay, 0.5, 0.5, be + (PYLON_ARM - 3) / STEP); }
      else if (b.kind === 'substation') { ok = distToBuilding(b, h.x, h.y) <= ELEC.linkRange; to = iso(b.ax, b.ay, 0.7, 0.62, be + 17 / STEP); }
    }
    if (!ok || (b.ax === h.x && b.ay === h.y)) continue;
    c.beginPath(); c.moveTo(...from); c.lineTo(...to); c.stroke();
  }
  c.restore();
  if (lv) return;
  // il bordo più vicino: se è entro la portata del traliccio, freccia verso fuori mappa
  const ds = [[h.y, 0, -1], [N - 1 - h.x, 1, 0], [N - 1 - h.y, 0, 1], [h.x, -1, 0]];   // [distanza, dx, dy]
  ds.sort((a, b) => a[0] - b[0]);
  const [dist, dx, dy] = ds[0];
  if (dist > ELEC.pylonRange) return;
  const ex = h.x + dx * dist, ey = h.y + dy * dist;   // tile sul bordo
  const ee = game.map[ey][ex].elev;
  const A = iso(ex, ey, 0.5 + dx * 0.5, 0.5 + dy * 0.5, ee + 1), B = iso(ex, ey, 0.5 + dx * 3, 0.5 + dy * 3, ee + 1);
  const pulse = 0.6 + 0.4 * Math.sin(animT * 4); animSeen = true;
  c.save();
  if (dist > 0) { c.setLineDash([2, 4]); c.strokeStyle = 'rgba(111,227,255,0.7)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(...from); c.lineTo(...A); c.stroke(); c.setLineDash([]); }
  const ang = Math.atan2(B[1] - A[1], B[0] - A[0]);
  c.globalAlpha = pulse; c.strokeStyle = '#6fe3ff'; c.fillStyle = '#6fe3ff'; c.lineWidth = 3;
  c.beginPath(); c.moveTo(...A); c.lineTo(B[0] - Math.cos(ang) * 6, B[1] - Math.sin(ang) * 6); c.stroke();
  c.beginPath(); c.moveTo(...B);
  c.lineTo(B[0] - Math.cos(ang - 0.5) * 10, B[1] - Math.sin(ang - 0.5) * 10);
  c.lineTo(B[0] - Math.cos(ang + 0.5) * 10, B[1] - Math.sin(ang + 0.5) * 10); c.closePath(); c.fill();
  c.globalAlpha = 1;
  const txt = dist === 0 ? TR('⚡ Fuori mappa: compra e vende corrente') : TR('⚡ Fuori mappa tra {n} tile: compra e vende corrente', { n: dist });
  // scritta a grandezza fissa sullo schermo (non cresce con lo zoom)
  const T0 = c.getTransform(), sx = T0.a * from[0] + T0.e, sy = T0.d * from[1] + T0.f;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.font = 'bold 12px monospace'; c.textAlign = 'center';
  const tw = c.measureText(txt).width;
  c.fillStyle = 'rgba(14,15,26,0.85)'; c.fillRect(sx - tw / 2 - 5, sy - 40 * T0.a / 2 - 16, tw + 10, 18);
  c.fillStyle = '#6fe3ff'; c.fillText(txt, sx, sy - 40 * T0.a / 2 - 3);
  c.restore();
}
// Con la sottostazione in mano (richiesta dell'utente): prima di piazzarla si vede a cosa si collegherà.
// Azzurro = il traliccio più vicino entro ELEC.linkRange (alta tensione); giallo = la bassa tensione
// (strada asfaltata accanto o palo della luce entro ELEC.poleReach). Se manca qualcosa, una scritta lo dice.
function drawSubstationPreview(c, h) {
  if (!inMap(h.x, h.y)) return;
  const e = game.map[h.y][h.x].elev, from = iso(h.x, h.y, 0.7, 0.62, e + 17 / STEP);
  const fake = { kind: 'substation', ax: h.x, ay: h.y };
  let pyl = null, pd = Infinity;
  for (const b of game.buildings.values()) {
    if (b.kind !== 'pylon') continue;
    const d = distToBuilding(fake, b.ax, b.ay);
    if (d <= ELEC.linkRange && d < pd) { pyl = b; pd = d; }
  }
  let road = null;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const x = h.x + dx, y = h.y + dy;
    if (inMap(x, y) && cablePath(game.map[y][x])) { road = [x, y]; break; }
  }
  let pole = null;
  if (!road) {
    let bd = Infinity;
    for (const b of game.buildings.values()) {
      if (b.kind !== 'pole') continue;
      const d = distToBuilding(fake, b.ax, b.ay);
      if (d <= ELEC.poleReach && d < bd) { pole = b; bd = d; }
    }
  }
  c.save(); c.setLineDash([4, 3]); c.lineWidth = 1.6;
  if (pyl) {
    c.strokeStyle = '#6fe3ff';
    c.beginPath(); c.moveTo(...from); c.lineTo(...iso(pyl.ax, pyl.ay, 0.5, 0.5, game.map[pyl.ay][pyl.ax].elev + (game.map[pyl.ay][pyl.ax].type === T.WATER ? 3 / STEP : 0) + (PYLON_ARM - 3) / STEP)); c.stroke();
  }
  c.strokeStyle = '#ffd34d';
  if (road) { c.beginPath(); c.moveTo(...iso(h.x, h.y, 0.5, 0.5, e + 2 / STEP)); c.lineTo(...iso(road[0], road[1], 0.5, 0.5, game.map[road[1]][road[0]].elev + 1 / STEP)); c.stroke(); }
  else if (pole) { c.beginPath(); c.moveTo(...from); c.lineTo(...iso(pole.ax, pole.ay, 0.5, 0.5, game.map[pole.ay][pole.ax].elev + POLE_TOP / STEP)); c.stroke(); }
  c.setLineDash([]);
  // scritta a grandezza fissa: cosa c'è e cosa manca
  const lines = [
    [pyl ? '#6fe3ff' : '#ff8a8a', pyl ? TR('✓ Traliccio collegato (alta tensione)') : TR('✗ Nessun traliccio entro {n} tile', { n: ELEC.linkRange })],
    [road || pole ? '#ffd34d' : '#ff8a8a', road ? TR('✓ Strada accanto (bassa tensione)') : pole ? TR('✓ Palo della luce collegato (bassa tensione)') : TR('✗ Serve una strada asfaltata accanto o un palo della luce')],
  ];
  const T0 = c.getTransform(), sx = T0.a * from[0] + T0.e, sy = T0.d * from[1] + T0.f;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.font = 'bold 12px monospace'; c.textAlign = 'left';
  const w = Math.max(...lines.map(l => c.measureText(l[1]).width)) + 10, top = sy + 30 * T0.a / 2 + 6;   // sotto, così non copre i fili
  c.fillStyle = 'rgba(14,15,26,0.85)'; c.fillRect(sx - w / 2, top, w, 36);
  lines.forEach(([col, t], i) => { c.fillStyle = col; c.fillText(t, sx - w / 2 + 5, top + 14 + i * 16); });
  c.restore();
}

// Con gli strumenti dell'energia: sopra case e attività un fulmine giallo (corrente) o grigio (senza)
function drawPowerIcons(c) {
  for (const b of game.buildings.values()) {
    if (!isConsumer(b)) continue;
    const d = BUILDINGS[b.kind], e = game.map[b.ay][b.ax].elev;
    const [x, y] = iso(b.ax, b.ay, d.w / 2, d.h / 2, e + (Math.min(d.height, 30) + 8) / STEP);
    const on = (b.powered || 0) > 0.5;
    c.fillStyle = on ? '#ffd34d' : '#5b5b66'; c.strokeStyle = '#1a1c2c'; c.lineWidth = 0.8;
    c.beginPath(); c.moveTo(x + 1, y - 5); c.lineTo(x - 2.5, y + 0.5); c.lineTo(x, y + 0.5); c.lineTo(x - 1, y + 5); c.lineTo(x + 2.5, y - 0.5); c.lineTo(x, y - 0.5); c.closePath(); c.fill(); c.stroke();
  }
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
// Icone di stato sopra le attività:
//  persona rossa/arancione = mancano lavoratori, scatola arancione = deposito pieno,
//  cassa vuota blu = mancano materie prime, scaffale viola = supermercato senza merce
const STATUS_COLORS = { noWorkers: '#d94141', fewWorkers: '#e8a33a', full: '#e07b39', noInput: '#3f6fd9', empty: '#8e5bd1', noRoad: '#5b5b66', noPower: '#c99a1e', noWater: '#2f7fd0' };
function drawWorkerIcons(c) {
  for (const b of game.buildings.values()) {
    const st = buildingStatus(b);
    if (!st) continue;
    const d = BUILDINGS[b.kind], e = game.map[b.ay][b.ax].elev;
    const [x, y] = iso(b.ax, b.ay, d.w / 2, d.h / 2, e + (d.height + 10) / STEP);
    drawStatusIcon(c, st, x, y);
  }
}

// Icona di stato (cerchio colorato con un simbolo) centrata in (x, y); usata anche dal manuale
function drawStatusIcon(c, st, x, y) {
    c.fillStyle = STATUS_COLORS[st];
    c.strokeStyle = '#1a1c2c'; c.lineWidth = 1;
    c.beginPath(); c.arc(x, y, 6, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = '#ffffff'; c.strokeStyle = '#ffffff';
    if (st === 'noWorkers' || st === 'fewWorkers') {
      c.beginPath(); c.arc(x, y - 2.5, 1.6, 0, Math.PI * 2); c.fill();   // testa
      c.fillRect(x - 2, y - 0.5, 4, 4);                                  // corpo
      c.fillStyle = STATUS_COLORS[st];
      c.fillRect(x - 0.5, y + 1.5, 1, 2);                                // gambe
    } else if (st === 'full') {
      c.fillRect(x - 3, y - 1, 6, 4); c.fillRect(x - 2, y - 4, 4, 2);   // casse impilate
    } else if (st === 'noInput') {
      c.lineWidth = 1; c.strokeRect(x - 3, y - 2, 6, 5);                 // cassa vuota
      c.fillRect(x - 0.5, y - 4.5, 1, 1.5);
    } else if (st === 'noRoad') {                                     // strada sbarrata
      c.fillRect(x - 3.5, y - 3, 1, 6); c.fillRect(x + 2.5, y - 3, 1, 6);
      c.fillRect(x - 0.5, y - 3, 1, 1.5); c.fillRect(x - 0.5, y + 0.5, 1, 1.5);
      c.strokeStyle = '#ff5d5d'; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(x - 4, y + 4); c.lineTo(x + 4, y - 4); c.stroke();
    } else if (st === 'noWater') {                                    // goccia sbarrata
      c.beginPath(); c.moveTo(x, y - 4.5); c.quadraticCurveTo(x + 3.2, y - 0.5, x + 2.4, y + 1.6); c.arc(x, y + 1.6, 2.4, 0, Math.PI); c.quadraticCurveTo(x - 3.2, y - 0.5, x, y - 4.5); c.fill();
      c.strokeStyle = '#ff5d5d'; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(x - 4, y + 4); c.lineTo(x + 4, y - 4); c.stroke();
    } else if (st === 'noPower') {                                    // fulmine sbarrato
      c.beginPath(); c.moveTo(x + 1, y - 4.5); c.lineTo(x - 2.5, y + 0.5); c.lineTo(x - 0.2, y + 0.5); c.lineTo(x - 1, y + 4.5); c.lineTo(x + 2.5, y - 0.5); c.lineTo(x + 0.2, y - 0.5); c.closePath(); c.fill();
      c.strokeStyle = '#ff5d5d'; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(x - 4, y + 4); c.lineTo(x + 4, y - 4); c.stroke();
    } else if (st === 'empty') {
      for (const dy of [-3, 0, 3]) c.fillRect(x - 3.5, y + dy, 7, 1);    // scaffale vuoto
    }
}

// In modalità campi: zona tratteggiata dove si possono mettere i campi della fattoria
function drawFieldArea(c, f) {
  f = f || game.buildings.get(game.fieldMode);
  if (!f || !inMap(f.ax, f.ay)) return;
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
