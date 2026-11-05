// ---------- Acqua (richiesta dell'utente) ----------
// Tubi sotto TUTTE le strade (anche quelle di terra; non i binari): case e attività con una strada
// su un lato sono collegate. L'acqua arriva da:
//  - pozzo dell'acqua (1x1, sulle falde: zone azzurre con il pozzo in mano), 1 lavoratore
//  - depuratore dell'acqua di mare (2x2, il retro sul mare come il porto), 3 lavoratori
// Le acque sporche vanno allo scarico (1x1, sull'acqua accanto a una strada, senza lavoratori):
// intorno l'acqua diventa marrone. Senza acqua (o senza scarico) le case si riempiono solo a metà
// (WATER.dryHouse) e le attività lavorano più piano (WATER.drySpeed).

// falde acquifere: rumore dal seed della mappa (più facili da trovare del petrolio)
function groundwaterAt(x, y) {
  if (!inMap(x, y) || game.map[y][x].type === T.WATER) return 0;
  const v = fbm(x / 14, y / 14, (game.seed || 0) * 5 + 77);
  return Math.max(0, Math.min(1, (v - 0.5) / 0.15));
}
function pipePath(t) { return !!t.path && t.path !== 'rail'; }
function isWaterUser(b) { const d = BUILDINGS[b.kind]; return !d.infra && !d.water && !POWER[b.kind] && b.kind !== 'waterWell' && b.kind !== 'waterPlant'; }
function waterDemand(b) { return b.kind === 'house' ? (b.residents || 0) * WATER.perResident : WATER.perBusiness; }
function houseCap(h) { return !WATER.required || (h.watered || 0) >= 0.5 ? HOUSE_CAPACITY : WATER.dryHouse; }
function waterFactor(b) { return WATER.required && isWaterUser(b) && (b.watered || 0) < 0.5 ? WATER.drySpeed : 1; }

function buildWaterNets() {
  const N = game.size, par = new Map();
  const find = k => { let r = k; while (par.has(r) && par.get(r) !== r) r = par.get(r); par.set(k, r); return r; };
  const unite = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) par.set(ra, rb); };
  const ok = (x, y) => inMap(x, y) && pipePath(game.map[y][x]);
  for (const k of game.pathKeys) {
    const x = k % N, y = (k - x) / N;
    if (!ok(x, y)) continue;
    find(k);
    if (ok(x + 1, y)) unite(k, k + 1);
    if (ok(x, y + 1)) unite(k, k + N);
  }
  for (const br of game.bridges.values()) {   // ponti e tunnel: i tubi passano da una testa all'altra
    const [x1, y1] = bridgeTile(br, br.n);
    if (ok(br.x0, br.y0) && ok(x1, y1)) unite(br.y0 * N + br.x0, y1 * N + x1);
  }
  for (const b of game.buildings.values()) {
    b.wnet = null;
    const d = BUILDINGS[b.kind];
    if (d.water || b.kind === 'pylon' || b.kind === 'pole') continue;
    if (d.onWater) {   // scarico: la strada sulla riva accanto
      for (const D of DIRS) if (ok(b.ax + D.dx, b.ay + D.dy)) { b.wnet = (b.ay + D.dy) * N + b.ax + D.dx; break; }
      continue;
    }
    for (let y = b.ay - 1; y <= b.ay + d.h && b.wnet == null; y++) for (let x = b.ax - 1; x <= b.ax + d.w; x++) {
      const side = (y === b.ay - 1 || y === b.ay + d.h) !== (x === b.ax - 1 || x === b.ax + d.w);
      if (side && ok(x, y)) { b.wnet = y * N + x; break; }
    }
  }
  for (const b of game.buildings.values()) if (b.wnet != null) b.wnet = find(b.wnet);
  game.water = { ver: game.elecVer || 0, timer: 2, nets: new Map(), stain: new Map() };
}

