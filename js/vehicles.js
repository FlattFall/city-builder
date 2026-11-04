// ---------- Veicoli, abitanti e produzione ----------
// Le auto seguono le strade (asfalto e terra) tenendo la destra; nelle rotonde girano in senso
// antiorario. I nuovi abitanti arrivano in auto dalle estremità della strada principale.
// I furgoni portano il raccolto dalle fattorie ai magazzini e tornano indietro.

let vehicles = [];
let moveInTimer = 0, houseCursor = 0, jobsTimer = 0;
const CAR_COLORS = ['#d94141', '#3f6fd9', '#e8c23a', '#3fa34d', '#e8e8e8', '#2b2b33', '#e07b39', '#8e5bd1'];

function clearVehicles() { vehicles = []; moveInTimer = 0; }

// ---------- Percorsi in auto ----------
// Nelle rotonde da ogni quarto si può andare solo verso il quarto successivo (senso antiorario)
const RB_NEXT = { '0,0': 2, '0,1': 1, '1,1': 0, '1,0': 3 };

// Senso unico: non si può andare in direzione d se la freccia del tile punta al contrario
// (si può entrare e uscire di lato, agli incroci)
function onewayOk(t, d) { return !(t.path === 'oneway' && (t.dir ?? 1) === (d + 2) % 4); }

// Vicini raggiungibili in auto dal tile (x, y) al livello L (0 = a terra, 1 = sul ponte).
// Restituisce [nx, ny, livello]
function driveNeighbors(x, y, L) {
  const out = [];
  const t = game.map[y][x];
  if (L === 1) {   // sul ponte: avanti o indietro lungo il ponte, alle teste si scende a terra
    const b = game.bridges.get(t.bridge.id), i = t.bridge.i;
    for (const j of [i - 1, i + 1]) {
      const [nx, ny] = bridgeTile(b, j);
      const head = j === 0 || j === b.n;
      const d = j > i ? b.d : (b.d + 2) % 4;
      if (head && !onewayOk(game.map[ny][nx], d)) continue;
      out.push([nx, ny, head ? 0 : 1]);
    }
    return out;
  }
  for (let d = 0; d < 4; d++) {
    const nx = x + DIRS[d].dx, ny = y + DIRS[d].dy;
    if (bridgeFromHead(x, y, d)) { if (onewayOk(t, d)) out.push([nx, ny, 1]); continue; }   // si sale sul ponte
    if (!roadLinked(x, y, d) || !roadAt(nx, ny)) continue;
    if (sameRoundabout(x, y, nx, ny) && d !== RB_NEXT[(x - t.rb.ax) + ',' + (y - t.rb.ay)]) continue;
    if (!onewayOk(t, d) || !onewayOk(game.map[ny][nx], d)) continue;
    out.push([nx, ny, 0]);
  }
  return out;
}

// Strade attaccate a un edificio (da qui si parte e qui si arriva).
// Fattoria e magazzino si raggiungono solo dalla loro entrata.
function accessTiles(b) {
  const ent = entranceOf(b);
  if (ent) return roadAt(ent.rx, ent.ry) ? [[ent.rx, ent.ry]] : [];
  const out = [], seen = new Set();
  for (const p of footprint(b.kind, b.ax, b.ay))
    for (const D of DIRS) {
      const x = p.x + D.dx, y = p.y + D.dy, k = y * game.size + x;
      if (roadAt(x, y) && !seen.has(k)) { seen.add(k); out.push([x, y]); }
    }
  return out;
}

// Ricerca in ampiezza sulla rete stradale: da uno dei tile di partenza a uno di arrivo
// Chiave di un nodo della rete: tile + livello (sul ponte = +N*N)
function nodeKey(x, y, L) { return (L ? game.size * game.size : 0) + y * game.size + x; }
function nodeOf(k) {
  const N = game.size, NN = N * N, L = k >= NN ? 1 : 0, kk = k % NN;
  return [kk % N, (kk / N) | 0, L];
}

