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
  for (const [x, y] of starts) { const k = nodeKey(x, y, 0); if (!prev.has(k)) { prev.set(k, -1); queue.push(k); } }
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
function routePoints(tiles, fromOutside) {
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
  return pts;
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

// Un edificio demolito: spariscono i veicoli diretti lì o che ne partivano
function removeVehiclesFor(id) {
  const gone = vehicles.filter(v => v.target === id || v.from === id || v.to === id);
  vehicles = vehicles.filter(v => !gone.includes(v));
  for (const v of gone) v.cancel && v.cancel();
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
    const k = nodeKey(tx, ty, p.layer);   // quelli sul ponte si disegnano dopo l'impalcato
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
    const st = v.stripe || '#3fa34d';
    box(c, 0, 0, h + 3 / STEP, mx - hu, my - hv, mx + hu, my + hv, 1.5, { l: st, r: shade(st, -0.2), t: null }); // striscia colorata
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
