// ---------- Ponti ----------
// Un ponte va dritto da una testa all'altra (si trascina, lungo quanto si vuole).
// game.bridges: id -> { id, x0, y0, d, n, e }
//   (x0, y0) = prima testa, d = direzione verso l'altra testa, n = distanza tra le teste,
//   e[k] = quota (in livelli) del bordo tra il tile k e il tile k+1 lungo il ponte (k = 0..n-1).
// Le teste (tile 0 e n) sono strade normali a terra; i tile in mezzo hanno t.bridge = { id, i }
// e sotto possono avere terreno, acqua, strade o binari (le auto ci passano sotto).
// Il ponte sale di un livello per tile dalle teste, solo quanto serve per passare sopra
// a quello che c'è sotto.

function bridgeTile(b, i) { return [b.x0 + DIRS[b.d].dx * i, b.y0 + DIRS[b.d].dy * i]; }
function bridgeAt(x, y) {
  const t = inMap(x, y) && game.map[y][x].bridge;
  return t ? game.bridges.get(t.id) : null;
}

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
// Ponte che parte dalla testa (x, y) verso la direzione d (o null)
function bridgeFromHead(x, y, d) {
  const h = bridgesAtHead(x, y).find(o => o.d === d);
  return h ? h.b : null;
}

// Quota più bassa dell'impalcato sopra il tile i
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

// Prova a progettare un ponte da a a b (allineati sulla stessa fila o colonna).
// Restituisce { ok, msg, tiles, x0, y0, d, n, e, cost }
function planBridge(a, b) {
  const plan = { ok: false, tiles: [a], msg: "Trascina fino all'altra sponda" };
  if (!b || (a.x === b.x && a.y === b.y)) return plan;
  let dx = b.x - a.x, dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0;   // sempre dritto
  const n = Math.abs(dx + dy);
  const d = DIRS.findIndex(D => D.dx === Math.sign(dx) && D.dy === Math.sign(dy));
  Object.assign(plan, { d, n, x0: a.x, y0: a.y, tiles: [] });
  for (let i = 0; i <= n; i++) plan.tiles.push({ x: a.x + DIRS[d].dx * i, y: a.y + DIRS[d].dy * i });
  const fail = msg => Object.assign(plan, { msg });
  if (plan.tiles.some(p => !inMap(p.x, p.y))) return fail('Fuori dalla mappa');
  if (n < 2) return fail('Ponte troppo corto: serve almeno un tile in mezzo');
  const heads = [plan.tiles[0], plan.tiles[n]];
  for (const p of heads) {
    const t = game.map[p.y][p.x];
    if (t.building) return fail("Sulla testa del ponte c'è un edificio");
    if (t.bridge) return fail('La testa del ponte è sotto un altro ponte');
    if (!isBuildable(t)) return fail('Le teste del ponte vanno sulla terraferma');
    if (t.field) return fail("Sulla testa del ponte c'è un campo");
    if (t.path && netOf(t.path) !== 'road') return fail('Le teste del ponte vanno su una strada, non sui binari');
    if (t.path && (t.rb || rampDir(p.x, p.y) >= 0)) return fail('Le teste del ponte devono essere in piano');
  }
  for (let i = 1; i < n; i++) {
    const t = game.map[plan.tiles[i].y][plan.tiles[i].x];
    if (t.building) return fail("Sotto il ponte c'è un edificio");
    if (t.bridge) return fail("C'è già un ponte");
  }
  const eA = game.map[heads[0].y][heads[0].x].elev, eB = game.map[heads[1].y][heads[1].x].elev;
  if (Math.abs(eA - eB) > n - 1) return fail('Troppo dislivello tra le due teste: allunga il ponte');
  // quota minima sopra ogni tile: niente terreno che buca il ponte, spazio per le auto sotto
  const need = [];
  for (let i = 1; i < n; i++) {
    const p = plan.tiles[i], t = game.map[p.y][p.x];
    need[i] = Math.max(...cornerHeights(p.x, p.y)) + (t.path ? BRIDGE.clearPath : 0);
  }
  for (let D = Math.max(eA, eB); D <= MAX_ELEV + 8; D++) {
    const e = [];
    for (let k = 0; k < n; k++) e.push(Math.min(D, eA + k, eB + (n - 1 - k)));
    let ok = true;
    for (let i = 1; i < n && ok; i++) if (Math.min(e[i - 1], e[i]) < need[i]) ok = false;
    if (!ok) continue;
    plan.e = e; plan.ok = true; plan.msg = '';
    plan.cost = (n - 1) * BRIDGE.costPerTile + heads.filter(p => !game.map[p.y][p.x].path).length * PATHS.road.cost;
    return plan;
  }
  return fail('Il ponte non riesce a salire abbastanza: allungalo o parti più in alto');
}

function buildBridge(plan) {
  if (!plan || !plan.ok) return { ok: false, msg: plan && plan.msg };
  if (!spend(plan.cost)) return { ok: false, msg: 'Fondi insufficienti' };
  const b = { id: game.nextBridgeId++, x0: plan.x0, y0: plan.y0, d: plan.d, n: plan.n, e: plan.e.slice() };
  for (const i of [0, b.n]) {   // le teste diventano strada se non lo sono già
    const p = plan.tiles[i], t = game.map[p.y][p.x];
    if (!t.path) { if (t.type === T.FOREST) t.type = T.GRASS; setPath(p.x, p.y, 'road'); game.roads++; }
  }
  for (let i = 1; i < b.n; i++) {
    const p = plan.tiles[i], t = game.map[p.y][p.x];
    if (t.type === T.FOREST) t.type = T.GRASS;   // gli alberi sotto vengono tagliati
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