function updateWater(dt) {
  if (!game.water || game.water.ver !== (game.elecVer || 0) || (game.water.timer -= dt) <= 0) buildWaterNets();
  const W = game.water, nets = new Map();
  const net = k => { if (!nets.has(k)) nets.set(k, { supply: 0, demand: 0, sewer: 0, outlets: [], cover: 0 }); return nets.get(k); };
  for (const b of game.buildings.values()) {
    if (b.wnet == null) continue;
    const n = net(b.wnet);
    if (b.kind === 'waterWell') {
      if (b.gw === undefined) b.gw = groundwaterAt(b.ax, b.ay);
      b.pumped = Math.round(WATER.well * staffOf(b) * b.gw * upBoost(b));
      n.supply += b.pumped;
    } else if (b.kind === 'waterPlant') {
      b.pumped = Math.round(WATER.plant * staffOf(b) * upBoost(b));
      n.supply += b.pumped;
    } else if (b.kind === 'sewage') { n.sewer += WATER.sewage; n.outlets.push(b); }
    else if (isWaterUser(b)) n.demand += waterDemand(b);
  }
  let supply = 0, demand = 0, covered = 0;
  for (const n of nets.values()) {
    n.cover = n.demand ? Math.min(1, n.supply / n.demand, n.sewer / n.demand) : 0;
    supply += n.supply; demand += n.demand; covered += n.demand * n.cover;
    // acque sporche: ogni scarico ne porta via una parte, l'acqua intorno diventa marrone
    const used = Math.min(n.demand * n.cover, n.sewer);
    for (const o of n.outlets) o.flow = n.outlets.length ? used / n.outlets.length : 0;
  }
  for (const b of game.buildings.values()) {
    if (!isWaterUser(b)) continue;
    const n = b.wnet != null ? nets.get(b.wnet) : null;
    b.watered = n ? n.cover : 0;
  }
  W.nets = nets;
  game.waterSum = { supply, demand, cover: demand ? covered / demand : 0 };
  // macchia marrone intorno agli scarichi (si ricalcola ogni tanto: cambia piano)
  W.stainTimer = (W.stainTimer || 0) - dt;
  if (W.stainTimer <= 0) {
    W.stainTimer = 3;
    W.stain = new Map();
    for (const o of game.buildings.values()) {
      if (o.kind !== 'sewage') continue;
      const R = 2 + 3.5 * Math.min(1, (o.flow || 0) / WATER.sewage);
      for (let dy = -Math.ceil(R); dy <= Math.ceil(R); dy++) for (let dx = -Math.ceil(R); dx <= Math.ceil(R); dx++) {
        const x = o.ax + dx, y = o.ay + dy, d = Math.hypot(dx, dy);
        if (d > R || !inMap(x, y) || game.map[y][x].type !== T.WATER) continue;
        const a = 0.85 * Math.min(1, 1.3 * (1 - d / (R + 0.8))), k = y * game.size + x;
        W.stain.set(k, Math.max(W.stain.get(k) || 0, a));
      }
    }
  }
}
function waterNetOf(b) { return game.water && b.wnet != null ? game.water.nets.get(b.wnet) || null : null; }
// icona "senza acqua" (come quella della corrente)
function waterStatus(b) {
  if (!WATER.required) return null;
  if (b.kind === 'sewage') return b.wnet == null ? 'noWater' : null;
  if (b.kind === 'waterWell' || b.kind === 'waterPlant') return b.wnet == null ? 'noWater' : null;
  if (!isWaterUser(b)) return null;
  return (b.watered || 0) < 0.5 ? 'noWater' : null;
}

