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
    if (route) spawnVehicle({ kind: 'bus', from: d.id, tiles: route, pts: routePoints(route, false), speed: BUS.speed, stops: route.stops, nextStop: 0, arrive() {}, cancel() {} });
  }
}
// giro: deposito -> la fermata più vicina -> la più vicina a quella... -> deposito
function busRoute(d) {
  let todo = [...game.buildings.values()].filter(s => s.kind === 'busStop' && s.depot === d.id);
  if (!todo.length) return null;
  const start = accessTiles(d);
  if (!start.length) return null;
  let tiles = [], cur = [start[0]];
  const stops = [];   // dove si ferma: [x, y, id della fermata] nell'ordine del giro
  const add = leg => { if (!leg) return false; tiles = tiles.length ? tiles.concat(leg.slice(1)) : leg; cur = [leg[leg.length - 1]]; return true; };
  while (todo.length) {
    const [cx, cy] = cur[0];
    todo.sort((a, b) => Math.hypot(a.ax - cx, a.ay - cy) - Math.hypot(b.ax - cx, b.ay - cy));
    const s = todo.shift();
    if (add(findRoute(cur, accessTiles(s)))) stops.push([cur[0][0], cur[0][1], s.id]);
    if (tiles.length > 600) break;   // giro troppo lungo: basta così
  }
  add(findRoute(cur, start));
  if (tiles.length < 2) return null;
  tiles.stops = stops;
  return tiles;
}

// ---------- Fermate vere (richiesta dell'utente: quando passa il bus si deve vedere la gente che scende e va al lavoro) ----------
// Il bus si ferma a ogni fermata del suo giro: chi aspettava sotto la pensilina sale, poi scendono
// uno alla volta i passeggeri, che camminano sul marciapiede fino al posto di lavoro (o a un negozio)
// vicino alla fermata. Restituisce true finché il bus deve restare fermo (simUpdate non lo muove).
function busHold(v, dt) {
  if (v.hold > 0) {
    v.hold -= dt;
    // scendono uno alla volta
    while (v.off && v.off.length && v.off[0].t >= v.hold) { const o = v.off.shift(); busAlight(v, o.stop); }
    if (v.hold <= 0 && peds.some(p => p.board === v)) v.hold = 0.3;   // aspetta chi sta ancora salendo
    return v.hold > 0;
  }
  const st = v.stops && v.stops[v.nextStop];
  if (!st) return false;
  const p = vehiclePos(v);
  if (Math.floor(p.mx) !== st[0] || Math.floor(p.my) !== st[1]) return false;
  const a = v.pts[v.seg], b = v.pts[Math.min(v.seg + 1, v.pts.length - 1)];
  const along = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? p.mx - st[0] : p.my - st[1], dirPos = (b[0] - a[0]) + (b[1] - a[1]) >= 0;
  if (dirPos ? along < 0.45 : along > 0.55) return false;   // si ferma a metà del tile, davanti alla fermata
  v.nextStop++;
  const s = game.buildings.get(st[2]);
  if (!s || s.kind !== 'busStop') return false;
  // chi aspettava sale: cammina fino al bus e sparisce dentro
  let on = 0;
  for (const w of peds) if (w.waiting === s.id) {
    const q = w.pts[0];
    w.waiting = null; w.board = v; w.seg = 0; w.s = 0; w.speed = PEDS.speed * 1.2;
    w.pts = [q, [p.mx + (q[0] - p.mx) * 0.25, p.my + (q[1] - p.my) * 0.25, p.h, 1, 0]];
    on++;
  }
  // chi scende: quanti dipende da quanti posti di lavoro e negozi ci sono vicino alla fermata
  // (dove ci sono aziende o negozi scendono in 2-5 per andare al lavoro, dove ci sono solo case 1-2 che tornano a casa)
  const near = busTargetsNear(s);
  const n = near.work ? 2 + Math.floor(Math.random() * (BUS.maxOff - 1)) : near.home ? 1 + Math.floor(Math.random() * 2) : 0;
  v.hold = Math.max(on || n ? BUS.stopTime : 0.8, 0.9 + n * 0.45);
  v.off = [];
  for (let i = 0; i < n; i++) v.off.push({ t: v.hold - 0.6 - i * 0.45, stop: s });
  return true;
}
// posti dove va chi scende: attività con lavoratori e negozi entro BUS.walk dalla fermata
function busWorkWeight(b) {
  if (!b || b.kind === 'house' || b.kind === 'busStop' || b.kind === 'busDepot' || BUILDINGS[b.kind].infra) return busHomeWeight(b) * 0.15;
  if (JOBS[b.kind]) return 4;
  return SHOPS[b.kind] ? 1 : 0;
}
function busHomeWeight(b) { return b && b.kind === 'house' && (b.residents || 0) > 0 ? 1 : 0; }
function busTargetsNear(s) {
  const n = { work: 0, home: 0 };
  for (const b of game.buildings.values()) if (distToBuilding(b, s.ax, s.ay) <= BUS.walk) { if (busHomeWeight(b)) n.home++; else if (busWorkWeight(b)) n.work++; }
  return n;
}
// un passeggero scende dal bus e va a piedi al lavoro
function busAlight(v, s) {
  if (!game.buildings.has(s.id)) return;
  const doors = pedDoors(s);
  if (!doors.length) return;
  const walk = planWalk({ b: s, doors }, busWorkWeight, 1);
  if (!walk) return;
  const pts = pedPoints(walk), p = vehiclePos(v);
  // parte dal bus (non da dentro la pensilina): dalla portiera sale sul marciapiede dal lato della fermata
  const side = [s.ax + 0.5 - p.mx, s.ay + 0.5 - p.my], L = Math.hypot(side[0], side[1]) || 1;
  pts.splice(0, 2, [p.mx + side[0] / L * 0.12, p.my + side[1] / L * 0.12, p.h, 1, 0], [p.mx + side[0] / L * 0.34, p.my + side[1] / L * 0.34, p.h, 1, 0]);
  const ped = newPed(pts);
  ped.bag = Math.random() < 0.6;   // chi va al lavoro ha spesso la borsa
  peds.push(ped);
}

