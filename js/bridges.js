// ---------- Ponti e tunnel ----------
// Un ponte (o un tunnel) va dritto da una testa all'altra.
// game.bridges: id -> { id, kind ('bridge' | 'tunnel'), x0, y0, d, n, e, main?, path? }
//   path = strada sopra il ponte: 'road' (se manca) o 'highway' (ponte autostrada: auto più veloci)
//   (x0, y0) = prima testa, d = direzione verso l'altra testa, n = distanza tra le teste,
//   e[k] = quota (in livelli) della strada sul bordo tra il tile k e il tile k+1 (k = 0..n-1).
// Le teste (tile 0 e n) sono strade normali a terra; i tile in mezzo hanno t.bridge = { id, i }.
// Ponte: passa sopra a terreno, acqua, strade, binari (e case basse); sale di un livello per
//   tile dalle teste, solo quanto serve.
// Tunnel: passa dentro una collina o una montagna, dritto; l'uscita è il primo tile
//   dall'altra parte che non è più alto dell'entrata.

function bridgeTile(b, i) { return [b.x0 + DIRS[b.d].dx * i, b.y0 + DIRS[b.d].dy * i]; }
function bridgeAt(x, y) {
  const t = inMap(x, y) && game.map[y][x].bridge;
  return t ? game.bridges.get(t.id) : null;
}
function isTunnel(b) { return b && b.kind === 'tunnel'; }
function isBridgeTool(tool) { return tool === 'bridge' || tool === 'hwBridge'; }
function bridgePath(b) { return (b && b.path) || 'road'; }
// sopra il tile c'è un ponte vero (non un tunnel sotto terra)
function bridgeOver(t) { const b = t.bridge && game.bridges.get(t.bridge.id); return b && !isTunnel(b) ? b : null; }

// Indice delle teste: tile -> [{ d, b }] (d = direzione in cui parte il ponte da quella testa)
function rebuildBridgeIndex() {
  game.bridgeHeads = new Map();
  const add = (x, y, d, b) => {
    const k = y * game.size + x;
    if (!game.bridgeHeads.has(k)) game.bridgeHeads.set(k, []);
    game.bridgeHeads.get(k).push({ d, b });
  };
  for (const b of game.bridges.values()) {
    add(b.x0, b.y0, b.d, b);
    const [x1, y1] = bridgeTile(b, b.n);
    add(x1, y1, (b.d + 2) % 4, b);
  }
}
function bridgesAtHead(x, y) { return (game.bridgeHeads && game.bridgeHeads.get(y * game.size + x)) || []; }
// Ponte o tunnel che parte dalla testa (x, y) verso la direzione d (o null)
function bridgeFromHead(x, y, d) {
  const h = bridgesAtHead(x, y).find(o => o.d === d);
  return h ? h.b : null;
}

// Quota più bassa della strada sopra il tile i
function deckMin(b, i) { return Math.min(b.e[i - 1], b.e[i]); }

// Quota della strada del ponte nel punto (mx, my) della mappa
function deckHeight(b, mx, my) {
  const { dx, dy } = DIRS[b.d];
  const s = (mx - b.x0 - 0.5) * dx + (my - b.y0 - 0.5) * dy;   // 0 = centro della prima testa
  const f = Math.max(0, Math.min(b.n - 1, s - 0.5));
  const k = Math.floor(f);
  return k >= b.n - 1 ? b.e[b.n - 1] : b.e[k] + (b.e[k + 1] - b.e[k]) * (f - k);
}

// Quote dei 4 angoli dell'impalcato sul tile i (come cornerHeights per il terreno)
function deckCorners(b, i) {
  const hin = b.e[i - 1], hout = b.e[i], { dx, dy } = DIRS[b.d];
  return CORNERS.map(([u, v]) => {
    const along = dx ? (dx > 0 ? u : 1 - u) : (dy > 0 ? v : 1 - v);   // 0 = verso la prima testa
    return along ? hout : hin;
  });
}

// Livelli liberi che servono sotto un ponte per un edificio (le case basse ci stanno)
function buildingClear(kind) { return Math.ceil((BUILDINGS[kind].height + 3) / STEP); }

