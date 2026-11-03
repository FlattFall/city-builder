// ---------- Economia: merci, produzione, trasporti, vendite ----------
// Ogni attività ha un deposito di merce pronta (store) e, se trasforma qualcosa, un deposito
// di materie prime (input).
//  - Fattorie, allevamenti e trasformatori (fabbrica, panificio, caseificio, macello) MANDANO la
//    loro merce alle destinazioni scelte (dests): ogni merce va alla prima che la accetta.
//  - I trasformatori e il supermercato si RIFORNISCONO anche dai magazzini, se lì c'è quello che serve.
//  - Il supermercato vende agli abitanti vicini e il giocatore incassa le tasse.
// I trasporti si fanno con i furgoni, su strada, partendo e arrivando alle entrate.

const sumOf = o => Object.values(o || {}).reduce((a, b) => a + b, 0);
const VAN_MIN_LOAD = FARM.vanMinLoad, VAN_CAPACITY = FARM.vanCapacity;

// Prepara (o aggiorna da un vecchio salvataggio) i dati economici di un edificio
function initEconomy(b) {
  const caps = CAPS[b.kind];
  if (!caps) return b;
  b.store = b.store || {};
  if (caps.input) b.input = b.input || {};
  // salvataggi di prima: inventario della fattoria e scorte del magazzino
  if (b.kind === 'farm' && typeof b.inventory === 'number') {
    if (b.inventory) b.store[b.crop] = (b.store[b.crop] || 0) + b.inventory;
    delete b.inventory;
  }
  if (b.kind === 'warehouse' && b.stock) {
    for (const [g, q] of Object.entries(b.stock)) if (q) b.store[g] = (b.store[g] || 0) + q;
    delete b.stock;
  }
  if (b.kind === 'warehouse') b.accept = b.accept || {};    // accept[g] === false: non accetta g
  if (RECIPES[b.kind]) b.recipes = b.recipes || {};         // recipes[out] === false: ricetta spenta
  if (b.kind === 'supermarket') { b.sold = b.sold || 0; b.taxes = b.taxes || 0; }
  // destinazioni: lista di id (prima era una sola, "storage")
  if (!Array.isArray(b.dests)) b.dests = b.storage ? [b.storage] : [];
  delete b.storage;
  b.work = b.work || 0;
  return b;
}

// Trasformatori: edifici con ricette (fabbrica, panificio, caseificio, macello)
function isProcessor(b) { return !!RECIPES[b.kind]; }

function addTo(map, g, q) { map[g] = (map[g] || 0) + q; if (map[g] <= 0) delete map[g]; }

// Ricette attive che usano la merce g
function usesInput(b, g) {
  return (RECIPES[b.kind] || []).some(r => b.recipes[r.out] !== false && r.in[g]);
}

// Quanto spazio c'è per la merce g (senza contare quella già in viaggio verso l'edificio)
function freeFor(b, g) {
  const caps = CAPS[b.kind];
  if (!caps) return 0;
  if (b.kind === 'warehouse') return b.accept[g] === false ? 0 : caps.store - sumOf(b.store);
  if (isProcessor(b)) return usesInput(b, g) ? caps.input - sumOf(b.input) : 0;
  if (b.kind === 'supermarket') return GOODS[g].price ? caps.store - sumOf(b.store) : 0;
  return 0;
}

// Spazio libero tolta la merce già in arrivo
function roomFor(b, g) {
  const f = freeFor(b, g);
  return f > 0 ? f - sumOf(b.expect) : 0;
}

function receive(b, g, q) {
  if (isProcessor(b)) addTo(b.input, g, q);
  else addTo(b.store, g, q);
}

function buildingLabel(b) { return BUILDINGS[b.kind].name.toLowerCase() + ' #' + b.id; }

const VAN_STRIPES = { farm: '#3fa34d', warehouse: '#3f6fd9', factory: '#e07b39', bakery: '#8a5a3a',
  dairy: '#8fc6e8', slaughterhouse: '#c83232', cowFarm: '#2b2b33', chickenFarm: '#e8c23a', pigFarm: '#e8899a', sheepFarm: '#c9c4b8' };

