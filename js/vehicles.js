// ---------- Veicoli, abitanti e produzione ----------
// Le auto seguono le strade (asfalto e terra) tenendo la destra; nelle rotonde girano in senso
// antiorario. I nuovi abitanti arrivano in auto dalle estremità della strada principale.
// I furgoni portano il raccolto dalle fattorie ai magazzini e tornano indietro.

let vehicles = [];
let moveInTimer = 0, houseCursor = 0, jobsTimer = 0;
const CAR_COLORS = ['#d94141', '#3f6fd9', '#e8c23a', '#3fa34d', '#e8e8e8', '#2b2b33', '#e07b39', '#8e5bd1'];

function clearVehicles() { vehicles = []; moveInTimer = 0; if (typeof clearPeds === 'function') clearPeds(); }

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
  const ents = entrancesOf(b);
  if (ents.length) return ents.filter(e => roadAt(e.rx, e.ry)).map(e => [e.rx, e.ry]);
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
// Percorso più RAPIDO (non il più corto, richiesta dell'utente): Dijkstra dove entrare in un tile costa
// 1 / velocità della strada (autostrada 2.2 = conviene anche se più lunga, terra 0.7 = si evita se c'è
// di meglio). Coda a priorità con un heap binario.
function nodeSpeed(x, y, L) {
  const t = game.map[y][x];
  if (L) { const b = game.bridges.get(t.bridge.id); return b && b.path ? PATHS[b.path].speed : BRIDGE.speed; }
  return (PATHS[t.path] && PATHS[t.path].speed) || 1;
}
function findRoute(starts, goals) {
  if (!starts.length || !goals.length) return null;
  const goalSet = new Set(goals.map(([x, y]) => nodeKey(x, y, 0)));
  const prev = new Map(), dist = new Map();
  const heap = [];   // [costo, chiave]
  const push = (d, k) => {
    heap.push([d, k]);
    for (let i = heap.length - 1; i > 0;) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
      }
    }
    return top;
  };
  for (const [x, y, L] of starts) { const k = nodeKey(x, y, L || 0); if (!dist.has(k)) { dist.set(k, 0); prev.set(k, -1); push(0, k); } }
  while (heap.length) {
    const [d, k] = pop();
    if (d > dist.get(k)) continue;   // già trovato un modo più rapido
    if (goalSet.has(k)) {
      const path = [];
      for (let c = k; c !== -1; c = prev.get(c)) path.push(nodeOf(c));
      return path.reverse();
    }
    for (const [nx, ny, nl] of driveNeighbors(...nodeOf(k))) {
      const nk = nodeKey(nx, ny, nl), nd = d + 1 / nodeSpeed(nx, ny, nl);
      if (!dist.has(nk) || nd < dist.get(nk) - 1e-9) { dist.set(nk, nd); prev.set(nk, k); push(nd, nk); }
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
    if (L) { const b = game.bridges.get(t.bridge.id); return { L: 1, b, off: 0.18, speed: b.path ? PATHS[b.path].speed : BRIDGE.speed }; }
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
    .filter(h => h.kind === 'house' && h.residents + h.incoming < houseCap(h))
    .sort((a, b) => Math.abs(a.ax - x) + Math.abs(a.ay - y) - Math.abs(b.ax - x) - Math.abs(b.ay - y));
}

// Un'auto con n persone va a vivere in una casa con posto (o esce dalla mappa se non ce ne sono).
// v = auto già in strada da dirottare, oppure null per farne partire una nuova da starts.
function relocate(n, starts, v, color) {
  const here = v ? vehicleNextNode(v) : starts[0];
  if (!here) return;
  for (const h of housesWithRoom(here[0], here[1]).slice(0, 12)) {
    const take = Math.min(n, houseCap(h) - h.residents - h.incoming);
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
  const houses = [...game.buildings.values()].filter(b => b.kind === 'house' && b.residents + b.incoming < houseCap(b));
  if (!houses.length) return;
  const entries = entryTiles();
  for (let tries = 0; tries < Math.min(5, houses.length); tries++) {
    const b = houses[(houseCursor++) % houses.length];
    const route = findRoute(entries, accessTiles(b));
    if (!route) { b.unreachable = true; continue; }
    b.unreachable = false;
    const n = Math.min(houseCap(b) - b.residents - b.incoming, 1 + Math.floor(Math.random() * 2));
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
  const p = vehiclePos(v), ship = v.kind === 'ship';
  for (const o of vehicles) {
    if (o === v || (o.kind === 'ship') !== ship) continue;   // navi e auto non si incontrano
    const q = vehiclePos(o);
    if (ship) {   // una nave aspetta solo quella davanti che va nella stessa direzione
      const oa = o.pts[o.seg], ob = o.pts[Math.min(o.seg + 1, o.pts.length - 1)];
      const ox = ob[0] - oa[0], oy = ob[1] - oa[1];
      if (ox * dx + oy * dy <= 0) continue;
      const rx = q.mx - p.mx, ry = q.my - p.my, ahead = rx * dx + ry * dy, side = Math.abs(-rx * dy + ry * dx);
      if (ahead > 0 && ahead < 1.1 && side < 0.3) return o;
      continue;
    }
    if (Math.abs(q.h - p.h) > 0.7) continue;   // uno sul ponte e uno sotto: non si danno fastidio
    const rx = q.mx - p.mx, ry = q.my - p.my;
    const ahead = rx * dx + ry * dy, side = Math.abs(-rx * dy + ry * dx);
    // distanza minima = mezza lunghezza di tutti e due + un po' di spazio (il furgone è più lungo)
    const gap = halfLen(v) + halfLen(o) + 0.1;
    if (ahead > 0 && ahead < gap && side < 0.14) return o;
  }
  return null;
}
function halfLen(v) { return v.kind === 'bus' ? 0.4 : v.kind === 'van' ? 0.27 : 0.22; }

function simUpdate(dt) {
  if (!game.started || menuIsOpen()) return;
  dt = Math.min(dt, 0.1);
  const done = [];
  for (const v of vehicles) {
    if (v.crash > 0) { v.crash -= dt; v.waited = 0; continue; }   // incidente: fermo, gli altri aspettano dietro
    // fermo troppo a lungo: riparte e per un po' non si ferma (prima ripartiva per un attimo e si
    // fermava di nuovo, e due veicoli uno contro l'altro sembravano bloccati per sempre)
    // Un veicolo non passa mai attraverso quello davanti: aspetta. Solo se si bloccano a vicenda
    // (incrocio, rotonda piena) dopo 3 s uno dei due passa per primo, e gli altri aspettano lui.
    if (v.kind === 'bus' && busHold(v, dt)) { v.waited = 0; continue; }   // fermo alla fermata: sale e scende la gente (bus.js)
    if (v.force > 0) v.force -= dt;
    else {
      const o = blockedAhead(v);
      if (o) {
        v.waited = (v.waited || 0) + dt;
        const deadlock = v.waited >= 3 && (o.waited || 0) > 0.5 && !(o.force > 0);
        if (!deadlock) continue;
        v.force = 1.5;
      }
    }
    v.waited = 0;
    if (moveVehicle(v, dt)) done.push(v);
  }
  if (done.length) {
    vehicles = vehicles.filter(v => !done.includes(v));
    for (const v of done) v.arrive();
  }
  accidentTick(dt);
  jobsTimer -= dt;
  if (jobsTimer <= 0) { jobsTimer = 1; updateJobs(); updateHud(); }
  moveInTimer -= dt;
  if (moveInTimer <= 0) { moveInTimer = MOVE_IN_EVERY; spawnResident(); }
  economyUpdate(dt);
  if (typeof pedsUpdate === 'function') pedsUpdate(dt);   // passanti (people.js)
  game.forestT = (game.forestT || 0) + dt;   // orologio dei tagli degli alberi (forest.js)
  if (vehicles.length || (typeof peds !== 'undefined' && peds.length)) requestDraw();
}

// Un edificio demolito: i veicoli non spariscono, cambiano programma.
//  - auto dirette alla casa: vanno in un'altra casa con posto, altrimenti escono dalla mappa
//  - chi abitava nella casa prende l'auto e fa lo stesso
//  - furgoni diretti lì: tornano a casa con la merce; furgoni senza più casa: escono dalla mappa
function removeVehiclesFor(id, b) {
  for (const v of vehicles.slice()) {
    if (v.kind === 'ship') {   // navi: se sparisce il porto tornano alla piattaforma; senza piattaforma vanno via
      if (v.to === id) { const t = game.buildings.get(id); if (t && v.load) addTo(t.expect || {}, v.good, -v.load); redirectShip(v); }
      else if (v.from === id && !v.to) { v.from = null; v.arrive = () => {}; v.cancel = () => {}; }
      continue;
    }
    if (v.target === id) relocate(v.people || 1, null, v);
    else if (v.kind === 'van' && v.to === id) {
      const home = game.buildings.get(v.from), cargo = v.cargo || (v.good ? { [v.good]: v.load } : {}), fid = v.from;
      const giveBack = f => { for (const [g, q] of Object.entries(cargo)) addTo(f.store, g, q); };
      if (home && redirectVehicle(v, accessTiles(home))) {
        home.status = TR('Destinazione demolita: il furgone torna indietro');
        Object.assign(v, { to: null, arrive() { const f = game.buildings.get(fid); if (f) { giveBack(f); vanHome(f); f.status = ''; } },
          cancel() { const f = game.buildings.get(fid); if (f) { giveBack(f); vanHome(f); } } });
      } else if (redirectVehicle(v, entryTiles(), true)) Object.assign(v, { to: null, from: null, arrive() {}, cancel() {} });
      else { vehicles = vehicles.filter(o => o !== v); if (home) { vanHome(home); giveBack(home); } }
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
  if (typeof pedsOnRoadRemoved === 'function') pedsOnRoadRemoved(x, y);
  const k = nodeKey(x, y, 0);
  const gone = vehicles.filter(v => v.keys.has(k));
  vehicles = vehicles.filter(v => !gone.includes(v));
  for (const v of gone) v.cancel && v.cancel();
}

// ---------- Disegno ----------
// ---------- Incidenti stradali ----------
function accidentTick(dt) {
  game.accidentTimer = (game.accidentTimer ?? ACCIDENT.every) - dt;
  if (game.accidentTimer > 0) return;
  game.accidentTimer = ACCIDENT.every;
  const road = vehicles.filter(v => (v.kind === 'car' || v.kind === 'van' || v.kind === 'bus') && !(v.crash > 0) && v.seg > 0 && !vehiclePos(v).layer);
  if (!road.length || Math.random() > Math.min(ACCIDENT.maxChance, road.length * ACCIDENT.perVehicle)) return;
  causeAccident(road[Math.floor(Math.random() * road.length)]);
}
function causeAccident(v) {
  const p = vehiclePos(v);
  // se c'è un altro veicolo vicino, il tamponamento coinvolge anche lui
  let other = null, bd = 1.2;
  for (const o of vehicles) {
    if (o === v || o.kind === 'ship' || o.crash > 0) continue;
    const q = vehiclePos(o), d = Math.hypot(q.mx - p.mx, q.my - p.my);
    if (d < bd && !q.layer) { bd = d; other = o; }
  }
  for (const o of [v, other]) if (o) o.crash = ACCIDENT.stop;
  const cost = Math.round((ACCIDENT.costMin + Math.random() * (ACCIDENT.costMax - ACCIDENT.costMin)) / 10) * 10;
  game.money -= cost;
  if (typeof noteMoney === 'function') noteMoney('accidents', -cost);
  game.accidents = (game.accidents || 0) + 1;
  game.lastAccident = { x: Math.floor(p.mx), y: Math.floor(p.my) };
  if (typeof toast === 'function') toast(TR('💥 Incidente stradale! Danni e soccorsi: {m}', { m: money(cost) }));
  if (typeof updateHud === 'function') updateHud();
  return cost;
}
// sopra i veicoli dell'incidente: fumo e triangolo di pericolo che lampeggia
function drawCrash(c, v) {
  const { mx, my, h } = v.pos, tx = Math.floor(mx), ty = Math.floor(my);
  const [x, y] = iso(tx, ty, mx - tx, my - ty, h);
  animSeen = true;
  for (let i = 0; i < 3; i++) {
    const t = (animT * 0.6 + i / 3) % 1;
    c.fillStyle = 'rgba(70,70,75,' + (0.5 * (1 - t)).toFixed(2) + ')';
    c.beginPath(); c.arc(x + Math.sin(i * 2 + animT) * 2, y - 6 - t * 14, 2 + t * 4, 0, Math.PI * 2); c.fill();
  }
  if (Math.sin(animT * 8) > -0.3) {
    c.fillStyle = '#ffd34d'; c.strokeStyle = '#1a1c2c'; c.lineWidth = 0.8;
    c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(x, y - 30); c.lineTo(x + 8, y - 16); c.lineTo(x - 8, y - 16); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#1a1c2c'; c.fillRect(x - 1, y - 27, 2, 6.5); c.fillRect(x - 1, y - 19.5, 2, 2);
  }
}

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
  const m = new Map(), foot = new Map();
  m.foot = foot;
  for (const v of (typeof peds !== 'undefined' && peds.length ? vehicles.concat(peds) : vehicles)) {   // anche i passanti
    const p = vehiclePos(v);
    v.pos = p;
    // ingombro del veicolo (con la scia per le navi): si disegna dopo l'ultimo tile che tocca
    // (quello più avanti in +x e +y), così nessun tile disegnato dopo (strada, terreno, acqua) lo copre;
    // i tile che stanno davanti a una parte del veicolo aspettano lui (m.foot, usato da drawFrame)
    const dd = v.pts ? vehicleDir(v) : 1, F = v.kind === 'ship' && v.pts ? shipHeading(v) : DIRS[dd];   // la nave anche in diagonale
    const [front, back, side] = v.kind === 'ship' ? [0.62, 1.1, 0.3] : v.kind === 'bus' ? [0.4, 0.4, 0.14] : v.kind === 'ped' ? [0.06, 0.06, 0.06] : v.kind === 'van' ? [0.27, 0.27, 0.13] : [0.22, 0.22, 0.12];
    const xs = [p.mx + F.dx * front, p.mx - F.dx * back], ys = [p.my + F.dy * front, p.my - F.dy * back];
    const sx = Math.abs(F.dy) * side, sy = Math.abs(F.dx) * side;
    const cl = n => Math.min(game.size - 1, Math.max(0, n));
    const x0 = cl(Math.floor(Math.min(...xs) - sx)), x1 = cl(Math.floor(Math.max(...xs) + sx - 0.001));
    const y0 = cl(Math.floor(Math.min(...ys) - sy)), y1 = cl(Math.floor(Math.max(...ys) + sy - 0.001));
    const tx = x1, ty = y1;
    // dentro un tunnel non si vedono
    const inT = p.layer && bridgeAt(Math.floor(p.mx), Math.floor(p.my));
    if (inT && isTunnel(inT) && game.map[Math.floor(p.my)][Math.floor(p.mx)].bridge.id === inT.id) continue;
    const k = nodeKey(tx, ty, p.layer);   // quelli sul ponte si disegnano dopo l'impalcato
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(v);
    if (!p.layer) for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
      const fk = yy * game.size + xx;
      if (fk !== k && (!foot.has(fk) || foot.get(fk) < k)) foot.set(fk, k);   // se più veicoli: aspetta l'ultimo
    }
  }
  // nello stesso tile prima quelli dietro (somma delle coordinate più piccola)
  for (const list of m.values()) if (list.length > 1) list.sort((a, b) => (a.pos.mx + a.pos.my) - (b.pos.mx + b.pos.my));
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
  if (v.kind === 'ship') { drawShip(c, v); return; }
  if (v.kind === 'ped') { drawPed(c, v); return; }
  const { mx, my, h } = v.pos;
  const d = vehicleDir(v), f = DIRS[d], sd = [-f.dy, f.dx];   // avanti e di lato
  const van = v.kind === 'van', bus = v.kind === 'bus';
  const L = bus ? 0.37 : van ? 0.24 : 0.19, W = bus ? 0.125 : van ? 0.115 : 0.1;
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
  // ruote: dischi sul fianco (gomma, cerchione e mozzo), disegnati nel piano del fianco.
  // Quelle del fianco lontano prima della carrozzeria (si vedono appena sotto), quelle del fianco
  // che guarda lo schermo dopo, come i parafanghi.
  const nearSide = (sd[0] + sd[1]) > 0 ? 1 : -1;           // lato (w = +W o -W) verso lo schermo
  const LP = (a, w, z) => iso(0, 0, mx + f.dx * a + sd[0] * w, my + f.dy * a + sd[1] * w, h + z / STEP);
  const WR = 1.35, WA = 0.052;                             // raggio: in altezza (pixel) e lungo la marcia (tile)
  const disc = (a, w, r, col) => {
    const pts = [];
    for (let k = 0; k < 14; k++) { const t = k / 14 * Math.PI * 2; pts.push(LP(a + Math.cos(t) * WA * r, w, WR + Math.sin(t) * WR * r)); }
    poly(c, pts, col);
  };
  const axles = [-L + 0.065, L - 0.065];
  const wheel = (a, w, near) => {
    disc(a, w, 1, '#1b1b20');                                // gomma
    if (!near || !DETAIL) return;
    disc(a, w + 0.002 * Math.sign(w), 0.62, '#9aa1aa');        // cerchione
    disc(a, w + 0.003 * Math.sign(w), 0.28, '#4a4f56');        // mozzo
    const hl = LP(a - WA * 0.25, w + 0.003 * Math.sign(w), WR + WR * 0.3);  // riflesso
    c.fillStyle = '#dfe4ea'; c.fillRect(hl[0] - 0.25, hl[1] - 0.25, 0.5, 0.5);
  };
  for (const a of axles) wheel(a, -nearSide * (W - 0.01), false);
  const body = v.color || '#d94141', stripe = v.stripe || '#3fa34d';
  if (bus) {   // bus giallo con la fascia dei finestrini e il tetto bianco
    const rc = R(-L, L, -W, W);
    vbox(rc, 1, 10, { l: '#ffcc33', r: '#e0a820', t: '#f2f2f2' });
    const P = (u, vv, z) => iso(0, 0, u, vv, h + z / STEP), [u0, v0, u1, v1] = rc;
    poly(c, [P(u0, v1, 5.5), P(u1, v1, 5.5), P(u1, v1, 8.5), P(u0, v1, 8.5)], '#2b3f55');
    poly(c, [P(u1, v1, 5.5), P(u1, v0, 5.5), P(u1, v0, 8.5), P(u1, v1, 8.5)], '#22334a');
  } else if (van) {
    // cassone dietro, muso con la cabina davanti. Se il muso guarda verso il fondo dello schermo
    // (marcia verso -u o -v) sta dietro al cassone: va disegnato prima, altrimenti si vede attraverso
    const cargo = () => {
      const rc = R(-L, L * 0.3, -W, W);
      vbox(rc, 1, 8.5, { l: '#f2f2f2', r: '#cfd1d4', t: '#ffffff' });
      // striscia dipinta sulle due pareti che si vedono (senza coperchio, così non copre il cassone)
      const P = (u, vv, z) => iso(0, 0, u, vv, h + z / STEP), [u0, v0, u1, v1] = rc;
      poly(c, [P(u0, v1, 4.5), P(u1, v1, 4.5), P(u1, v1, 6.2), P(u0, v1, 6.2)], stripe);
      poly(c, [P(u1, v1, 4.5), P(u1, v0, 4.5), P(u1, v0, 6.2), P(u1, v1, 6.2)], shade(stripe, -0.2));
    };
    const nose = () => {
      vbox(R(L * 0.3, L, -W, W), 1, 4, { l: stripe, r: shade(stripe, -0.25), t: shade(stripe, 0.1) });
      vbox(R(L * 0.3, L * 0.8, -W * 0.92, W * 0.92), 5, 3, { l: '#8fc8e2', r: '#6fa6c2', t: shade(stripe, 0.15) });   // cabina con i vetri
    };
    if (d === 1 || d === 2) { cargo(); nose(); } else { nose(); cargo(); }
  } else {
    vbox(R(-L, L, -W, W), 1, 3.6, { l: body, r: shade(body, -0.25), t: shade(body, 0.12) });             // carrozzeria
    vbox(R(-L * 0.55, L * 0.35, -W * 0.86, W * 0.86), 4.6, 3, { l: '#8fc8e2', r: '#6fa6c2', t: shade(body, 0.2) });   // abitacolo con i vetri
  }
  for (const a of axles) wheel(a, nearSide * (W + 0.004), true);
  if (!DETAIL) return;
  // fari: sul muso se guarda verso lo schermo (+u o +v), altrimenti luci rosse sul retro
  const front = d === 1 || d === 2, a = front ? L : -L, col = front ? '#fff3b0' : '#e83a3a';
  for (const w of [-W * 0.55, W * 0.55]) {
    const p = iso(0, 0, mx + f.dx * a + sd[0] * w, my + f.dy * a + sd[1] * w, h + 3.2 / STEP);
    c.fillStyle = col; c.fillRect(p[0] - 0.5, p[1] - 0.5, 1, 0.8);
  }
}


// ---------- Navi (petrolio dalla piattaforma al porto) ----------
// Viaggiano sui tile d'acqua (4 direzioni) dalla piattaforma alle caselle d'acqua dietro al porto
// (dockTiles); scaricano nel porto (che fa da magazzino marittimo) e tornano indietro.
const SHIP_SPEED = 1.1, SHIP_CAPACITY = 70;   // una nave porta quasi 3 furgoni (richiesta dell'utente: almeno 70)
function isWaterFree(x, y) { return inMap(x, y) && game.map[y][x].type === T.WATER; }
// Rotta delle navi (richiesta dell'utente: la più corta ma lontano dalla costa e senza angoli retti):
// A* su 8 direzioni (in diagonale solo se i due lati sono acqua), con un costo in più vicino alla
// terra; poi shipPoints la raddrizza e la arrotonda in curve.
const SHIP_COAST = [0, 4, 1.5, 0.5];   // costo in più se la terra è a 1, 2, 3 tile
function waterRoute(starts, goals) {
  const N = game.size, goal = new Set(goals.map(([x, y]) => y * N + x));
  const startSet = new Set(starts.map(([x, y]) => y * N + x));
  if (!goal.size || !startSet.size) return null;
  const ok = (x, y) => {
    if (!isWaterFree(x, y)) return false;
    const k = y * N + x, tb = game.map[y][x].building;
    return !tb || goal.has(k) || startSet.has(k);   // altre piattaforme in mezzo: no
  };
  const coastMemo = new Map();
  const coast = k => {   // quanto costa passare qui per la terra vicina
    let c = coastMemo.get(k);
    if (c !== undefined) return c;
    const x = k % N, y = (k - x) / N;
    c = 0;
    for (let r = 1; r <= 3 && !c; r++)
      for (let dy = -r; dy <= r && !c; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = x + dx, ny = y + dy;
        if (inMap(nx, ny) && game.map[ny][nx].type !== T.WATER) { c = SHIP_COAST[r]; break; }
      }
    coastMemo.set(k, c);
    return c;
  };
  const gl = goals.map(([x, y]) => [x, y]);
  const hOf = k => { const x = k % N, y = (k - x) / N; let m = Infinity; for (const [gx, gy] of gl) { const dx = Math.abs(gx - x), dy = Math.abs(gy - y); m = Math.min(m, Math.max(dx, dy) + 0.414 * Math.min(dx, dy)); } return m; };
  const g = new Map(), prev = new Map(), heap = [];
  const push = (k, f) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const pi = (i - 1) >> 1; if (heap[pi][0] <= heap[i][0]) break; [heap[pi], heap[i]] = [heap[i], heap[pi]]; i = pi; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  for (const k of startSet) { g.set(k, 0); prev.set(k, -1); push(k, hOf(k)); }
  const STEPS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
  while (heap.length) {
    const [f, k] = pop(), gk = g.get(k);
    if (f - hOf(k) > gk + 1e-9) continue;   // voce vecchia
    if (goal.has(k)) {
      const path = [];
      for (let c = k; c !== -1; c = prev.get(c)) path.push([c % N, Math.floor(c / N), 0]);
      return path.reverse();
    }
    const x = k % N, y = (k - x) / N;
    for (const [dx, dy, len] of STEPS) {
      const nx = x + dx, ny = y + dy;
      if (!ok(nx, ny) || (dx && dy && (!ok(x + dx, y) || !ok(x, y + dy)))) continue;
      const nk = ny * N + nx, ng = gk + len * (1 + coast(nk));
      if (g.has(nk) && g.get(nk) <= ng) continue;
      g.set(nk, ng); prev.set(nk, k); push(nk, ng + hOf(nk));
    }
  }
  return null;
}
// Le navi tengono la destra (come le auto): così quella che va e quella che torna non si
// sovrappongono. La rotta a caselle diventa una linea con pochi tratti dritti (dove si vede
// l'acqua libera da un punto all'altro), poi gli angoli si arrotondano in curve (Chaikin) e la
// curva si divide in punti vicini: la nave gira piano, niente angoli retti.
const SHIP_LANE = 0.2;
// margine dalla costa per i tratti dritti: circa un tile e mezzo intorno (dove l'acqua è stretta
// si resta sulla rotta a caselle, che sta già in mezzo)
const SEA_MARGIN = [[0, 0]];
for (let i = 0; i < 12; i++) SEA_MARGIN.push([Math.cos(i * Math.PI / 6) * 1.4, Math.sin(i * Math.PI / 6) * 1.4], [Math.cos(i * Math.PI / 6) * 0.7, Math.sin(i * Math.PI / 6) * 0.7]);
function seaClear(ax, ay, bx, by) {   // il tratto dritto passa solo sull'acqua, con un po' di margine
  const n = Math.ceil(Math.hypot(bx - ax, by - ay) * 4) + 1;
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
    for (const [ox, oy] of SEA_MARGIN) {
      const tx = Math.floor(x + ox), ty = Math.floor(y + oy);
      if (!isWaterFree(tx, ty)) return false;
      const b = game.map[ty][tx].building;
      if (b && !(t < 0.15 || t > 0.85)) return false;
    }
  }
  return true;
}
function shipPoints(tiles) {
  if (tiles.length < 2) return tiles.map(([x, y]) => [x + 0.5, y + 0.5, 0, 1, 0]);
  const c = tiles.map(([x, y]) => [x + 0.5, y + 0.5]);
  // 1) tratti dritti più lunghi possibile
  const keep = [c[0]];
  let i = 0;
  while (i < c.length - 1) {
    let j = Math.min(c.length - 1, i + 1);
    for (let k = c.length - 1; k > i + 1; k--) if (seaClear(c[i][0], c[i][1], c[k][0], c[k][1])) { j = k; break; }
    keep.push(c[j]); i = j;
  }
  // 2) angoli arrotondati (se un punto della curva finisse sulla terra si tiene la linea di prima)
  let line = keep;
  for (let it = 0; it < 3 && line.length > 2; it++) {
    const nl = [line[0]];
    for (let k = 0; k < line.length - 1; k++) {
      const [ax, ay] = line[k], [bx, by] = line[k + 1];
      if (k > 0) nl.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25]);
      if (k < line.length - 2) nl.push([ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
    }
    nl.push(line[line.length - 1]);
    if (!nl.every(([x, y]) => isWaterFree(Math.floor(x), Math.floor(y)))) break;
    line = nl;
  }
  // 3) punti ogni ~0.4 tile, spostati sulla destra del senso di marcia
  const pts = [];
  for (let k = 0; k < line.length - 1; k++) {
    const [ax, ay] = line[k], [bx, by] = line[k + 1], n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 0.4));
    for (let q = 0; q < n; q++) pts.push([ax + (bx - ax) * q / n, ay + (by - ay) * q / n]);
  }
  pts.push(line[line.length - 1]);
  return pts.map(([x, y], q) => {
    const a = pts[Math.max(0, q - 1)], b = pts[Math.min(pts.length - 1, q + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    // vicino alla banchina (primo e ultimo tratto) la corsia si stringe, così la nave attracca al molo
    const lane = SHIP_LANE * Math.min(1, q / 3, (pts.length - 1 - q) / 3);
    return [x - dy * lane, y + dx * lane, 0, 1, 0];
  });
}
function platformTiles(b) { return footprint(b.kind, b.ax, b.ay).map(p => [p.x, p.y]); }
// Da dove parte una nave: la piattaforma (è nell'acqua) o le caselle d'acqua dietro al porto
function shipStarts(b) { return BUILDINGS[b.kind].water ? platformTiles(b) : b.kind === 'port' ? dockTiles(b) : []; }
// La merce va in nave: dalla piattaforma al porto, oppure da un porto a un altro porto
function bySea(from, to) { return BUILDINGS[from.kind].water || (from.kind === 'port' && to.kind === 'port'); }
// Petroliera per petrolio, carbone e carburanti; nave portacontainer per tutto il resto
function shipTypeFor(g) { return ['energy', 'fuel'].includes(GOODS[g].cat) ? 'tanker' : 'cargo'; }

function sendByShip(from, to, g, q) {
  const goals = to.kind === 'port' ? dockTiles(to) : [];
  const route = goals.length && waterRoute(shipStarts(from), goals);
  if (!route) { from.status = TR("Nessuna via d'acqua verso {b}", { b: buildingLabel(to) }); from.retry = 3; return false; }
  // una nave alla volta dallo stesso molo: la prossima parte quando la prima si è allontanata
  // (prima ne partivano due insieme, una sopra l'altra)
  if (vehicles.some(v => v.kind === 'ship' && v.load > 0 && v.from === from.id && v.seg < 4)) { from.retry = 1; return false; }
  q = Math.min(from.store[g] || 0, SHIP_CAPACITY, Math.max(0, roomFor(to, g)));   // la nave porta più di un furgone
  if (q <= 0) return false;
  addTo(from.store, g, -q);
  to.expect = to.expect || {};
  addTo(to.expect, g, q);
  from.status = TR('Nave in viaggio verso {b}', { b: buildingLabel(to) });
  const fid = from.id, tid = to.id, shipType = shipTypeFor(g);
  vanOut(from);
  const back = path => spawnVehicle({ kind: 'ship', shipType, from: fid, load: 0, tiles: path, pts: shipPoints(path), speed: SHIP_SPEED,
    arrive() { const f = game.buildings.get(fid); if (f) { vanHome(f); f.status = ''; } },
    cancel() { const f = game.buildings.get(fid); if (f) vanHome(f); } });
  spawnVehicle({ kind: 'ship', shipType, from: fid, to: tid, good: g, load: q, tiles: route, pts: shipPoints(route), speed: SHIP_SPEED,
    arrive() {
      const t = game.buildings.get(tid), f = game.buildings.get(fid);
      if (t) { addTo(t.expect, g, -q); receive(t, g, Math.min(q, Math.max(0, freeFor(t, g)))); }
      if (!f) return;
      f.status = TR('Nave di ritorno');
      back(route.slice().reverse());
    },
    cancel() {
      const t = game.buildings.get(tid), f = game.buildings.get(fid);
      if (t) addTo(t.expect, g, -q);
      if (f) { vanHome(f); addTo(f.store, g, q); }
    },
  });
  return true;
}

// Una nave il cui porto (o piattaforma) è stato demolito: torna indietro dal punto dove si trova
function redirectShip(v) {
  const p = vehiclePos(v), here = [[Math.floor(p.mx), Math.floor(p.my)]];
  const home = game.buildings.get(v.from);
  const g = v.good, q = v.load, fid = v.from;
  const path = home && waterRoute(here, shipStarts(home));
  vehicles = vehicles.filter(o => o !== v);
  if (!path) { if (home) { vanHome(home); if (q) addTo(home.store, g, q); } return; }
  const pts = [[p.mx, p.my, 0, 1, 0], ...shipPoints(path.slice(1))];
  spawnVehicle({ kind: 'ship', shipType: v.shipType, from: fid, load: q, good: g, tiles: path, pts, speed: SHIP_SPEED,
    arrive() { const f = game.buildings.get(fid); if (f) { vanHome(f); if (q) addTo(f.store, g, q); f.status = ''; } },
    cancel() { const f = game.buildings.get(fid); if (f) vanHome(f); } });
}

// Nave disegnata come gli edifici: scafo con la fascia rossa sotto la linea di galleggiamento e la
// prua a punta, albero a prua, castello a poppa alto due piani (bianco, azzurro, bianco) e il fumaiolo.
// Petroliera (petrolio, carbone, carburanti): ponte verde con il tubo e i boccaporti.
// Portacontainer (tutte le altre merci): fiancata verde scura e container colorati su due piani.
// Dondola un po' sull'acqua; scia e onde alla prua.
// Direzione di marcia della nave: quella del tratto in corso, mescolata con il prossimo verso la
// fine del tratto (così in curva gira piano)
function shipHeading(v) {
  const P = v.pts, i = Math.min(v.seg, P.length - 2);
  if (i < 0) return { dx: 1, dy: 0 };
  const d1 = [P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]], j = Math.min(i + 1, P.length - 2);
  const d2 = [P[j + 1][0] - P[j][0], P[j + 1][1] - P[j][1]];
  const l1 = Math.hypot(...d1) || 1, l2 = Math.hypot(...d2) || 1, t = Math.min(1, (v.s || 0) / l1) * 0.5;
  let dx = d1[0] / l1 * (1 - t) + d2[0] / l2 * t, dy = d1[1] / l1 * (1 - t) + d2[1] / l2 * t;
  const l = Math.hypot(dx, dy) || 1;
  return { dx: dx / l, dy: dy / l };
}
function drawShip(c, v) {
  const { mx, my } = v.pos;
  const f = shipHeading(v), sd = [-f.dy, f.dx];   // direzione di marcia qualsiasi (anche in curva)
  const bob = DETAIL ? Math.sin(animT * 2.2 + (v.from || 0)) * 0.025 : 0;
  const h = v.pos.h + bob;
  const L = 0.46, W = 0.115, DECK = 3.4, K = 1.3;   // K = grandezza della nave (tutto in proporzione)
  const LP = (a, w, z) => iso(0, 0, mx + (f.dx * a + sd[0] * w) * K, my + (f.dy * a + sd[1] * w) * K, h + z * K / STEP);
  // pezzi sul ponte: rettangoli nel verso della nave (a = lungo la nave, w = di lato), girati con lei
  const R = (a0, a1, w0, w1) => ({ a0, a1, w0, w1 });
  const W2 = (a, w) => [mx + (f.dx * a + sd[0] * w) * K, my + (f.dy * a + sd[1] * w) * K];   // punto nel mondo
  const vbox = (rc, z0, hp, col) => {   // scatola girata: facce verso lo schermo e coperchio
    const cs = [[rc.a0, rc.w0], [rc.a1, rc.w0], [rc.a1, rc.w1], [rc.a0, rc.w1]];
    const lo = cs.map(([a, w]) => LP(a, w, z0)), hi = cs.map(([a, w]) => LP(a, w, z0 + hp));
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4, A = W2(...cs[i]), B = W2(...cs[j]);
      const nu = B[1] - A[1], nv = -(B[0] - A[0]);   // normale (il giro dei vertici va in senso orario)
      if (nu + nv <= 0) continue;                      // faccia girata dall'altra parte
      poly(c, [lo[i], lo[j], hi[j], hi[i]], nv >= nu ? col.l : col.r);
    }
    poly(c, hi, col.t);
    if (DETAIL) { c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 0.4; c.beginPath(); c.moveTo(...hi[0]); for (const q of hi.slice(1)) c.lineTo(...q); c.closePath(); c.stroke(); }
  };
  if (DETAIL) {   // scia dietro e onde ai lati della prua
    const wake = 0.35 + 0.15 * Math.sin(animT * 3);
    c.fillStyle = 'rgba(255,255,255,' + wake.toFixed(2) + ')';
    c.beginPath(); c.moveTo(...LP(-L + 0.02, -W * 0.9, 0)); c.lineTo(...LP(-L - 0.38, -W * 0.25, 0)); c.lineTo(...LP(-L - 0.38, W * 0.25, 0)); c.lineTo(...LP(-L + 0.02, W * 0.9, 0)); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 0.6;
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(...LP(L, 0, 0)); c.lineTo(...LP(L * 0.55, s * W * 1.45, 0)); c.stroke(); }
    // acqua che si muove: anelli che si allargano dietro la poppa e schiuma che scorre lungo i fianchi
    const ph = animT + (v.from || 0) * 0.37;
    for (let i = 0; i < 3; i++) {
      const t = (ph * 0.7 + i / 3) % 1, a0 = -L - 0.12 - t * 0.55, r = 0.05 + t * 0.16;
      c.strokeStyle = 'rgba(255,255,255,' + (0.55 * (1 - t)).toFixed(2) + ')'; c.lineWidth = 0.7;
      c.beginPath();
      for (let k = 0; k <= 12; k++) { const q = k / 12 * Math.PI * 2, P = LP(a0 + Math.cos(q) * r * 0.7, Math.sin(q) * r * 1.4, 0); k ? c.lineTo(...P) : c.moveTo(...P); }
      c.stroke();
    }
    c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 0.6;
    for (const s2 of [-1, 1]) for (let i = 0; i < 4; i++) {
      const t = (ph * 1.1 + i / 4) % 1, a1 = L * 0.55 - t * (L * 1.5);
      c.beginPath(); c.moveTo(...LP(a1, s2 * W * 1.2, 0)); c.lineTo(...LP(a1 - 0.07, s2 * W * (1.3 + t * 0.4), 0)); c.stroke();
    }
    animSeen = true;   // così il gioco continua a ridisegnare (30 volte al secondo) e l'acqua si vede muovere
  }
  // scafo: contorno con la prua a punta e la poppa squadrata
  const out = [[-L, -W], [L * 0.5, -W], [L * 0.82, -W * 0.62], [L, 0], [L * 0.82, W * 0.62], [L * 0.5, W], [-L, W]];
  const ring = (z, k) => out.map(([a, w]) => LP(a * (k || 1), w * (k || 1), z));
  const sides = (z0, z1, col, k0, k1) => {
    const lo = ring(z0, k0), hi = ring(z1, k1);
    for (let i = 0; i < out.length; i++) {
      const j = (i + 1) % out.length, A = out[i], B = out[j];
      const nx = B[1] - A[1], ny = -(B[0] - A[0]);              // normale verso fuori nel piano (marcia, lato)
      const wu = f.dx * nx + sd[0] * ny, wv = f.dy * nx + sd[1] * ny;
      if (wu + wv <= 0) continue;                                 // faccia girata dall'altra parte
      poly(c, [lo[i], lo[j], hi[j], hi[i]], wu > wv ? shadeC(col, -0.3) : col);
    }
  };
  const cargo = v.shipType === 'cargo';     // nave portacontainer (le altre merci); altrimenti petroliera
  sides(-0.6, 1.2, '#b5473a', 0.96, 1);      // opera viva rossa, un po' rientrata sotto
  sides(1.2, DECK, cargo ? '#2f5f4a' : '#24324a', 1, 1);   // fiancata: verde scuro (container) o blu scuro (petroliera)
  const deck = ring(DECK);
  poly(c, deck, cargo ? '#8a8f96' : '#4f7a52');
  if (DETAIL) {
    c.strokeStyle = '#f2f2f2'; c.lineWidth = 0.45;   // bordo bianco del ponte
    c.beginPath(); c.moveTo(...deck[0]); for (const p of deck.slice(1)) c.lineTo(...p); c.closePath(); c.stroke();
    if (!cargo) {                                    // petroliera: tubo lungo il ponte
      c.strokeStyle = '#c9ced4'; c.lineWidth = 0.7;
      c.beginPath(); c.moveTo(...LP(-0.12, 0, DECK + 0.6)); c.lineTo(...LP(L * 0.7, 0, DECK + 0.6)); c.stroke();
    }
  }
  // pezzi sul ponte, dal fondo dello schermo verso il davanti
  const stripe = v.stripe || (cargo ? '#3f6fd9' : '#d94141');
  const WHITE = { l: '#f4f4f2', r: '#cfd1d4', t: '#ffffff' }, AZURE = { l: '#7cc4ea', r: '#5aa3cc', t: '#9fd8f2' };
  const CONT = ['#d94141', '#3f6fd9', '#e8c23a', '#3fa34d', '#e07b39', '#8e5bd1'];
  const parts = [];
  if (cargo) {   // file di container colorati, due piani
    const fill = [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [2, 1], [3, 0]];
    for (const [k, lvl] of fill) {
      const a = -0.14 + k * 0.11, col = CONT[(k * 2 + lvl + (v.from || 0)) % CONT.length];
      for (const side of [-1, 1]) {
        const w0 = side < 0 ? -W * 0.8 : 0.005, w1 = side < 0 ? -0.005 : W * 0.8;
        parts.push({ rc: R(a - 0.05, a + 0.05, w0, w1), z: DECK + lvl * 2.4, hp: 2.4, col: { l: col, r: shadeC(col, -0.25), t: shadeC(col, 0.2) } });
      }
    }
  } else {
    for (const a of [-0.12, -0.01, 0.1, 0.21])   // boccaporti
      parts.push({ rc: R(a - 0.03, a + 0.03, -W * 0.45, W * 0.45), z: DECK, hp: 0.8, col: { l: '#6b8f6a', r: '#4f6f4e', t: '#86a884' } });
  }
  // castello di poppa: due piani, bianco - azzurro (le finestre) - bianco, e il fumaiolo
  const cab = R(-L + 0.03, -L + 0.17, -W * 0.8, W * 0.8);
  parts.push({ rc: cab, z: DECK, hp: 1.6, col: WHITE, stack: true },
    { rc: cab, z: DECK + 1.6, hp: 1.6, col: AZURE, stack: true },
    { rc: cab, z: DECK + 3.2, hp: 1.6, col: WHITE, stack: true },
    { rc: R(-L + 0.07, -L + 0.12, -0.03, 0.03), z: DECK + 4.8, hp: 3.6, col: { l: stripe, r: shadeC(stripe, -0.25), t: '#1f1f24' }, funnel: true },
    { rc: R(L * 0.72, L * 0.74, -0.01, 0.01), z: DECK, hp: 5, col: { l: '#e8e8e8', r: '#bfc3c8', t: '#ffffff' } });   // albero a prua
  // ordine: dal fondo; i pezzi uno sopra l'altro (castello, fumaiolo) dal basso verso l'alto
  const depth = p => { const [u, vv] = W2((p.rc.a0 + p.rc.a1) / 2, (p.rc.w0 + p.rc.w1) / 2); return u + vv; };
  parts.sort((p, q) => {
    const sameSpot = p.stack && q.stack;
    if (sameSpot) return p.z - q.z;
    if (p.funnel && q.stack) return 1;
    if (q.funnel && p.stack) return -1;
    return depth(p) - depth(q) || p.z - q.z;
  });
  for (const p of parts) {
    vbox(p.rc, p.z, p.hp, p.col);
    if (p.funnel && DETAIL) {   // fascia nera in cima al fumaiolo e un filo di fumo
      const z1 = p.z + p.hp;
      vbox(p.rc, z1 - 0.9, 0.9, { l: '#1f1f24', r: '#16161a', t: '#1f1f24' });
      smokePuff(c, ...LP((p.rc.a0 + p.rc.a1) / 2, (p.rc.w0 + p.rc.w1) / 2, z1), 0.5 + (v.from || 0) * 0.1);
    }
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