// ---------- Disegno ----------
// Fermata: palina con il cartello, pensilina con la panchina
function drawBusStop(c, x, y, base, r) {
  // Ordine fisso (prima i pezzi si mescolavano girando la fermata, segnalazione dell'utente):
  // marciapiede sempre per primo; pensilina (pali, vetro, panchina ordinati tra loro, tettoia per
  // ultima) e palina sono due blocchi separati, ordinati con sortParts.
  const rb = bx => rotBox(bx.map(v => v * 2), r).map(v => v / 2);
  const POST = { l: '#6b7077', r: '#55595f', t: '#8a8f96' };
  const part = (p, b) => {
    const top = box(c, x, y, base + (p.z || 0) / STEP, b[0], b[1], b[2], b[3], p.h, p.col);
    if (p.glass && DETAIL) {   // riflesso sul vetro
      const P = (u, v, h) => iso(x, y, u, v, base + h / STEP);
      aline(c, P(b[0], b[3], 3), P(b[2], b[3], 8), '#ffffff', 0.5, 0.6);
    }
    return top;
  };
  box(c, x, y, base, ...rb([0.08, 0.08, 0.92, 0.5]), 1, { l: '#b4b4ac', r: '#9a9a92', t: '#cfcfc6', plain: true });
  const shelter = [
    { box: [0.14, 0.14, 0.19, 0.2], h: 11, z: 1, col: POST },
    { box: [0.71, 0.14, 0.76, 0.2], h: 11, z: 1, col: POST },
    { box: [0.19, 0.15, 0.71, 0.19], h: 9, z: 2, col: { l: '#a8d8ef', r: '#86b9d3', t: '#c4e6f5' }, glass: true },   // vetro dietro
    { box: [0.14, 0.2, 0.18, 0.36], h: 8, z: 2, col: { l: '#a8d8ef', r: '#86b9d3', t: '#c4e6f5' }, glass: true },    // vetro di lato
    { box: [0.26, 0.24, 0.64, 0.34], h: 1.5, z: 2.5, col: { l: '#8a5a3a', r: '#6b4428', t: '#a06a44' } },             // panchina
  ];
  const roof = { box: [0.1, 0.1, 0.8, 0.44], h: 1.2, z: 12, col: { l: '#2f55b0', r: '#24448e', t: '#3f6fd9' } };
  const sign = [
    { box: [0.82, 0.62, 0.86, 0.66], h: 15, z: 0, col: { l: '#8a8f96', r: '#6b7077', t: '#9aa0a8' } },
    { box: [0.78, 0.61, 0.9, 0.67], h: 4, z: 12, col: { l: '#ffd34d', r: '#e0b02a', t: '#ffe27a' } },
  ];
  const blocks = [
    { b: rb([0.1, 0.1, 0.8, 0.44]), i: 0, draw() {
      const it = shelter.map((p, i) => { const b = rb(p.box); return { p, b, i, depth: b[2] + b[3] }; });
      for (const { p, b } of sortParts(it)) part(p, b);
      part(roof, rb(roof.box));
    } },
    { b: rb([0.78, 0.6, 0.9, 0.68]), i: 1, draw() { for (const p of sign) part(p, rb(p.box)); } },
  ];
  for (const k of blocks) k.depth = k.b[2] + k.b[3];
  for (const k of sortParts(blocks)) k.draw();
}
// la fermata guarda la strada: rotazione con il lato aperto (+v) verso una strada accanto
function busStopRotation(x, y, pref) {
  for (const r of [pref, 0, 1, 2, 3]) {
    const f = rotUV(1, 2.6, r).map(k => k / 2);   // punto davanti alla fermata (v = 1.3)
    const nx = x + Math.floor(f[0]), ny = y + Math.floor(f[1]);
    if (inMap(nx, ny) && game.map[ny][nx].path && game.map[ny][nx].path !== 'rail') return r;
  }
  return pref;
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
