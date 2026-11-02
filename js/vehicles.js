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

function driveNeighbors(x, y) {
  const out = [];
  const t = game.map[y][x];
  for (let d = 0; d < 4; d++) {
    const nx = x + DIRS[d].dx, ny = y + DIRS[d].dy;
    if (!roadLinked(x, y, d) || !roadAt(nx, ny)) continue;
    if (sameRoundabout(x, y, nx, ny) && d !== RB_NEXT[(x - t.rb.ax) + ',' + (y - t.rb.ay)]) continue;
    out.push([nx, ny]);
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
function findRoute(starts, goals) {
  if (!starts.length || !goals.length) return null;
  const N = game.size;
  const goalSet = new Set(goals.map(([x, y]) => y * N + x));
  const prev = new Map();
  const queue = [];
  for (const [x, y] of starts) { const k = y * N + x; if (!prev.has(k)) { prev.set(k, -1); queue.push(k); } }
  for (let qi = 0; qi < queue.length; qi++) {
    const k = queue[qi];
    if (goalSet.has(k)) {
      const path = [];
      for (let c = k; c !== -1; c = prev.get(c)) path.push([c % N, (c / N) | 0]);
      return path.reverse();
    }
    for (const [nx, ny] of driveNeighbors(k % N, (k / N) | 0)) {
      const nk = ny * N + nx;
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
// e l'altro, spostati sulla corsia di destra
function routePoints(tiles, fromOutside) {
  const OFF = 0.18;
  const dirOf = (a, b) => DIRS.findIndex(D => D.dx === b[0] - a[0] && D.dy === b[1] - a[1]);
  const right = d => [-DIRS[d].dy, DIRS[d].dx];
  const n = tiles.length, pts = [];
  const dFirst = n > 1 ? dirOf(tiles[0], tiles[1]) : 1;
  if (fromOutside) { // arriva da fuori mappa: parte un tile prima del bordo
    const r = right(dFirst);
    pts.push([tiles[0][0] + 0.5 - DIRS[dFirst].dx * 1.5 + r[0] * OFF, tiles[0][1] + 0.5 - DIRS[dFirst].dy * 1.5 + r[1] * OFF]);
  }
  for (let i = 0; i < n; i++) {
    const [x, y] = tiles[i];
    const dIn = i > 0 ? dirOf(tiles[i - 1], tiles[i]) : dFirst;
    const dOut = i < n - 1 ? dirOf(tiles[i], tiles[i + 1]) : dIn;
    const ri = right(dIn), ro = right(dOut);
    pts.push([x + 0.5 + (ri[0] + ro[0]) / 2 * OFF, y + 0.5 + (ri[1] + ro[1]) / 2 * OFF]);
    if (i < n - 1) pts.push([x + MID_UV[dOut][0] + ro[0] * OFF, y + MID_UV[dOut][1] + ro[1] * OFF]);
  }
  return pts.map(([mx, my]) => [mx, my, surfaceHeight(mx, my)]);
}

function spawnVehicle(v) {
  v.seg = 0; v.s = 0;
  v.keys = new Set(v.tiles.map(([x, y]) => y * game.size + x));
  vehicles.push(v);
  return v;
}

// ---------- Abitanti ----------
// Ogni tanto un'auto parte da un'entrata della strada principale verso una casa con posti liberi
function spawnResident() {
  if (vehicles.length >= MAX_CARS) return;
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
      kind: 'car', target: b.id, people: n, tiles: route, pts: routePoints(route, true),
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

// ---------- Fattorie e furgoni ----------
function farmTotal(f) { return f.inventory; }

function warehouseFree(w) {
  return WAREHOUSE_CAPACITY - Object.values(w.stock).reduce((a, b) => a + b, 0);
}

// Il furgone carica il raccolto, lo porta al magazzino scelto e torna
function dispatchVan(farm) {
  const wh = game.buildings.get(farm.storage);
  if (!wh) { farm.storage = null; return; }
  const free = warehouseFree(wh);
  if (free <= 0) { farm.status = 'Il magazzino è pieno'; return; }
  if (!wh.workers) { farm.status = 'Il magazzino non ha personale'; farm.retry = 3; return; }
  const route = findRoute(accessTiles(farm), accessTiles(wh));
  if (!route) { farm.status = 'Nessuna strada verso il magazzino'; farm.retry = 3; return; }
  const load = Math.min(farm.inventory, FARM.vanCapacity, free);
  const crop = farm.crop;
  farm.inventory -= load;
  farm.status = 'Furgone in viaggio verso il magazzino';
  farm.van = spawnVehicle({
    kind: 'van', farm: farm.id, wh: wh.id, load, crop, tiles: route, pts: routePoints(route, false), speed: VAN_SPEED,
    arrive() {
      const w = game.buildings.get(wh.id), f = game.buildings.get(farm.id);
      if (w) w.stock[crop] += Math.min(load, warehouseFree(w));
      if (!f) return;
      // ritorno alla fattoria
      const back = findRoute(accessTiles(w || wh), accessTiles(f));
      if (!back) { f.van = null; f.status = 'Consegna fatta'; return; }
      f.status = 'Furgone di ritorno';
      f.van = spawnVehicle({
        kind: 'van', farm: f.id, load: 0, tiles: back, pts: routePoints(back, false), speed: VAN_SPEED,
        arrive() { const ff = game.buildings.get(f.id); if (ff) { ff.van = null; ff.status = 'Furgone fermo in fattoria'; } },
        cancel() { const ff = game.buildings.get(f.id); if (ff) ff.van = null; },
      });
    },
    cancel() {
      const f = game.buildings.get(farm.id);
      if (f) { f.van = null; f.inventory = Math.min(FARM.inventoryCap, f.inventory + load); }
    },
  });
}

function updateFarm(f, dt) {
  // cresce solo se ha campi, personale e l'inventario non è pieno; più personale = più veloce
  const staff = (f.workers || 0) / JOBS.farm;
  if (f.fields > 0 && staff > 0 && f.inventory < FARM.inventoryCap) {
    const before = Math.floor(f.growth * 4);
    f.growth += dt / FARM.cycleSec * staff;
    if (f.growth >= 1) {
      f.growth = 0;
      f.inventory = Math.min(FARM.inventoryCap, f.inventory + f.fields * FARM.yieldPerField);
    }
    if (Math.floor(f.growth * 4) !== before) requestDraw();
  }
  if (f.retry > 0) { f.retry -= dt; return; }
  if (!f.van && f.storage && f.inventory >= FARM.vanMinLoad) dispatchVan(f);
}

// ---------- Aggiornamento ----------
function moveVehicle(v, dt) {
  let left = v.speed * dt;
  while (left > 0 && v.seg < v.pts.length - 1) {
    const a = v.pts[v.seg], b = v.pts[v.seg + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 0.0001;
    const step = Math.min(left, len - v.s);
    v.s += step; left -= step;
    if (v.s >= len - 1e-6) { v.seg++; v.s = 0; }
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
  for (const b of game.buildings.values()) if (b.kind === 'farm') updateFarm(b, dt);
  if (vehicles.length) requestDraw();
}

// Un edificio demolito: spariscono i veicoli diretti lì o che ne partivano
function removeVehiclesFor(id) {
  const gone = vehicles.filter(v => v.target === id || v.farm === id || v.wh === id);
  vehicles = vehicles.filter(v => !gone.includes(v));
  for (const v of gone) v.cancel && v.cancel();
}

// Una strada demolita: i veicoli che dovevano passarci spariscono (ci riproveranno)
function onRoadRemoved(x, y) {
  const k = y * game.size + x;
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
    alongU: Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) };
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
    const k = ty * game.size + tx;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(v);
  }
  return m;
}

function drawVehicle(c, v) {
  const { mx, my, h, alongU } = v.pos;
  const L = v.kind === 'van' ? 0.24 : 0.19, W = v.kind === 'van' ? 0.12 : 0.1;
  const [hu, hv] = alongU ? [L, W] : [W, L];
  if (v.kind === 'van') {
    box(c, 0, 0, h, mx - hu, my - hv, mx + hu, my + hv, 7, { l: '#e8e8e8', r: '#c4c4c4', t: '#f6f6f6' });
    box(c, 0, 0, h + 3 / STEP, mx - hu, my - hv, mx + hu, my + hv, 1.5, { l: '#3fa34d', r: '#2f7f3a', t: null }); // striscia verde
  } else {
    const col = v.color;
    box(c, 0, 0, h, mx - hu, my - hv, mx + hu, my + hv, 4, { l: col, r: shade(col, -0.25), t: shade(col, 0.15) });
    const [cu, cv] = alongU ? [hu * 0.55, hv * 0.85] : [hu * 0.85, hv * 0.55];
    box(c, 0, 0, h + 4 / STEP, mx - cu, my - cv, mx + cu, my + cv, 3, { l: '#9fd3e8', r: '#7fb3c8', t: shade(col, 0.1) });
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