// Partenze e arrivi sono sempre a terra; il percorso è una lista di [x, y, livello]
function findRoute(starts, goals) {
  if (!starts.length || !goals.length) return null;
  const goalSet = new Set(goals.map(([x, y]) => nodeKey(x, y, 0)));
  const prev = new Map();
  const queue = [];
  for (const [x, y, L] of starts) { const k = nodeKey(x, y, L || 0); if (!prev.has(k)) { prev.set(k, -1); queue.push(k); } }
  for (let qi = 0; qi < queue.length; qi++) {
    const k = queue[qi];
    if (goalSet.has(k)) {
      const path = [];
      for (let c = k; c !== -1; c = prev.get(c)) path.push(nodeOf(c));
      return path.reverse();
    }
    for (const [nx, ny, nl] of driveNeighbors(...nodeOf(k))) {
      const nk = nodeKey(nx, ny, nl);
      if (!prev.has(nk)) { prev.set(nk, k); queue.push(nk); }
    }
  }
  return null;
}

function entryTiles() { return game.entries.filter(e => roadAt(e.x, e.y)).map(e => [e.x, e.y]); }

// Punto (mx, my) della mappa -> altezza della superficie stradale in quel punto
function surfaceHeight(mx, my) {
  const tx = Math.min(game.size - 1, Math.max(0, Math.floor(mx)));
  const ty = Math.min(game.size - 1, Math.max(0, Math.floor(my)));
  return heightIn(cornerHeights(tx, ty), Math.min(1, Math.max(0, mx - tx)), Math.min(1, Math.max(0, my - ty)));
}

// Dai tile del percorso ai punti che l'auto segue: centro dei tile e bordi tra un tile
// e l'altro, spostati sulla corsia di destra (al centro sui sensi unici).
// Ogni punto è [mx, my, quota, velocità, livello]
function routePoints(tiles, fromOutside, toOutside) {
  const dirOf = (a, b) => DIRS.findIndex(D => D.dx === b[0] - a[0] && D.dy === b[1] - a[1]);
  const right = d => [-DIRS[d].dy, DIRS[d].dx];
  const n = tiles.length, pts = [];
  const info = tiles.map(([x, y, L]) => {
    const t = game.map[y][x];
    if (L) return { L: 1, b: game.bridges.get(t.bridge.id), off: 0.18, speed: BRIDGE.speed };
    return { L: 0, off: t.path === 'oneway' ? 0 : 0.18, speed: (PATHS[t.path] && PATHS[t.path].speed) || 1 };
  });
  const H = (mx, my, a, b) => {   // quota: sul ponte segue l'impalcato, a terra la superficie
    const br = (a && a.L && a.b) || (b && b.L && b.b);
    return br ? deckHeight(br, mx, my) : surfaceHeight(mx, my);
  };
  const dFirst = n > 1 ? dirOf(tiles[0], tiles[1]) : 1;
  if (fromOutside) { // arriva da fuori mappa: parte un tile prima del bordo
    const r = right(dFirst), o = info[0].off;
    const mx = tiles[0][0] + 0.5 - DIRS[dFirst].dx * 1.5 + r[0] * o, my = tiles[0][1] + 0.5 - DIRS[dFirst].dy * 1.5 + r[1] * o;
    pts.push([mx, my, surfaceHeight(mx, my), info[0].speed, 0]);
  }
  for (let i = 0; i < n; i++) {
    const [x, y] = tiles[i], I = info[i], J = info[i + 1];
    const dIn = i > 0 ? dirOf(tiles[i - 1], tiles[i]) : dFirst;
    const dOut = i < n - 1 ? dirOf(tiles[i], tiles[i + 1]) : dIn;
    const ri = right(dIn), ro = right(dOut);
    let mx = x + 0.5 + (ri[0] + ro[0]) / 2 * I.off, my = y + 0.5 + (ri[1] + ro[1]) / 2 * I.off;
    pts.push([mx, my, H(mx, my, I), I.speed, I.L]);
    if (i < n - 1) {
      const o = (I.off + J.off) / 2;
      mx = x + MID_UV[dOut][0] + ro[0] * o; my = y + MID_UV[dOut][1] + ro[1] * o;
      pts.push([mx, my, H(mx, my, I, J), (I.speed + J.speed) / 2, Math.max(I.L, J.L)]);
    }
  }
  if (toOutside) { // esce dalla mappa: va avanti fino a un tile oltre il bordo
    const [x, y] = tiles[n - 1], N = game.size;
    const d = x === 0 ? 3 : x === N - 1 ? 1 : y === 0 ? 0 : 2;
    const r = right(d), o = info[n - 1].off;
    const mx = x + 0.5 + DIRS[d].dx * 1.5 + r[0] * o, my = y + 0.5 + DIRS[d].dy * 1.5 + r[1] * o;
    pts.push([mx, my, surfaceHeight(mx, my), info[n - 1].speed, 0]);
  }
  return pts;
}