// ---------- Disegno ----------
// Zone azzurre delle falde (con il pozzo in mano)
function drawWaterSpot(c, x, y) {
  const o = groundwaterAt(x, y);
  if (!o) return;
  const P = surface(x, y);
  c.fillStyle = 'rgba(60,150,230,' + (0.12 + 0.4 * o).toFixed(2) + ')';
  c.beginPath(); c.moveTo(...P(0.08, 0.08)); c.lineTo(...P(0.92, 0.08)); c.lineTo(...P(0.92, 0.92)); c.lineTo(...P(0.08, 0.92)); c.closePath(); c.fill();
}
// acqua marrone vicino agli scarichi
function drawStain(c, x, y, P) {
  const a = game.water && game.water.stain && game.water.stain.get(y * game.size + x);
  if (!a) return;
  c.fillStyle = 'rgba(122,88,44,' + a.toFixed(2) + ')';
  c.beginPath(); c.moveTo(...P(0, 0)); c.lineTo(...P(1, 0)); c.lineTo(...P(1, 1)); c.lineTo(...P(0, 1)); c.closePath(); c.fill();
  if (DETAIL && a > 0.25) {   // schiuma sporca che si muove
    const t = animT * 0.4 + x * 0.37 + y * 0.61;
    c.fillStyle = 'rgba(160,130,80,' + (a * 0.6).toFixed(2) + ')';
    for (let i = 0; i < 2; i++) { const p = P(0.25 + 0.5 * ((t + i * 0.5) % 1), 0.3 + 0.4 * Math.sin(t * 2 + i)); c.fillRect(p[0] - 1, p[1] - 0.5, 2, 1); }
    animSeen = true;
  }
}
// Pozzo dell'acqua: torretta con il serbatoio azzurro su un basamento, pompa e tubo
function drawWaterWell(c, x, y, base, r) {
  drawParts2(c, x, y, base, r, [
    { box: [0.12, 0.12, 0.88, 0.88], h: 2, col: { l: '#a9a9a2', r: '#8f8f88', t: '#bdbdb5', plain: true } },
    { group: [
      { box: [0.2, 0.2, 0.26, 0.26], h: 14, z: 2, col: { l: '#7a8088', r: '#5f656c', t: '#9aa0a8' } },
      { box: [0.54, 0.2, 0.6, 0.26], h: 14, z: 2, col: { l: '#7a8088', r: '#5f656c', t: '#9aa0a8' } },
      { box: [0.2, 0.54, 0.26, 0.6], h: 14, z: 2, col: { l: '#7a8088', r: '#5f656c', t: '#9aa0a8' } },
      { box: [0.54, 0.54, 0.6, 0.6], h: 14, z: 2, col: { l: '#7a8088', r: '#5f656c', t: '#9aa0a8' } },
      { box: [0.16, 0.16, 0.64, 0.64], h: 8, z: 15, cyl: true, col: { l: '#4f9fd8', r: '#3a7fb5', t: '#7cc0ec' } },
    ] },
    { box: [0.66, 0.62, 0.86, 0.84], h: 6, z: 2, col: { l: '#3f7a4a', r: '#2f5f38', t: '#5fa36a' } },   // pompa
  ], true);
}
// Depuratore: vasche azzurre, capannone e cisterna (il retro sul mare)
function drawWaterPlant(c, ax, ay, base, r) {
  groundRect(c, ax, ay, base, [0.28, 1.45, 0.72, 2.0], r, '#7b7f86');
  drawParts(c, ax, ay, base, r, [
    { box: [0.12, 0.15, 0.9, 0.85], h: 3, col: { l: '#9a9a92', r: '#7f7f78', t: '#4fa3d9' } },   // vasca
    { box: [1.05, 0.15, 1.85, 0.85], h: 3, col: { l: '#9a9a92', r: '#7f7f78', t: '#6fbde6' } },  // vasca
    { box: [0.12, 1.0, 1.25, 1.45], h: 14, col: { l: '#e8eef3', r: '#c4ccd4', t: '#7d8590' },
      doors: [{ face: '+v', a: 0.3, b: 0.7, z1: 9, color: '#4a4f5a' }, { face: '+v', a: 0.85, b: 1.15, z0: 7, z1: 11, color: '#9fd3e8' }] },
    { box: [1.4, 1.0, 1.85, 1.45], h: 20, col: { l: '#4f9fd8', r: '#3a7fb5', t: '#7cc0ec' } },   // cisterna
  ]);
}
// Scarico: tubo di cemento che esce dalla riva e acqua che cade
function drawSewage(c, x, y, base) {
  const P = (u, v, h) => iso(x, y, u, v, base + h / STEP);
  box(c, x, y, base - 0.1, 0.3, 0.3, 0.7, 0.7, 0.1 * STEP + 4, { l: '#9a9a92', r: '#7f7f78', t: '#b4b4ac', plain: true });
  const m = P(0.5, 0.5, 4);
  c.fillStyle = '#3a3a3a'; c.beginPath(); c.ellipse(m[0], m[1], 2.6, 1.3, 0, 0, Math.PI * 2); c.fill();
  if (DETAIL) {   // getto d'acqua sporca
    animSeen = true;
    for (let i = 0; i < 4; i++) {
      const t = (animT * 1.2 + i / 4) % 1;
      c.fillStyle = 'rgba(120,90,50,' + (0.7 * (1 - t)).toFixed(2) + ')';
      c.beginPath(); c.arc(m[0] + (i - 1.5) * 1.5, m[1] + t * 5, 0.9 + t, 0, Math.PI * 2); c.fill();
    }
  }
}