// Il furgone di "from" porta q unità di g a "to" e poi torna indietro
function sendGoods(from, to, g, q) {
  const route = findRoute(accessTiles(from), accessTiles(to));
  if (!route) { from.status = 'Nessuna strada verso ' + buildingLabel(to); from.retry = 3; return false; }
  addTo(from.store, g, -q);
  to.expect = to.expect || {};
  addTo(to.expect, g, q);
  from.status = 'Furgone in viaggio verso ' + buildingLabel(to);
  const fid = from.id, tid = to.id, stripe = VAN_STRIPES[from.kind];
  from.van = spawnVehicle({
    kind: 'van', from: fid, to: tid, good: g, load: q, stripe, tiles: route, pts: routePoints(route, false), speed: VAN_SPEED,
    arrive() {
      const t = game.buildings.get(tid), f = game.buildings.get(fid);
      if (t) { addTo(t.expect, g, -q); receive(t, g, Math.min(q, Math.max(0, freeFor(t, g)))); }
      if (!f) return;
      const back = t && findRoute(accessTiles(t), accessTiles(f));
      if (!back) { f.van = null; f.status = ''; return; }
      f.status = 'Furgone di ritorno';
      f.van = spawnVehicle({
        kind: 'van', from: fid, load: 0, stripe, tiles: back, pts: routePoints(back, false), speed: VAN_SPEED,
        arrive() { const ff = game.buildings.get(fid); if (ff) { ff.van = null; ff.status = ''; } },
        cancel() { const ff = game.buildings.get(fid); if (ff) ff.van = null; },
      });
    },
    cancel() {
      const t = game.buildings.get(tid), f = game.buildings.get(fid);
      if (t) addTo(t.expect, g, -q);
      if (f) { f.van = null; addTo(f.store, g, q); }
    },
  });
  return true;
}

// Manda la merce pronta: prova le destinazioni scelte, in ordine, e manda la merce più
// abbondante che la destinazione accetta (con personale e posto libero)
function pushGoods(b) {
  b.dests = b.dests.filter(id => game.buildings.has(id));
  if (b.van || !b.dests.length || b.retry > 0) return;
  if (sumOf(b.store) < VAN_MIN_LOAD) return;   // aspetta di avere un carico
  let why = '';
  for (const id of b.dests) {
    const to = game.buildings.get(id);
    // due magazzini che si mandano la merce a vicenda la farebbero girare all'infinito
    if (b.kind === 'warehouse' && to.kind === 'warehouse' && to.dests.includes(b.id)) {
      why = why || 'Due magazzini non possono mandarsi la merce a vicenda'; continue;
    }
    let best = null, bq = 0;
    for (const [g, q] of Object.entries(b.store)) if (q > bq && roomFor(to, g) > 0) { best = g; bq = q; }
    if (!best) { why = why || 'Le destinazioni non accettano questa merce o sono piene'; continue; }
    if (!to.workers) { why = buildingLabel(to) + ' non ha personale'; continue; }
    if (sendGoods(b, to, best, Math.min(bq, VAN_CAPACITY, roomFor(to, best)))) return;
    why = b.status;
  }
  b.status = why;
  if (why) b.retry = 3;
}

// Merci che servono a un edificio: materie prime delle ricette attive o merce da vendere
function wantedGoods(b) {
  // il supermercato lascia la precedenza a chi la merce la trasforma (es. la farina al panificio)
  if (b.kind === 'supermarket') return Object.keys(GOODS).filter(g => GOODS[g].price &&
    ![...game.buildings.values()].some(p => isProcessor(p) && p.workers && roomFor(p, g) >= VAN_MIN_LOAD));
  return Object.keys(GOODS).filter(g => usesInput(b, g));
}

// Chiede a un magazzino quello che serve (un furgone alla volta, ogni qualche secondo)
function pullGoods(b) {
  if (b.pullTimer > 0 || !b.workers) return;
  b.pullTimer = 3;
  const wanted = wantedGoods(b).filter(g => roomFor(b, g) >= VAN_MIN_LOAD)
    .sort((x, y) => ((b.input || b.store)[x] || 0) - ((b.input || b.store)[y] || 0)); // prima quello che manca di più
  if (!wanted.length) return;
  for (const w of game.buildings.values()) {
    if (w.kind !== 'warehouse' || w.van || !w.workers) continue;
    const g = wanted.find(x => (w.store[x] || 0) > 0);
    if (!g) continue;
    if (sendGoods(w, b, g, Math.min(w.store[g], VAN_CAPACITY, roomFor(b, g)))) return;
  }
}

// ---------- Produzione ----------
function updateFarm(f, dt) {
  // cresce solo se ha campi, personale e posto in inventario; più personale = più veloce
  const staff = (f.workers || 0) / JOBS.farm;
  f.full = sumOf(f.store) >= CAPS.farm.store;
  if (f.fields > 0 && staff > 0 && !f.full) {
    const before = Math.floor(f.growth * 4);
    f.growth += dt / FARM.cycleSec * staff;
    if (f.growth >= 1) {
      f.growth = 0;
      addTo(f.store, f.crop, Math.min(CAPS.farm.store - sumOf(f.store), f.fields * FARM.yieldPerField));
    }
    if (Math.floor(f.growth * 4) !== before) requestDraw();
  }
  pushGoods(f);
}