// ---------- Cambi di programma ----------
// Prossimo nodo [x, y, livello] del percorso del veicolo (da lì si ricalcola la strada)
function vehicleNextNode(v) {
  const o = v.ptOff || 0;
  const ti = Math.min(v.tiles.length - 1, Math.max(0, Math.ceil((v.seg + 1 - o) / 2)));
  return v.tiles[ti];
}

// Il veicolo cambia destinazione senza sparire: da dove si trova va verso goals
// (tile di strada a terra). out = poi esce dalla mappa. false se non c'è strada.
function redirectVehicle(v, goals, out) {
  const start = vehicleNextNode(v);
  const route = start && findRoute([start], goals);
  if (!route) return false;
  const cur = vehiclePos(v), pts = routePoints(route, false, out);
  v.pts = [[cur.mx, cur.my, cur.h, pts[0][3], cur.layer], ...pts];
  v.ptOff = 1; v.tiles = route; v.seg = 0; v.s = 0;
  v.keys = new Set(route.map(([x, y, L]) => nodeKey(x, y, L)));
  return true;
}

// Case con posto libero, prima le più vicine al punto (x, y)
function housesWithRoom(x, y) {
  return [...game.buildings.values()]
    .filter(h => h.kind === 'house' && h.residents + h.incoming < HOUSE_CAPACITY)
    .sort((a, b) => Math.abs(a.ax - x) + Math.abs(a.ay - y) - Math.abs(b.ax - x) - Math.abs(b.ay - y));
}

// Un'auto con n persone va a vivere in una casa con posto (o esce dalla mappa se non ce ne sono).
// v = auto già in strada da dirottare, oppure null per farne partire una nuova da starts.
function relocate(n, starts, v, color) {
  const here = v ? vehicleNextNode(v) : starts[0];
  if (!here) return;
  for (const h of housesWithRoom(here[0], here[1]).slice(0, 12)) {
    const take = Math.min(n, HOUSE_CAPACITY - h.residents - h.incoming);
    const ok = v ? redirectVehicle(v, accessTiles(h)) : !!findRoute(starts, accessTiles(h));
    if (!ok) continue;
    h.incoming += take;
    const id = h.id;
    const arrive = () => { const hh = game.buildings.get(id); if (hh) { hh.incoming -= take; hh.residents += take; game.population += take; updateHud(); } };
    const cancel = () => { const hh = game.buildings.get(id); if (hh) hh.incoming -= take; };
    if (v) Object.assign(v, { target: id, people: take, arrive, cancel });
    else {
      const route = findRoute(starts, accessTiles(h));
      spawnVehicle({ kind: 'car', target: id, people: take, tiles: route, pts: routePoints(route, false), speed: CAR_SPEED,
        color: color || CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)], arrive, cancel });
    }
    if (take < n) relocate(n - take, starts && starts.length ? starts : [here], null, v && v.color);   // gli altri cercano un'altra casa
    return;
  }
  // nessuna casa libera: se ne vanno dalla mappa
  if (v) {
    if (redirectVehicle(v, entryTiles(), true)) Object.assign(v, { target: null, arrive() {}, cancel() {} });
    else vehicles = vehicles.filter(o => o !== v);
  } else leaveMap({ kind: 'car', color: color || CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)] }, starts);
}