// Problemi di una testa (null se va bene). d = direzione verso il ponte/tunnel.
// Restituisce anche la quota del bordo verso il ponte (deve essere in piano).
function headInfo(p, d) {
  const t = game.map[p.y][p.x];
  if (t.building) return { msg: TR("Sulla testa c'è un edificio") };
  if (t.bridge) return { msg: TR("La testa è sopra un altro ponte o tunnel") };
  if (!isBuildable(t)) return { msg: TR("Le teste vanno sulla terraferma, non nell'acqua") };
  if (t.path && netOf(t.path) !== 'road') return { msg: TR('Le teste vanno su una strada, non sui binari') };
  if (t.rb) return { msg: TR('Le teste non possono stare su una rotonda') };
  const h = cornerHeights(p.x, p.y), [k1, k2] = EDGES[d];
  if (t.path && h[k1] !== h[k2]) return { msg: TR('La strada della testa è inclinata di lato') };
  return { e: t.path ? h[k1] : t.elev };
}

function linePlan(kind, a, d, n) {
  const plan = { ok: false, kind, d, n, x0: a.x, y0: a.y, tiles: [] };
  for (let i = 0; i <= n; i++) plan.tiles.push({ x: a.x + DIRS[d].dx * i, y: a.y + DIRS[d].dy * i });
  return plan;
}
function planCost(plan, perTile) {
  const heads = [plan.tiles[0], plan.tiles[plan.n]];
  return (plan.n - 1) * perTile + heads.filter(p => !game.map[p.y][p.x].path).length * PATHS.road.cost;
}

// Prova a progettare un ponte da a a b (sulla stessa fila o colonna: si raddrizza da solo).
// Restituisce { ok, msg, tiles, x0, y0, d, n, e, cost }
function planBridge(a, b, path) {
  path = path || 'road';
  if (!b || (a.x === b.x && a.y === b.y)) return { ok: false, kind: 'bridge', tiles: [a], msg: TR("Ora clicca (o trascina) fino all'altra sponda") };
  let dx = b.x - a.x, dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0;   // sempre dritto
  const n = Math.abs(dx + dy);
  const d = DIRS.findIndex(D => D.dx === Math.sign(dx) && D.dy === Math.sign(dy));
  const plan = linePlan('bridge', a, d, n);
  plan.path = path;
  const fail = msg => Object.assign(plan, { msg });
  if (plan.tiles.some(p => !inMap(p.x, p.y))) return fail(TR('Fuori dalla mappa'));
  if (n < 2) return fail(TR('Ponte troppo corto: serve almeno un tile in mezzo'));
  const A = headInfo(plan.tiles[0], d), B = headInfo(plan.tiles[n], (d + 2) % 4);
  if (A.msg || B.msg) return fail(A.msg || B.msg);
  for (let i = 1; i < n; i++) {
    const t = game.map[plan.tiles[i].y][plan.tiles[i].x];
    if (t.bridge) return fail(TR("C'è già un ponte o un tunnel"));
    if (t.building && BUILDINGS[t.building.kind].w > 1) return fail(TR("Sotto il ponte c'è un edificio grande"));
  }
  const eA = A.e, eB = B.e;
  if (Math.abs(eA - eB) > n - 1) return fail(TR('Troppo dislivello tra le due sponde: allunga il ponte'));
  // quota minima sopra ogni tile: il terreno non deve bucare il ponte, sotto le auto e le case ci stanno
  const need = [];
  for (let i = 1; i < n; i++) {
    const p = plan.tiles[i], t = game.map[p.y][p.x];
    const top = Math.max(...cornerHeights(p.x, p.y));
    need[i] = t.building ? t.elev + buildingClear(t.building.kind) : top + (t.path ? BRIDGE.clearPath : 0);
  }
  for (let D = Math.max(eA, eB); D <= MAX_ELEV + 10; D++) {
    const e = [];
    for (let k = 0; k < n; k++) e.push(Math.min(D, eA + k, eB + (n - 1 - k)));
    let ok = true;
    for (let i = 1; i < n && ok; i++) if (Math.min(e[i - 1], e[i]) < need[i]) ok = false;
    if (!ok) continue;
    return Object.assign(plan, { e, ok: true, msg: '', cost: planCost(plan, path === 'highway' ? BRIDGE.hwCostPerTile : BRIDGE.costPerTile) });
  }
  // dove non ci sta: il primo tile troppo vicino alle teste per salire abbastanza
  return fail(TR('Il ponte non fa in tempo a salire sopra quello che c\'è sotto: allungalo di qualche tile'));
}