// Allevamenti: con il personale, ogni tanto producono latte, uova, lana e animali per il macello
function updateLivestock(b, dt) {
  const L = LIVESTOCK[b.kind], cap = CAPS[b.kind].store;
  const staff = (b.workers || 0) / JOBS[b.kind];
  b.full = sumOf(b.store) >= cap;
  if (staff > 0 && !b.full) {
    b.growth = (b.growth || 0) + dt / L.every * staff;
    if (b.growth >= 1) {
      b.growth = 0;
      for (const [g, q] of Object.entries(L.out)) addTo(b.store, g, Math.min(q, cap - sumOf(b.store)));
    }
  }
  pushGoods(b);
}

// Trasformatori: a ogni ciclo ogni ricetta attiva con le materie prime fa 1 prodotto
function updateProducer(b, dt) {
  const staff = (b.workers || 0) / JOBS[b.kind];
  const cap = CAPS[b.kind].store;
  b.full = sumOf(b.store) >= cap;
  if (staff > 0 && !b.full) {
    b.work += dt * staff / PRODUCE_TICK[b.kind];
    if (b.work >= 1) {
      b.work -= 1;
      let made = 0;
      for (const r of RECIPES[b.kind]) {
        if (b.recipes[r.out] === false || sumOf(b.store) >= cap) continue;
        if (!Object.entries(r.in).every(([g, n]) => (b.input[g] || 0) >= n)) continue;
        for (const [g, n] of Object.entries(r.in)) addTo(b.input, g, -n);
        addTo(b.store, r.out, 1);
        made++;
      }
      b.noInput = made === 0;
      b.full = sumOf(b.store) >= cap;
    }
  }
  pushGoods(b);
  pullGoods(b);
}

// Supermercato: gli abitanti delle case vicine comprano; le tasse vanno al giocatore
function updateShop(b, dt) {
  const staff = (b.workers || 0) / JOBS.supermarket;
  pullGoods(b);
  if (!staff) return;
  b.work += dt * staff / SHOP.tick;
  if (b.work < 1) return;
  b.work -= 1;
  let customers = 0;
  for (const h of game.buildings.values())
    if (h.kind === 'house' && distToBuilding(b, h.ax, h.ay) <= SHOP.radius) customers += h.residents || 0;
  b.customers = customers;
  let buys = Math.ceil(customers * SHOP.buyRate);
  const goods = Object.keys(b.store);
  b.empty = customers > 0 && !goods.length;
  let i = b.cursor || 0;
  while (buys > 0 && sumOf(b.store) > 0) {
    const g = goods[i++ % goods.length];
    if (!b.store[g]) continue;
    addTo(b.store, g, -1);
    const tax = Math.max(1, Math.round(GOODS[g].price * TAX_RATE));
    game.money += tax; b.taxes += tax; b.sold++; buys--;
  }
  b.cursor = i;
  updateHud();
}

function economyUpdate(dt) {
  for (const b of game.buildings.values()) {
    if (b.retry > 0) b.retry -= dt;
    if (b.pullTimer > 0) b.pullTimer -= dt;
    if (b.kind === 'farm') updateFarm(b, dt);
    else if (LIVESTOCK[b.kind]) updateLivestock(b, dt);
    else if (isProcessor(b)) updateProducer(b, dt);
    else if (b.kind === 'supermarket') updateShop(b, dt);
    else if (b.kind === 'warehouse') {
      b.full = sumOf(b.store) >= CAPS.warehouse.store;
      if (b.workers) pushGoods(b);   // uscita: manda le scorte alle destinazioni scelte
    }
  }
}

// Stato da mostrare con un'icona sopra l'edificio (null = tutto bene)
function buildingStatus(b) {
  // casa senza strada accanto o non raggiungibile dalla strada principale
  if (b.kind === 'house') return (!accessTiles(b).length || b.unreachable) ? 'noRoad' : null;
  const need = JOBS[b.kind];
  if (need && (b.workers || 0) < need) return b.workers ? 'fewWorkers' : 'noWorkers';
  if (!accessTiles(b).length) return 'noRoad';
  if (b.full) return 'full';
  if (b.noInput) return 'noInput';
  if (b.empty) return 'empty';
  return null;
}