// Fa partire un veicolo che esce dalla mappa (se c'è una strada fino al bordo)
function leaveMap(v, starts) {
  const route = findRoute(starts, entryTiles());
  if (!route) return false;
  spawnVehicle(Object.assign({ tiles: route, pts: routePoints(route, false, true), speed: v.kind === 'van' ? VAN_SPEED : CAR_SPEED,
    arrive() {}, cancel() {} }, v));
  return true;
}

function spawnVehicle(v) {
  v.seg = 0; v.s = 0;
  v.keys = new Set(v.tiles.map(([x, y, L]) => nodeKey(x, y, L)));
  vehicles.push(v);
  return v;
}

// ---------- Abitanti ----------
// Ricalcola quali case sono raggiungibili dalla strada principale (per il simbolo "non collegata"):
// una sola ricerca da tutte le entrate segna i tile di strada raggiungibili
let linkCheckTimer = 0;
function checkHouseLinks() {
  if ((linkCheckTimer -= MOVE_IN_EVERY) > 0) return;
  linkCheckTimer = 3;
  const seen = new Set();
  const queue = entryTiles().map(([x, y]) => nodeKey(x, y, 0));
  for (const k of queue) seen.add(k);
  for (let qi = 0; qi < queue.length; qi++) {
    for (const [nx, ny, nl] of driveNeighbors(...nodeOf(queue[qi]))) {
      const nk = nodeKey(nx, ny, nl);
      if (!seen.has(nk)) { seen.add(nk); queue.push(nk); }
    }
  }
  for (const b of game.buildings.values())
    if (b.kind === 'house') b.unreachable = !accessTiles(b).some(([x, y]) => seen.has(nodeKey(x, y, 0)));
}
// Ogni tanto un'auto parte da un'entrata della strada principale verso una casa con posti liberi
function spawnResident() {
  if (vehicles.length >= MAX_CARS) return;
  checkHouseLinks();
  const houses = [...game.buildings.values()].filter(b => b.kind === 'house' && b.residents + b.incoming < HOUSE_CAPACITY);
  if (!houses.length) return;
  const entries = entryTiles();
  for (let tries = 0; tries < Math.min(5, houses.length); tries++) {
    const b = houses[(houseCursor++) % houses.length];
    const route = findRoute(entries, accessTiles(b));
    if (!route) { b.unreachable = true; continue; }
    b.unreachable = false;
    const n = Math.min(HOUSE_CAPACITY - b.residents - b.incoming, 1 + Math.floor(Math.random() * 2));
    b.incoming += n;
    spawnVehicle({
      kind: 'car', target: b.id, people: n, tiles: route, pts: routePoints(route, true), ptOff: 1,
      speed: CAR_SPEED, color: CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)],
      arrive() {
        const h = game.buildings.get(b.id);
        if (!h) return;
        h.incoming -= n; h.residents += n; game.population += n;
        updateHud();
      },
      cancel() { const h = game.buildings.get(b.id); if (h) h.incoming -= n; },
    });
    return;
  }
}

