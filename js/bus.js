// ---------- Bus: fermate e deposito (richiesta dell'utente) ----------
// Una fermata è "servita" se un deposito dei bus con autisti la raggiunge per strada. Gli abitanti
// delle case entro BUS.walk tile da una fermata servita possono lavorare nelle attività entro
// BUS.walk tile da un'altra fermata dello stesso deposito, a qualsiasi distanza (così le case non
// devono stare accanto alle aziende). In più le attività servite lavorano BUS.boost più in fretta
// (`busBoost`): conviene costruirle. I bus si vedono: girano dal deposito per tutte le fermate.
function buildBusNet() {
  const all = [...game.buildings.values()];
  const depots = all.filter(b => b.kind === 'busDepot' && (b.workers || 0) > 0 && accessTiles(b).length);
  const stops = all.filter(b => b.kind === 'busStop');
  const served = new Map();   // fermata -> deposito
  for (const s of stops) {
    s.depot = null;
    for (const d of depots) if (findRoute(accessTiles(d), accessTiles(s))) { s.depot = d.id; served.set(s.id, d.id); break; }
  }
  const near = new Map();     // edificio -> insieme dei depositi delle fermate vicine
  for (const s of stops) {
    if (!s.depot) continue;
    for (const b of all) {
      if (b.kind === 'busStop' || b.kind === 'busDepot' || BUILDINGS[b.kind].infra) continue;
      if (distToBuilding(b, s.ax, s.ay) > BUS.walk) continue;
      if (!near.has(b.id)) near.set(b.id, new Set());
      near.get(b.id).add(s.depot);
    }
  }
  game.bus = { served, near, timer: 5 };
}
function busLinked(h, b) {
  const N = game.bus && game.bus.near;
  if (!N) return false;
  const a = N.get(h.id), c = N.get(b.id);
  if (!a || !c) return false;
  for (const d of a) if (c.has(d)) return true;
  return false;
}
function busBoost(b) { return game.bus && game.bus.near.has(b.id) && b.kind !== 'house' ? 1 + BUS.boost : 1; }
function busTick(dt) {
  if (!game.bus || (game.bus.timer -= dt) <= 0) buildBusNet();
  // ogni tanto un bus parte da ogni deposito e fa il giro delle sue fermate
  for (const d of game.buildings.values()) {
    if (d.kind !== 'busDepot' || !(d.workers > 0)) continue;
    d.busTimer = (d.busTimer ?? 3) - dt;
    if (d.busTimer > 0) continue;
    d.busTimer = BUS.every;
    if (vehicles.filter(v => v.kind === 'bus' && v.from === d.id).length >= BUS.perDepot) continue;
    const route = busRoute(d);
    if (route) spawnVehicle({ kind: 'bus', from: d.id, tiles: route, pts: routePoints(route, false), speed: BUS.speed, arrive() {}, cancel() {} });
  }
}
// giro: deposito -> la fermata più vicina -> la più vicina a quella... -> deposito
function busRoute(d) {
  let todo = [...game.buildings.values()].filter(s => s.kind === 'busStop' && s.depot === d.id);
  if (!todo.length) return null;
  const start = accessTiles(d);
  if (!start.length) return null;
  let tiles = [], cur = [start[0]];
  const add = leg => { if (!leg) return false; tiles = tiles.length ? tiles.concat(leg.slice(1)) : leg; cur = [leg[leg.length - 1]]; return true; };
  while (todo.length) {
    const [cx, cy] = cur[0];
    todo.sort((a, b) => Math.hypot(a.ax - cx, a.ay - cy) - Math.hypot(b.ax - cx, b.ay - cy));
    const s = todo.shift();
    add(findRoute(cur, accessTiles(s)));
    if (tiles.length > 600) break;   // giro troppo lungo: basta così
  }
  if (!add(findRoute(cur, start))) return tiles.length > 1 ? tiles : null;
  return tiles.length > 1 ? tiles : null;
}

// ---------- Disegno ----------
// Fermata: palina con il cartello, pensilina con la panchina
function drawBusStop(c, x, y, base, r) {
  drawParts2(c, x, y, base, r, [
    { box: [0.1, 0.1, 0.9, 0.5], h: 1, col: { l: '#b4b4ac', r: '#9a9a92', t: '#cfcfc6', plain: true } },
    { group: [
      { box: [0.15, 0.15, 0.2, 0.2], h: 12, col: { l: '#6b7077', r: '#55595f', t: '#8a8f96' } },
      { box: [0.7, 0.15, 0.75, 0.2], h: 12, col: { l: '#6b7077', r: '#55595f', t: '#8a8f96' } },
      { box: [0.15, 0.12, 0.75, 0.22], h: 9, z: 1, col: { l: '#a8d8ef', r: '#86b9d3', t: '#a8d8ef' } },   // vetro dietro
      { box: [0.25, 0.25, 0.65, 0.35], h: 1.5, z: 3, col: { l: '#8a5a3a', r: '#6b4428', t: '#a06a44' } },  // panchina
      { box: [0.1, 0.1, 0.8, 0.45], h: 1.2, z: 12, col: { l: '#2f55b0', r: '#24448e', t: '#3f6fd9' } },   // tettoia
    ] },
    { group: [
      { box: [0.82, 0.62, 0.86, 0.66], h: 16, col: { l: '#8a8f96', r: '#6b7077', t: '#9aa0a8' } },     // palina
      { box: [0.78, 0.6, 0.9, 0.68], h: 4, z: 13, col: { l: '#ffd34d', r: '#e0b02a', t: '#ffe27a' } },  // cartello giallo
    ] },
  ], true);
}
// Deposito: capannone con due grandi portoni e un bus parcheggiato fuori
function drawBusDepot(c, ax, ay, base, r) {
  groundRect(c, ax, ay, base, [0.1, 1.3, 1.9, 2.0], r, '#6f737a');
  drawParts(c, ax, ay, base, r, [
    { box: [0.1, 0.15, 1.9, 1.25], h: 18, col: { l: '#e8dcc0', r: '#c9bc9e', t: '#7d8590' },
      roof: { rh: 5, back: '#4a4f5a', roof: '#5b616c', gable: '#c9bc9e' },
      doors: [{ face: '+v', a: 0.25, b: 0.85, z1: 13, color: '#4a4f5a' }, { face: '+v', a: 1.1, b: 1.7, z1: 13, color: '#4a4f5a' },
        { face: '+v', a: 0.1, b: 1.9, z0: 14, z1: 16.5, color: '#e07b39' }] },
    { box: [1.25, 1.4, 1.85, 1.65], h: 7, col: { l: '#ffcc33', r: '#e0a820', t: '#ffe066' } },   // bus parcheggiato
  ]);
}