// Tunnel dall'entrata a, verso la collina in direzione d: dritto finché il terreno è più alto
function planTunnelDir(a, d) {
  const plan = linePlan('tunnel', a, d, 0);
  const fail = msg => Object.assign(plan, { msg });
  const A = headInfo(a, d);
  if (A.msg) return fail(A.msg);
  const eA = A.e;
  let i = 1;
  for (;; i++) {
    const x = a.x + DIRS[d].dx * i, y = a.y + DIRS[d].dy * i;
    if (!inMap(x, y)) { Object.assign(plan, linePlan('tunnel', a, d, i - 1)); return fail(TR('La collina continua fino al bordo della mappa')); }
    const t = game.map[y][x];
    if (t.bridge) { Object.assign(plan, linePlan('tunnel', a, d, i)); return fail(TR("C'è già un ponte o un tunnel in mezzo")); }
    if (t.elev <= eA) break;      // qui il terreno torna giù: è l'uscita
  }
  Object.assign(plan, linePlan('tunnel', a, d, i), { d });
  if (i < 2) return fail(TR('Qui davanti non c\'è una collina'));
  const out = plan.tiles[i], B = headInfo(out, (d + 2) % 4);
  if (B.msg) return fail(TR("All'uscita: {m}", { m: B.msg.charAt(0).toLowerCase() + B.msg.slice(1) }));
  const eB = B.e;
  if (eA - eB > i - 1) return fail(TR("Dall'altra parte il terreno è troppo più basso"));
  const e = [];
  for (let k = 0; k < i; k++) e.push(Math.max(eB, eA - k));   // scende piano piano dentro la collina
  return Object.assign(plan, { e, ok: true, msg: '', cost: planCost(plan, TUNNEL.costPerTile) });
}

// Tunnel a partire dal tile a: prova le direzioni dove c'è una collina (prima quella scelta con R)
function planTunnel(a, prefer) {
  let firstFail = null;
  for (let k = 0; k < 4; k++) {
    const d = (prefer + k) % 4, nx = a.x + DIRS[d].dx, ny = a.y + DIRS[d].dy;
    if (!inMap(nx, ny) || game.map[ny][nx].elev <= game.map[a.y][a.x].elev) continue;
    const p = planTunnelDir(a, d);
    if (p.ok) return p;
    firstFail = firstFail || p;
  }
  return firstFail || { ok: false, kind: 'tunnel', tiles: [a], msg: TR('Mettilo ai piedi di una collina o di una montagna') };
}

// Costruisce il ponte o il tunnel progettato. opts.free = gratis, opts.main = fa parte della strada principale
function buildBridge(plan, opts) {
  opts = opts || {};
  if (!plan || !plan.ok) return { ok: false, msg: plan && plan.msg };
  if (!opts.free && !spend(plan.cost)) return { ok: false, msg: TR('Fondi insufficienti') };
  const b = { id: game.nextBridgeId++, kind: plan.kind || 'bridge', x0: plan.x0, y0: plan.y0, d: plan.d, n: plan.n, e: plan.e.slice() };
  if (opts.main) b.main = true;
  if (opts.main) b.path = MAIN_PATH; else if (plan.path && plan.path !== 'road') b.path = plan.path;
  for (const i of [0, b.n]) {   // le teste diventano strada se non lo sono già
    const p = plan.tiles[i], t = game.map[p.y][p.x];
    if (t.field) { t.field = false; t.farm = null; game.fields--; }
    if (!t.path) { if (t.type === T.FOREST) t.type = T.GRASS; setPath(p.x, p.y, b.path || 'road'); game.roads++; if (opts.main) t.main = true; }
  }
  for (let i = 1; i < b.n; i++) {
    const p = plan.tiles[i], t = game.map[p.y][p.x];
    if (b.kind === 'bridge' && t.type === T.FOREST) t.type = T.GRASS;   // gli alberi sotto il ponte vengono tagliati
    t.bridge = { id: b.id, i };
  }
  game.bridges.set(b.id, b);
  rebuildBridgeIndex();
  updateRoundabouts();
  return { ok: true, bridge: b };
}

function removeBridge(b) {
  for (let i = 1; i < b.n; i++) { const [x, y] = bridgeTile(b, i); game.map[y][x].bridge = null; }
  game.bridges.delete(b.id);
  rebuildBridgeIndex();
  if (typeof onBridgeRemoved === 'function') onBridgeRemoved(b);
}

function resetBridges() {
  game.bridges = new Map();
  game.nextBridgeId = 1;
  rebuildBridgeIndex();
}