// ---------- Aggiornamento ----------
// La velocità dipende dalla strada (autostrada più veloce, terra più lenta)
function moveVehicle(v, dt) {
  let left = dt;   // tempo che resta in questo fotogramma
  while (left > 0 && v.seg < v.pts.length - 1) {
    const a = v.pts[v.seg], b = v.pts[v.seg + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 0.0001;
    const sp = v.speed * ((a[3] || 1) + (b[3] || 1)) / 2;
    const need = (len - v.s) / sp;
    if (need <= left) { left -= need; v.seg++; v.s = 0; }
    else { v.s += sp * left; left = 0; }
  }
  return v.seg >= v.pts.length - 1;
}

// Distanza di sicurezza: un veicolo si ferma se ha un altro veicolo subito davanti nella
// stessa corsia (stessa direzione). Se resta fermo troppo a lungo riparte comunque,
// così una rotonda piena non si blocca per sempre.
function blockedAhead(v) {
  const a = v.pts[v.seg], b = v.pts[Math.min(v.seg + 1, v.pts.length - 1)];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 1e-6) return false;
  const dx = (b[0] - a[0]) / len, dy = (b[1] - a[1]) / len;
  const p = vehiclePos(v);
  for (const o of vehicles) {
    if (o === v) continue;
    const q = vehiclePos(o);
    if (Math.abs(q.h - p.h) > 0.7) continue;   // uno sul ponte e uno sotto: non si danno fastidio
    const rx = q.mx - p.mx, ry = q.my - p.my;
    const ahead = rx * dx + ry * dy, side = Math.abs(-rx * dy + ry * dx);
    if (ahead > 0 && ahead < 0.5 && side < 0.12) return true;
  }
  return false;
}

function simUpdate(dt) {
  if (!game.started || menuIsOpen()) return;
  dt = Math.min(dt, 0.1);
  const done = [];
  for (const v of vehicles) {
    if (blockedAhead(v) && (v.waited = (v.waited || 0) + dt) < 3) continue;
    v.waited = 0;
    if (moveVehicle(v, dt)) done.push(v);
  }
  if (done.length) {
    vehicles = vehicles.filter(v => !done.includes(v));
    for (const v of done) v.arrive();
  }
  jobsTimer -= dt;
  if (jobsTimer <= 0) { jobsTimer = 1; updateJobs(); updateHud(); }
  moveInTimer -= dt;
  if (moveInTimer <= 0) { moveInTimer = MOVE_IN_EVERY; spawnResident(); }
  economyUpdate(dt);
  if (vehicles.length) requestDraw();
}

// Un edificio demolito: i veicoli non spariscono, cambiano programma.
//  - auto dirette alla casa: vanno in un'altra casa con posto, altrimenti escono dalla mappa
//  - chi abitava nella casa prende l'auto e fa lo stesso
//  - furgoni diretti lì: tornano a casa con la merce; furgoni senza più casa: escono dalla mappa
function removeVehiclesFor(id, b) {
  for (const v of vehicles.slice()) {
    if (v.target === id) relocate(v.people || 1, null, v);
    else if (v.kind === 'van' && v.to === id) {
      const home = game.buildings.get(v.from), g = v.good, q = v.load, fid = v.from;
      if (home && redirectVehicle(v, accessTiles(home))) {
        home.status = 'Destinazione demolita: il furgone torna indietro';
        Object.assign(v, { to: null, arrive() { const f = game.buildings.get(fid); if (f) { addTo(f.store, g, q); f.van = null; f.status = ''; } },
          cancel() { const f = game.buildings.get(fid); if (f) { addTo(f.store, g, q); f.van = null; } } });
      } else if (redirectVehicle(v, entryTiles(), true)) Object.assign(v, { to: null, from: null, arrive() {}, cancel() {} });
      else { vehicles = vehicles.filter(o => o !== v); if (home) { home.van = null; addTo(home.store, g, q); } }
    } else if (v.kind === 'van' && v.from === id && !v.to) {   // furgone di ritorno verso un edificio che non c'è più
      if (redirectVehicle(v, entryTiles(), true)) Object.assign(v, { from: null, arrive() {}, cancel() {} });
      else vehicles = vehicles.filter(o => o !== v);
    }
    // i furgoni partiti da un edificio demolito finiscono la consegna (poi escono dalla mappa)
  }
  // chi abitava nella casa demolita trasloca
  if (b && b.kind === 'house' && b.residents > 0) {
    const starts = accessTiles(b);
    if (starts.length) relocate(b.residents, starts, null);
  }
}

