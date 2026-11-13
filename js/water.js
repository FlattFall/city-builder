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
function hasPipe(t) { return pipePath(t) || !!t.pipe; }   // strada (tubo sotto) o tubo messo a mano
function isWaterUser(b) { const d = BUILDINGS[b.kind]; return !d.infra && !d.water && !POWER[b.kind] && b.kind !== 'waterWell' && b.kind !== 'waterPlant'; }
function waterDemand(b) { return b.kind === 'house' ? (b.residents || 0) * WATER.perResident : WATER.perBusiness; }
function houseCap(h) { return !WATER.required || (h.watered || 0) >= 0.5 ? HOUSE_CAPACITY : WATER.dryHouse; }
function waterFactor(b) { return WATER.required && isWaterUser(b) && (b.watered || 0) < 0.5 ? WATER.drySpeed : 1; }

function buildWaterNets() {
  const N = game.size, par = new Map();
  const find = k => { let r = k; while (par.has(r) && par.get(r) !== r) r = par.get(r); par.set(k, r); return r; };
  const unite = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) par.set(ra, rb); };
  const ok = (x, y) => inMap(x, y) && hasPipe(game.map[y][x]);
  for (const k of [...game.pathKeys, ...(game.pipes || [])]) {
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
    for (let y = b.ay - 1; y <= b.ay + d.h && b.wnet == null; y++) for (let x = b.ax - 1; x <= b.ax + d.w; x++) {
      const side = (y === b.ay - 1 || y === b.ay + d.h) !== (x === b.ax - 1 || x === b.ax + d.w);
      if (side && ok(x, y)) { b.wnet = y * N + x; break; }
    }
    if (b.wnet == null) for (const p of footprint(b.kind, b.ax, b.ay)) if (ok(p.x, p.y)) { b.wnet = p.y * N + p.x; break; }   // tubo che passa sotto
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
      if (o.kind !== 'sewage' || !(o.flow > 0)) continue;
      // la macchia parte dall'uscita del tubo, sul retro (in mare)
      const out = sewageOutlet(o), R = 2 + 3.5 * Math.min(1, (o.flow || 0) / WATER.sewage);
      for (let dy = -Math.ceil(R) - 1; dy <= Math.ceil(R) + 1; dy++) for (let dx = -Math.ceil(R) - 1; dx <= Math.ceil(R) + 1; dx++) {
        const x = Math.floor(out[0]) + dx, y = Math.floor(out[1]) + dy, d = Math.hypot(x + 0.5 - out[0], y + 0.5 - out[1]);
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

// uscita del tubo dello scarico: in mare, a metà del retro (coordinate della mappa)
function sewageOutlet(b) { const p = rotUV(1, -0.6, b.rot || 0); return [b.ax + p[0], b.ay + p[1]]; }
// un edificio ha un tubo (strada o tubo messo a mano) su un lato?
function pipeNextTo(b) {
  const d = BUILDINGS[b.kind];
  for (let y = b.ay - 1; y <= b.ay + d.h; y++) for (let x = b.ax - 1; x <= b.ax + d.w; x++) {
    const side = (y === b.ay - 1 || y === b.ay + d.h) !== (x === b.ax - 1 || x === b.ax + d.w);
    if (side && inMap(x, y) && hasPipe(game.map[y][x])) return true;
  }
  return footprint(b.kind, b.ax, b.ay).some(p => inMap(p.x, p.y) && hasPipe(game.map[p.y][p.x]));
}
// Vista del sottosuolo (tasto U, richiesta dell'utente): la città si scurisce e si vedono tutti i tubi;
// con la ruspa si tolgono i tubi messi per sbaglio (anche sotto case ed edifici)
function pipeViewOn() { return !!game.underground || WATER_TOOLS.includes(game.tool); }
function toggleUnderground() {
  if (!game.started) return;
  game.underground = !game.underground;
  const btn = document.getElementById('under-btn');
  if (btn) btn.classList.toggle('active', game.underground);
  if (typeof toast === 'function') toast(game.underground ? TR('Sottosuolo: si vedono i tubi dell\'acqua (con la ruspa si tolgono)') : TR('Sottosuolo nascosto'));
  requestDraw();
}
// scarico appena costruito senza tubi accanto: si passa al tubo e si vede la mappa dei tubi
// (richiesta dell'utente: non serve la strada, si collega con un tubo a quelli sotto le strade)
function onSewagePlaced(b) {
  if (pipeNextTo(b) || typeof setTool !== 'function') return;
  setTool('pipe');
  if (typeof toast === 'function') toast(TR("Collega lo scarico: trascina il tubo fino a una strada (sotto ogni strada c'è un tubo dell'acqua)"));
}
const WATER_TOOLS = ['pipe', 'sewage', 'waterWell', 'waterPlant'];
// mappa dei tubi (con il tubo o gli edifici dell'acqua in mano): linee azzurre sotto strade e tubi,
// disegnata sopra tutto (si vede anche sotto case ed edifici). Tra due tile a quote diverse il tubo
// scende/sale sul bordo, così si vede che è collegato anche se la strada è più in alto o più in basso.
function drawPipeOverlay(c) {
  const N = game.size;
  if (game.underground) {   // sottosuolo: tutto più scuro, i tubi sopra
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = 'rgba(30,22,14,0.55)'; c.fillRect(0, 0, c.canvas.width, c.canvas.height);
    c.restore();
  }
  for (const k of new Set([...game.pathKeys, ...(game.pipes || [])])) {
    const x = k % N, y = (k - x) / N;
    if (hasPipe(game.map[y][x])) drawPipeView(c, x, y);
  }
  for (const br of game.bridges.values()) drawBridgePipe(c, br);
}
// Tubo lungo un ponte (sotto l'impalcato, da una testa all'altra) o dentro un tunnel (tratteggiato):
// richiesta dell'utente, l'acqua passa anche sui ponti
function drawBridgePipe(c, br) {
  const [x1, y1] = bridgeTile(br, br.n);
  if (!inMap(br.x0, br.y0) || !inMap(x1, y1) || !hasPipe(game.map[br.y0][br.x0]) || !hasPipe(game.map[y1][x1])) return;
  const { dx, dy } = DIRS[br.d], pts = [surface(br.x0, br.y0)(0.5, 0.5)];
  if (isTunnel(br)) pts.push(surface(x1, y1)(0.5, 0.5));
  else {
    for (let s = 1; s <= 2 * br.n - 1; s++) {   // ogni mezzo tile, alla quota dell'impalcato
      const mx = br.x0 + 0.5 + dx * s / 2, my = br.y0 + 0.5 + dy * s / 2;
      pts.push(iso(0, 0, mx, my, deckHeight(br, mx, my)));
    }
    pts.push(surface(x1, y1)(0.5, 0.5));
  }
  c.strokeStyle = 'rgba(79,170,255,0.85)'; c.lineWidth = 2.5; c.lineCap = 'round';
  if (isTunnel(br)) c.setLineDash([4, 3]);
  c.beginPath(); c.moveTo(...pts[0]); for (const p of pts.slice(1)) c.lineTo(...p); c.stroke();
  c.setLineDash([]); c.lineCap = 'butt';
}
function drawPipeView(c, x, y) {
  const t = game.map[y][x];
  const P = surface(x, y), m = P(0.5, 0.5), mine = !!t.pipe;
  c.lineCap = 'round';
  for (const D of DIRS) {
    const nx = x + D.dx, ny = y + D.dy;
    if (!inMap(nx, ny)) continue;
    const n = game.map[ny][nx];
    const toBuilding = n.building && !hasPipe(n) && !BUILDINGS[n.building.kind].water && n.building !== t.building;
    if (!hasPipe(n) && !toBuilding) continue;
    const edge = P(0.5 + D.dx * 0.5, 0.5 + D.dy * 0.5);
    const other = toBuilding ? edge : surface(nx, ny)(0.5 - D.dx * 0.5, 0.5 - D.dy * 0.5);   // stesso bordo visto dal vicino
    c.strokeStyle = mine || toBuilding ? 'rgba(79,170,255,0.95)' : 'rgba(79,170,255,0.65)';
    c.lineWidth = mine || toBuilding ? 3 : 2;
    c.beginPath(); c.moveTo(...m); c.lineTo(...edge); if (Math.abs(other[1] - edge[1]) > 0.5) c.lineTo(...other); c.stroke();
    if (toBuilding) { c.fillStyle = '#ffffff'; c.beginPath(); c.arc(edge[0], edge[1], 2.2, 0, Math.PI * 2); c.fill(); }   // attacco all'edificio
  }
  c.fillStyle = mine ? '#4faaff' : 'rgba(79,170,255,0.75)';
  c.beginPath(); c.arc(m[0], m[1], mine ? 2.2 : 1.5, 0, Math.PI * 2); c.fill();
  c.lineCap = 'butt';
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
  if (!a) return;   // il colore marrone è già nel tile (drawTile, mixHex): qui solo la schiuma sporca
  if (DETAIL && a > 0.25) {   // schiuma sporca che si muove
    const t = animT * 0.4 + x * 0.37 + y * 0.61;
    c.fillStyle = 'rgba(160,130,80,' + (a * 0.6).toFixed(2) + ')';
    for (let i = 0; i < 2; i++) { const p = P(0.25 + 0.5 * ((t + i * 0.5) % 1), 0.3 + 0.4 * Math.sin(t * 2 + i)); c.fillRect(p[0] - 1, p[1] - 0.5, 2, 1); }
    animSeen = true;
  }
}
// Pozzo dell'acqua: basamento di cemento, torre con 4 gambe e crociere, serbatoio azzurro con il
// tetto a cono e la ringhiera, tubo che scende al centro e va alla casetta della pompa.
// Il basamento si disegna sempre per primo; gambe, crociere, tubi e pompa si ordinano tra loro
// (sortParts) e il serbatoio, che sta sopra a tutto, per ultimo: prima il basamento copriva i piedi
// delle gambe e la pompa, e in alcune rotazioni i pezzi si sovrapponevano (segnalazione dell'utente).
function drawWaterWell(c, x, y, base, r) {
  // il pozzo non ha un'entrata: la casetta della pompa sta sempre sul davanti (a destra o a sinistra),
  // mai dietro la torre dove gambe e crociere la tagliavano (rotazioni 3 e 4, segnalazione dell'utente)
  r = r & 1;
  const R1 = (u, v) => rotUV(u * 2, v * 2, r).map(k => k / 2);
  const rb = bx => rotBox(bx.map(v => v * 2), r).map(v => v / 2);
  const P = (u, v, h) => iso(x, y, u, v, base + h / STEP);
  const LEG = { l: '#7a8088', r: '#5f656c', t: '#9aa0a8' }, PIPE = { l: '#8a9096', r: '#6c7278', t: '#a8aeb4' };
  box(c, x, y, base, 0.1, 0.1, 0.9, 0.9, 2, { l: '#a9a9a2', r: '#8f8f88', t: '#bdbdb5', plain: true });
  const brace = (b, z0, z1) => {   // croce di ferro tra due gambe (b = riquadro sottile ruotato)
    const along = b[2] - b[0] > b[3] - b[1], m = along ? (b[1] + b[3]) / 2 : (b[0] + b[2]) / 2;
    const A = along ? [b[0], m] : [m, b[1]], B = along ? [b[2], m] : [m, b[3]];
    c.strokeStyle = '#5a6067'; c.lineWidth = 0.7;
    c.beginPath(); c.moveTo(...P(A[0], A[1], z0)); c.lineTo(...P(B[0], B[1], z1)); c.moveTo(...P(A[0], A[1], z1)); c.lineTo(...P(B[0], B[1], z0));
    c.moveTo(...P(A[0], A[1], z1)); c.lineTo(...P(B[0], B[1], z1)); c.stroke();
  };
  const parts = [
    // 4 gambe
    { box: [0.18, 0.18, 0.25, 0.25], h: 14, z: 2, col: LEG },
    { box: [0.55, 0.18, 0.62, 0.25], h: 14, z: 2, col: LEG },
    { box: [0.18, 0.55, 0.25, 0.62], h: 14, z: 2, col: LEG },
    { box: [0.55, 0.55, 0.62, 0.62], h: 14, z: 2, col: LEG },
    // crociere sui 4 lati (riquadri sottili tra le gambe)
    { box: [0.25, 0.2, 0.55, 0.23], draw: b => brace(b, 3, 14) },
    { box: [0.25, 0.57, 0.55, 0.6], draw: b => brace(b, 3, 14) },
    { box: [0.2, 0.25, 0.23, 0.55], draw: b => brace(b, 3, 14) },
    { box: [0.57, 0.25, 0.6, 0.55], draw: b => brace(b, 3, 14) },
    // tubo che scende dal serbatoio e va alla pompa
    { box: [0.37, 0.37, 0.43, 0.43], h: 14, z: 2, col: PIPE },
    { box: [0.43, 0.38, 0.66, 0.42], h: 1.6, z: 2.4, col: PIPE },
    // casetta della pompa con il tetto a due falde
    { box: [0.66, 0.28, 0.86, 0.6], h: 5, z: 2, col: { l: '#e3dccb', r: '#c2b9a4', t: '#7d8590' },
      roof: { rh: 2.5, back: '#3f6f48', roof: '#4f8a5a', gable: '#c2b9a4' } },
    // tombino di cemento della falda davanti alla torre
    { box: [0.2, 0.68, 0.4, 0.86], h: 1, z: 2, col: { l: '#8f8f88', r: '#7a7a72', t: '#6b7077' } },
  ];
  const items = parts.map((p, i) => { const b = rb(p.box); return { p, b, i, depth: b[2] + b[3] }; });
  for (const { p, b } of sortParts(items)) {
    if (p.draw) { p.draw(b); continue; }
    const top = box(c, x, y, base + p.z / STEP, b[0], b[1], b[2], b[3], p.h, p.col);
    if (p.roof) gableRoof(c, x, y, top, b[0] - 0.02, b[1] - 0.02, b[2] + 0.02, b[3] + 0.02, p.roof.rh,
      Object.assign({ gableL: p.col.l }, p.roof), (b[2] - b[0]) > (b[3] - b[1]));
  }
  // serbatoio sopra le gambe: cilindro con la fascia, tetto a cono e ringhiera
  const [cu, cv] = R1(0.4, 0.4), rad = 0.26;
  const top = cyl(c, x, y, base + 15 / STEP, cu, cv, rad, 8, { l: '#4f9fd8', r: '#3a7fb5', t: '#7cc0ec', band: [0.5], bandColor: '#2f6d9c' });
  const [tx, ty] = iso(x, y, cu, cv, top), apex = iso(x, y, cu, cv, top + 4 / STEP);
  const rx = rad * TW * 0.7071, ry = rad * TH * 0.7071;
  c.fillStyle = '#5aa8de'; c.beginPath(); c.moveTo(tx - rx, ty); c.lineTo(...apex); c.lineTo(tx, ty + ry); c.ellipse(tx, ty, rx, ry, 0, Math.PI / 2, Math.PI); c.closePath(); c.fill();
  c.fillStyle = '#3a7fb5'; c.beginPath(); c.moveTo(tx + rx, ty); c.lineTo(...apex); c.lineTo(tx, ty + ry); c.ellipse(tx, ty, rx, ry, 0, Math.PI / 2, 0, true); c.closePath(); c.fill();
  if (DETAIL) {
    c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 0.4;
    c.beginPath(); c.moveTo(tx - rx, ty); c.lineTo(...apex); c.lineTo(tx + rx, ty); c.stroke();
    c.strokeStyle = '#d6dbe0'; c.lineWidth = 0.6;   // ringhiera intorno al tetto
    c.beginPath(); c.ellipse(tx, ty - 1.6, rx * 1.06, ry * 1.06, 0, 0, Math.PI); c.stroke();
    for (let k = 1; k < 6; k++) { const a = Math.PI * k / 6; c.beginPath(); c.moveTo(tx + Math.cos(a) * rx * 1.06, ty + Math.sin(a) * ry * 1.06); c.lineTo(tx + Math.cos(a) * rx * 1.06, ty - 1.6 + Math.sin(a) * ry * 1.06); c.stroke(); }
  }
  c.fillStyle = '#9aa0a8'; c.beginPath(); c.arc(apex[0], apex[1], 0.8, 0, Math.PI * 2); c.fill();
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
// Scarico delle acque sporche 2x2 in riva al mare: vasca di raccolta rotonda, casetta delle pompe e
// un grosso tubo di cemento che dal retro va sopra il mare e scarica l'acqua sporca (marrone)
function drawSewage(c, ax, ay, base, r, flow = 1) {
  const conc = { l: '#a9a9a2', r: '#8f8f88', t: '#bdbdb5' };
  groundRect(c, ax, ay, base, [0.2, 1.4, 0.8, 2.0], r, '#7b7f86');
  // retro verso il fondo dello schermo: il tubo sta DIETRO all'edificio e va disegnato prima dei pezzi
  // (prima si disegnava dopo e finiva sopra la casetta o la vasca: segnalazione dell'utente);
  // retro verso lo schermo: si disegna dopo i tile d'acqua davanti (drawSewagePipes)
  if (!sewageBackFront(r)) drawSewagePipe(c, { ax, ay, rot: r, flow }, base);
  drawParts2(c, ax, ay, base, r, [
    { box: [0.15, 0.2, 1.05, 1.1], h: 6, cyl: true, col: { l: '#8f8f88', r: '#7a7a72', t: '#6b5536' },   // vasca con l'acqua sporca
      after(b, top) { if (!DETAIL) return; const m = iso(ax, ay, (b[0] + b[2]) / 2, (b[1] + b[3]) / 2, top); c.strokeStyle = 'rgba(160,130,80,0.8)'; c.lineWidth = 0.8;
        const a = animT * 0.8; c.beginPath(); c.moveTo(m[0] - Math.cos(a) * 9, m[1] - Math.sin(a) * 4.5); c.lineTo(m[0] + Math.cos(a) * 9, m[1] + Math.sin(a) * 4.5); c.stroke(); animSeen = true; } },
    { box: [1.2, 0.25, 1.85, 1.0], h: 12, col: { l: '#d8cfb8', r: '#b5ac95', t: '#7d8590' },
      roof: { rh: 4, back: '#4a4f5a', roof: '#5b616c', gable: '#b5ac95' },
      doors: [{ face: '+v', a: 1.35, b: 1.7, z1: 8, color: '#4a4f5a' }] },
    { box: [0.85, 1.25, 1.15, 1.55], h: 10, col: { l: '#6b7077', r: '#55595f', t: '#8a8f96' } },   // pozzetto dove arrivano i tubi
  ]);
}
function sewageBackFront(r) { const a = rotUV(1, -0.5, r), b = rotUV(1, 1, r); return (a[0] - b[0]) + (a[1] - b[1]) > 0; }

// Tubo dello scarico: esce dal retro, fa una curva di 90 gradi e scende dritto nel mare (richiesta
// dell'utente: non deve sporgere tanto). Si disegna dopo tutti i tile, così l'acqua non lo copre
// anche quando lo scarico è solo 1 livello sopra il mare.
function drawSewagePipes(c) {
  for (const b of game.buildings.values()) if (b.kind === 'sewage' && sewageBackFront(b.rot || 0)) drawSewagePipe(c, b, game.map[b.ay][b.ax].elev);
}
function drawSewagePipe(c, b, base) {
  {
    const r = b.rot || 0, ax = b.ax, ay = b.ay;
    const P = (u, v, h) => { const p = rotUV(u, v, r); return iso(ax, ay, p[0], p[1], h); };
    const z = base + 4 / STEP, w = 0.13, end = -0.45;   // quota del tubo, mezza larghezza, dove scende
    const conc = '#a9a9a2', dark = '#86867f', light = '#c4c4bc';
    // tratto orizzontale dal muro del retro fino alla curva (scatola tra v = end e v = 0)
    const quad = (pts, col) => { c.fillStyle = col; c.beginPath(); c.moveTo(...pts[0]); for (const p of pts.slice(1)) c.lineTo(...p); c.closePath(); c.fill(); };
    const top = [P(1 - w, end, z + w * 1.2), P(1 + w, end, z + w * 1.2), P(1 + w, 0.05, z + w * 1.2), P(1 - w, 0.05, z + w * 1.2)];
    const side1 = [P(1 - w, end, z - w), P(1 - w, 0.05, z - w), P(1 - w, 0.05, z + w * 1.2), P(1 - w, end, z + w * 1.2)];
    const side2 = [P(1 + w, end, z - w), P(1 + w, 0.05, z - w), P(1 + w, 0.05, z + w * 1.2), P(1 + w, end, z + w * 1.2)];
    quad(side1, dark); quad(side2, dark); quad(top, light);
    // curva e tratto verticale fino all'acqua (quota 0)
    const down = [P(1 - w, end - w, 0), P(1 + w, end - w, 0), P(1 + w, end - w, z + w * 1.2), P(1 - w, end - w, z + w * 1.2)];
    const down2 = [P(1 - w, end - w, 0), P(1 - w, end + w, 0), P(1 - w, end + w, z + w * 1.2), P(1 - w, end - w, z + w * 1.2)];
    const down3 = [P(1 + w, end - w, 0), P(1 + w, end + w, 0), P(1 + w, end + w, z + w * 1.2), P(1 + w, end - w, z + w * 1.2)];
    quad(down2, dark); quad(down3, dark); quad(down, conc);
    quad([P(1 - w, end - w, z + w * 1.2), P(1 + w, end - w, z + w * 1.2), P(1 + w, end + w, z + w * 1.2), P(1 - w, end + w, z + w * 1.2)], light);   // tappo della curva
    // getto marrone dove il tubo entra nel mare, con cerchi che si allargano
    if (!(b.flow > 0) || !DETAIL) return;
    animSeen = true;
    const [wx, wy] = P(1, end, 0);
    for (let i = 0; i < 3; i++) {
      const t = (animT * 0.7 + i / 3) % 1;
      c.strokeStyle = 'rgba(150,115,65,' + (0.8 * (1 - t)).toFixed(2) + ')'; c.lineWidth = 1;
      c.beginPath(); c.ellipse(wx, wy, 3 + t * 9, 1.5 + t * 4.5, 0, 0, Math.PI * 2); c.stroke();
    }
    c.fillStyle = 'rgba(120,88,44,0.7)';
    c.beginPath(); c.ellipse(wx, wy, 3.5, 1.8, 0, 0, Math.PI * 2); c.fill();
  }
}