// Un ponte demolito: spariscono i veicoli che dovevano passarci sopra
function onBridgeRemoved(b) {
  const keys = [];
  for (let i = 1; i < b.n; i++) keys.push(nodeKey(...bridgeTile(b, i), 1));
  const gone = vehicles.filter(v => keys.some(k => v.keys.has(k)));
  vehicles = vehicles.filter(v => !gone.includes(v));
  for (const v of gone) v.cancel && v.cancel();
}

// Una strada demolita: i veicoli che dovevano passarci spariscono (ci riproveranno)
function onRoadRemoved(x, y) {
  const k = nodeKey(x, y, 0);
  const gone = vehicles.filter(v => v.keys.has(k));
  vehicles = vehicles.filter(v => !gone.includes(v));
  for (const v of gone) v.cancel && v.cancel();
}

// ---------- Disegno ----------
function vehiclePos(v) {
  const a = v.pts[v.seg], b = v.pts[Math.min(v.seg + 1, v.pts.length - 1)];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const f = Math.min(1, v.s / len);
  return { mx: a[0] + (b[0] - a[0]) * f, my: a[1] + (b[1] - a[1]) * f, h: a[2] + (b[2] - a[2]) * f,
    alongU: Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]), layer: Math.max(a[4] || 0, b[4] || 0) };
}

// Veicoli raggruppati per tile: ognuno si disegna dopo il tile più avanti che occupa,
// così i tile sotto sono già disegnati e i blocchi davanti lo coprono
function vehiclesByTile() {
  const m = new Map();
  for (const v of vehicles) {
    const p = vehiclePos(v);
    v.pos = p;
    const tx = Math.min(game.size - 1, Math.max(0, Math.floor(p.mx + 0.22)));
    const ty = Math.min(game.size - 1, Math.max(0, Math.floor(p.my + 0.22)));
    // dentro un tunnel non si vedono
    const inT = p.layer && bridgeAt(Math.floor(p.mx), Math.floor(p.my));
    if (inT && isTunnel(inT) && game.map[Math.floor(p.my)][Math.floor(p.mx)].bridge.id === inT.id) continue;
    const k = nodeKey(tx, ty, p.layer);   // quelli sul ponte si disegnano dopo l'impalcato
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(v);
  }
  return m;
}

// Veicoli in pixel art: sprite "vehicles" ricolorato con il colore dell'auto (o la striscia del furgone),
// girato nella direzione in cui sta andando. Finché l'immagine non c'è, le scatoline di prima.
function vehicleDir(v) {
  const a = v.pts[v.seg], b = v.pts[Math.min(v.seg + 1, v.pts.length - 1)];
  const dx = b[0] - a[0], dy = b[1] - a[1];
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 1 : 3;
  return dy >= 0 ? 2 : 0;
}
// Auto e furgoni disegnati come gli edifici (scatole con contorno): carrozzeria, abitacolo con i
// vetri, ruote, fari davanti e luci rosse dietro (sul lato che si vede), ombra a terra.
// Il furgone ha il cassone bianco con la striscia del colore dell'attività.
function drawVehicle(c, v) {
  const { mx, my, h } = v.pos;
  const d = vehicleDir(v), f = DIRS[d], sd = [-f.dy, f.dx];   // avanti e di lato
  const van = v.kind === 'van';
  const L = van ? 0.24 : 0.19, W = van ? 0.115 : 0.1;
  // rettangolo nel sistema del veicolo (a lungo la marcia, w di lato) -> rettangolo della mappa
  const R = (a0, a1, w0, w1) => {
    const us = [], vs = [];
    for (const a of [a0, a1]) for (const w of [w0, w1]) { us.push(mx + f.dx * a + sd[0] * w); vs.push(my + f.dy * a + sd[1] * w); }
    return [Math.min(...us), Math.min(...vs), Math.max(...us), Math.max(...vs)];
  };
  const vbox = (rc, z0, hp, col) => box(c, 0, 0, h + z0 / STEP, rc[0], rc[1], rc[2], rc[3], hp, Object.assign({ plain: true }, col));
  if (DETAIL) {                                                   // ombra
    const [sx, sy] = iso(0, 0, mx, my, h);
    c.fillStyle = 'rgba(0,0,0,0.2)'; c.beginPath(); c.ellipse(sx, sy + 0.5, (van ? 6 : 5), 2.4, 0, 0, Math.PI * 2); c.fill();
  }
  // ruote: prima quelle lontane dallo schermo, poi la carrozzeria, poi le vicine
  const wheels = [];
  for (const a of [-L + 0.06, L - 0.06]) for (const w of [-W + 0.01, W - 0.01]) wheels.push(R(a - 0.035, a + 0.035, w - 0.02, w + 0.02));
  const wheelCol = { l: '#2a2a30', r: '#1e1e22', t: '#3a3a40' };
  const far = rc => rc[0] + rc[1] < mx + my;
  wheels.filter(far).forEach(rc => vbox(rc, 0, 2.4, wheelCol));
  const body = v.color || '#d94141', stripe = v.stripe || '#3fa34d';
  let cabin;
  if (van) {
    vbox(R(-L, L * 0.3, -W, W), 1, 8.5, { l: '#f2f2f2', r: '#cfd1d4', t: '#ffffff' });                // cassone
    vbox(R(-L - 0.002, L * 0.3 + 0.002, -W - 0.002, W + 0.002), 4.5, 1.6, { l: stripe, r: shade(stripe, -0.2) });   // striscia
    vbox(R(L * 0.3, L, -W, W), 1, 4, { l: stripe, r: shade(stripe, -0.25), t: shade(stripe, 0.1) });   // muso
    cabin = { rc: R(L * 0.3, L * 0.8, -W * 0.92, W * 0.92), z: 5, hp: 3, top: shade(stripe, 0.15) };
  } else {
    vbox(R(-L, L, -W, W), 1, 3.6, { l: body, r: shade(body, -0.25), t: shade(body, 0.12) });             // carrozzeria
    cabin = { rc: R(-L * 0.55, L * 0.35, -W * 0.86, W * 0.86), z: 4.6, hp: 3, top: shade(body, 0.2) };
  }
  vbox(cabin.rc, cabin.z, cabin.hp, { l: '#8fc8e2', r: '#6fa6c2', t: cabin.top });                   // abitacolo con i vetri
  wheels.filter(rc => !far(rc)).forEach(rc => vbox(rc, 0, 2.4, wheelCol));
  if (!DETAIL) return;
  // fari: sul muso se guarda verso lo schermo (+u o +v), altrimenti luci rosse sul retro
  const front = d === 1 || d === 2, a = front ? L : -L, col = front ? '#fff3b0' : '#e83a3a';
  for (const w of [-W * 0.62, W * 0.62]) {
    const p = iso(0, 0, mx + f.dx * a + sd[0] * w, my + f.dy * a + sd[1] * w, h + 2.6 / STEP);
    c.fillStyle = col; c.fillRect(p[0] - 0.5, p[1] - 0.5, 1, 0.8);
  }
}

// Schiarisce (f > 0) o scurisce (f < 0) un colore #rrggbb
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = s => {
    const v = (n >> s) & 255;
    return Math.round(f > 0 ? v + (255 - v) * f : v * (1 + f));
  };
  return '#' + [16, 8, 0].map(s => ch(s).toString(16).padStart(2, '0')).join('');
}
