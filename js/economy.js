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
  if (isWarehouse(b)) b.accept = b.accept || {};    // accept[g] === false: non accetta g
  if (RECIPES[b.kind]) b.recipes = b.recipes || {};         // recipes[out] === false: ricetta spenta
  if (SHOPS[b.kind]) { b.sold = b.sold || 0; b.taxes = b.taxes || 0; }
  // destinazioni: lista di id (prima era una sola, "storage")
  if (!Array.isArray(b.dests)) b.dests = b.storage ? [b.storage] : [];
  delete b.storage;
  b.work = b.work || 0;
  return b;
}

// Trasformatori: edifici con ricette (fabbrica, panificio, caseificio, macello)
function isProcessor(b) { return !!RECIPES[b.kind]; }

// Magazzini: alimenti e merci, ognuno con le sue categorie (WAREHOUSE_CATS)
function isWarehouse(b) { return !!WAREHOUSE_CATS[b.kind]; }
function warehouseTakes(kind, g) { return WAREHOUSE_CATS[kind].includes(GOODS[g].cat); }

function addTo(map, g, q) { map[g] = (map[g] || 0) + q; if (map[g] <= 0) delete map[g]; }

// Ricette attive che usano la merce g
function usesInput(b, g) {
  return (RECIPES[b.kind] || []).some(r => b.recipes[r.out] !== false && r.in[g]);
}

// Materie prime usate dalle ricette attive
function activeInputs(b) {
  const set = new Set();
  for (const r of RECIPES[b.kind] || []) if (b.recipes[r.out] !== false) for (const g of Object.keys(r.in)) set.add(g);
  return [...set];
}

// Quanto spazio c'è per la merce g (senza contare quella già in viaggio verso l'edificio).
// Nei trasformatori ogni materia prima ha la sua parte del deposito: così una sola merce
// (es. la lana nella fabbrica tessile) non lo riempie tutto lasciando fuori le altre.
function freeFor(b, g) {
  const caps = CAPS[b.kind];
  if (!caps) return 0;
  if (isWarehouse(b)) return (!warehouseTakes(b.kind, g) || b.accept[g] === false) ? 0 : caps.store - sumOf(b.store);
  if (isProcessor(b)) {
    if (!usesInput(b, g)) return 0;
    const share = Math.floor(caps.input / activeInputs(b).length);
    return Math.min(caps.input - sumOf(b.input), share - (b.input[g] || 0));
  }
  if (SHOPS[b.kind]) return shopOf(g) === b.kind ? caps.store - sumOf(b.store) : 0;   // ogni negozio vende le sue merci
  if (POWER[b.kind] && POWER[b.kind].fuel === g) return caps.input - sumOf(b.input);      // centrale a carbone
  return 0;
}

// Spazio libero tolta la merce già in arrivo
function roomFor(b, g) {
  const f = freeFor(b, g);
  if (f <= 0) return 0;
  const exp = b.expect || {};
  if (isProcessor(b)) {   // la parte di g e il deposito intero, tolto quello in arrivo
    const caps = CAPS[b.kind];
    return Math.min(f - (exp[g] || 0), caps.input - sumOf(b.input) - sumOf(exp));
  }
  return f - sumOf(exp);
}

function receive(b, g, q) {
  if (isProcessor(b) || POWER[b.kind]) addTo(b.input, g, q);
  else addTo(b.store, g, q);
}

function buildingLabel(b) { return b.name ? '"' + b.name + '"' : buildingName(b).toLowerCase(); }

const VAN_STRIPES = { farm: '#3fa34d', warehouse: '#3f6fd9', goodsWarehouse: '#e07b39', textileMill: '#d94f8a', clothingFactory: '#8e5bd1', factory: '#e07b39', bakery: '#8a5a3a',
  dairy: '#8fc6e8', slaughterhouse: '#c83232', charcoalKiln: '#3a3a40', oilWell: '#2b2b33', port: '#2f6fa8', refinery: '#e8c23a', oilPlatform: '#d94141', forestry: '#2f6b2a', sawmill: '#c9a25a', furnitureFactory: '#8a5a3a', cowFarm: '#2b2b33', chickenFarm: '#e8c23a', pigFarm: '#e8899a', sheepFarm: '#c9c4b8' };

// Furgoni: b.van = quanti furgoni dell'edificio sono in giro. I magazzini ne hanno di più
// (portano materie prime alle fabbriche e prodotti ai negozi nello stesso momento).
const VANS = { warehouse: 3, goodsWarehouse: 3, port: 3 };
function vansBusy(b) { return (b.van || 0) >= (VANS[b.kind] || 1); }
function vanOut(b) { b.van = (b.van || 0) + 1; }
function vanHome(b) { b.van = Math.max(0, (b.van || 0) - 1); }

// Il furgone di "from" porta q unità di g a "to" e poi torna indietro
function sendGoods(from, to, g, q) {
  if (bySea(from, to)) return sendByShip(from, to, g, q);   // dal mare o da porto a porto: in nave (vehicles.js)
  const route = findRoute(accessTiles(from), accessTiles(to));
  if (!route) { from.status = TR('Nessuna strada verso {b}', { b: buildingLabel(to) }); from.retry = 3; return false; }
  // un furgone alla volta dalla stessa entrata: il prossimo parte quando il primo si è allontanato
  // (prima dal magazzino ne uscivano due insieme, uno sopra l'altro)
  const st = route[0];
  if (vehicles.some(o => o.kind === 'van' && o.tiles[0][0] === st[0] && o.tiles[0][1] === st[1] && o.seg < 6 &&
    Math.hypot(vehiclePos(o).mx - o.pts[0][0], vehiclePos(o).my - o.pts[0][1]) < 0.75)) return false;
  addTo(from.store, g, -q);
  to.expect = to.expect || {};
  addTo(to.expect, g, q);
  from.status = TR('Furgone in viaggio verso {b}', { b: buildingLabel(to) });
  const fid = from.id, tid = to.id, stripe = VAN_STRIPES[from.kind === 'livestock' ? from.animal : from.kind];
  vanOut(from);
  spawnVehicle({
    kind: 'van', from: fid, to: tid, good: g, load: q, stripe, tiles: route, pts: routePoints(route, false), speed: VAN_SPEED,
    arrive() {
      const t = game.buildings.get(tid), f = game.buildings.get(fid);
      if (t) { addTo(t.expect, g, -q); receive(t, g, Math.min(q, Math.max(0, freeFor(t, g)))); }
      if (!f) { if (t) leaveMap({ kind: 'van', stripe }, accessTiles(t)); return; }   // casa del furgone demolita: se ne va
      const back = t && findRoute(accessTiles(t), accessTiles(f));
      if (!back) { vanHome(f); f.status = ''; return; }
      f.status = TR('Furgone di ritorno');
      spawnVehicle({
        kind: 'van', from: fid, load: 0, stripe, tiles: back, pts: routePoints(back, false), speed: VAN_SPEED,
        arrive() { const ff = game.buildings.get(fid); if (ff) { vanHome(ff); ff.status = ''; } },
        cancel() { const ff = game.buildings.get(fid); if (ff) vanHome(ff); },
      });
    },
    cancel() {
      const t = game.buildings.get(tid), f = game.buildings.get(fid);
      if (t) addTo(t.expect, g, -q);
      if (f) { vanHome(f); addTo(f.store, g, q); }
    },
  });
  return true;
}

// Manda la merce pronta: prova le destinazioni scelte, in ordine, e manda la merce più
// abbondante che la destinazione accetta (con personale e posto libero)
// Un edificio accetta questo tipo di merce? (senza guardare se è pieno)
function takesGood(b, g) {
  if (isWarehouse(b)) return warehouseTakes(b.kind, g) && b.accept[g] !== false;
  if (isProcessor(b)) return usesInput(b, g);
  if (SHOPS[b.kind]) return shopOf(g) === b.kind;
  if (POWER[b.kind]) return POWER[b.kind].fuel === g;
  return false;
}

// ---------- Distribuzione per merce ----------
// b.split[g] = { idDestinazione: percentuale } (somma 100). Senza split la merce va a chi la
// accetta (come prima). Con lo split va solo alle destinazioni con percentuale > 0, in proporzione:
// b.sent[g][id] conta quanto è già partito (con un po' di oblio, così conta il periodo recente).
function splitOf(b, g) {
  const sp = b.split && b.split[g];
  if (!sp) return null;
  const ids = Object.keys(sp).map(Number).filter(id => sp[id] > 0 && b.dests.includes(id));
  return ids.length ? { sp, ids } : null;
}
// A quale destinazione tocca adesso la merce g (tra quelle che la possono ricevere ora)
function splitTarget(b, g, canNow) {
  const s = splitOf(b, g);
  if (!s) return null;
  const sent = (b.sent && b.sent[g]) || {};
  const tot = s.ids.reduce((a, id) => a + (sent[id] || 0), 0);
  let best = null, bd = -Infinity;
  for (const id of s.ids) {
    const to = game.buildings.get(id);
    if (!to || !canNow(to)) continue;
    const d = s.sp[id] / 100 * tot - (sent[id] || 0) + s.sp[id] / 1000;   // chi è più indietro; a parità la parte più grande
    if (d > bd) { best = id; bd = d; }
  }
  return best === null ? -1 : best;   // -1 = nessuna delle sue destinazioni può ricevere adesso
}
function noteSent(b, g, id, q) {
  b.sent = b.sent || {};
  const m = b.sent[g] = b.sent[g] || {};
  for (const k of Object.keys(m)) m[k] *= 0.9;
  m[id] = (m[id] || 0) + q;
}
// Pulizia quando cambia l'elenco delle destinazioni
function cleanSplit(b) {
  if (!b.split) return;
  for (const [g, sp] of Object.entries(b.split)) {
    const ws = b.dests.filter(id => { const w = game.buildings.get(id); return w && takesGood(w, g); });
    if (ws.length < 2) { delete b.split[g]; continue; }   // con una sola destinazione non c'è niente da dividere
    for (const id of Object.keys(sp)) if (!ws.includes(+id)) delete sp[id];
    for (const id of ws) if (sp[id] === undefined) sp[id] = 0;   // destinazione nuova: 0%, la si alza con +
    const tot = ws.reduce((t, id) => t + sp[id], 0);
    if (tot > 0 && tot !== 100) {   // tolta una destinazione: si riproporziona a 100
      let left = 100;
      ws.forEach((id, i) => { const v = i === ws.length - 1 ? left : Math.round(sp[id] * 100 / tot); sp[id] = v; left -= v; });
    }
  }
}

function pushGoods(b) {
  b.dests = b.dests.filter(id => game.buildings.has(id));
  if (vansBusy(b) || !b.dests.length || b.retry > 0) return;
  if (isWarehouse(b) && (b.van || 0) >= VANS[b.kind] - 1) return;   // un furgone resta per le richieste (pullGoods)
  if (sumOf(b.store) < VAN_MIN_LOAD) return;   // aspetta di avere un carico
  const loop = to => isWarehouse(b) && isWarehouse(to) && to.dests.includes(b.id);
  let why = '';
  for (const id of b.dests) {
    const to = game.buildings.get(id);
    // due magazzini che si mandano la merce a vicenda la farebbero girare all'infinito
    if (loop(to)) { why = why || TR('Due magazzini non possono mandarsi la merce a vicenda'); continue; }
    // a un negozio si porta quello che gli manca di più, agli altri la merce più abbondante
    let best = null, bq = 0, bs = -Infinity;
    for (const [g, q] of Object.entries(b.store)) {
      if (q <= 0 || roomFor(to, g) <= 0) continue;
      const t = splitTarget(b, g, w => !loop(w) && w.workers && roomFor(w, g) > 0);
      if (t !== null && t !== to.id) continue;   // questa merce ha la sua distribuzione: adesso tocca a un'altra destinazione
      const score = SHOPS[to.kind] ? -((to.store[g] || 0) + ((to.expect || {})[g] || 0)) * 1000 + q : q;
      if (score > bs) { best = g; bq = q; bs = score; }
    }
    if (!best) { why = why || TR('Le destinazioni non accettano questa merce o sono piene'); continue; }
    if (!to.workers) { why = TR('{b} non ha personale', { b: buildingLabel(to) }); continue; }
    const q = Math.min(bq, VAN_CAPACITY, roomFor(to, best));
    if (sendGoods(b, to, best, q)) { if (splitOf(b, best)) noteSent(b, best, to.id, q); return; }
    why = b.status;
  }
  b.status = why;
  if (why) b.retry = 3;
}

// Merci che servono a un edificio: materie prime delle ricette attive o merce da vendere
function wantedGoods(b) {
  // il supermercato lascia la precedenza a chi la merce la trasforma (es. la farina al panificio)
  if (SHOPS[b.kind]) return Object.keys(GOODS).filter(g => shopOf(g) === b.kind &&
    ![...game.buildings.values()].some(p => isProcessor(p) && p.workers && roomFor(p, g) >= VAN_MIN_LOAD));
  if (POWER[b.kind]) return POWER[b.kind].fuel ? [POWER[b.kind].fuel] : [];
  return Object.keys(GOODS).filter(g => usesInput(b, g));
}

// Chiede ai suoi magazzini (quelli che lo hanno come destinazione) quello che serve (un furgone alla volta, ogni qualche secondo)
function pullGoods(b) {
  if (b.pullTimer > 0 || !b.workers) return;
  b.pullTimer = 3;
  // prima quello che manca di più; a parità si va a turno (altrimenti un negozio vuoto
  // chiederebbe sempre le prime merci della lista, es. le verdure, e mai pasta o formaggi)
  const list = wantedGoods(b), n = list.length, turn = b.pullTurn = ((b.pullTurn || 0) + 1) % Math.max(1, n);
  const have = g => (b.input || b.store)[g] || 0;
  const order = g => (list.indexOf(g) - turn + n) % n;
  const wanted = list.filter(g => roomFor(b, g) >= VAN_MIN_LOAD).sort((x, y) => have(x) - have(y) || order(x) - order(y));
  if (!wanted.length) return;
  for (const w of game.buildings.values()) {
    // solo dai magazzini che hanno scelto questo edificio come destinazione (richiesta dell'utente:
    // prima il supermercato prendeva da qualsiasi magazzino anche se non era stato selezionato)
    if (!isWarehouse(w) || vansBusy(w) || !w.workers || !(w.dests || []).includes(b.id)) continue;
    const g = wanted.find(x => (w.store[x] || 0) > 0 && !(splitOf(w, x) && !(w.split[x][b.id] > 0)));
    if (!g) continue;
    if (sendGoods(w, b, g, Math.min(w.store[g], VAN_CAPACITY, roomFor(b, g)))) return;
  }
}

// ---------- Produzione ----------
// Il deposito della fattoria tiene sempre almeno due raccolti: così il raccolto non viene
// tagliato e più campi = più produzione, in proporzione (richiesta dell'utente)
function farmCap(f) { return Math.max(CAPS.farm.store, 2 * (f.fields || 0) * FARM.yieldPerField); }
function updateFarm(f, dt) {
  // cresce solo se ha campi, personale e posto in inventario; più personale = più veloce
  const staff = (f.workers || 0) / JOBS.farm * gridBoost();
  const cap = farmCap(f), crop = (f.fields || 0) * FARM.yieldPerField;
  f.full = sumOf(f.store) + crop > cap;   // non c'è posto per il prossimo raccolto intero: si aspetta
  if (f.fields > 0 && staff > 0 && !f.full) {
    const before = Math.floor(f.growth * 4);
    f.growth += dt / FARM.cycleSec * staff;
    if (f.growth >= 1) {
      f.growth = 0;
      addTo(f.store, f.crop, crop);
    }
    if (Math.floor(f.growth * 4) !== before) requestDraw();
  }
  pushGoods(f);
}

// Allevamenti: con il personale, ogni tanto producono latte, uova, lana e animali per il macello
// Alberi (tile di bosco) entro "radius" tile dall'azienda forestale
function treesNear(b, radius) {
  const d = BUILDINGS[b.kind];
  let n = 0;
  for (let y = b.ay - radius; y < b.ay + d.h + radius; y++)
    for (let x = b.ax - radius; x < b.ax + d.w + radius; x++)
      if (inMap(x, y) && game.map[y][x].type === T.FOREST) n++;
  return n;
}

// Giacimento di petrolio sotto il tile: 0 = niente, 1 = ricchissimo (sempre uguale per la mappa).
// In mare ce n'è di più che a terra.
function oilAt(x, y) {
  if (!inMap(x, y)) return 0;
  const v = fbm(x / 11, y / 11, (game.seed || 0) * 7 + 31);
  const thr = game.map[y][x].type === T.WATER ? 0.63 : 0.69;   // più alta = più raro (richiesta dell'utente: prima c'era petrolio quasi ovunque)
  return Math.max(0, Math.min(1, (v - thr) / 0.12));
}
function oilUnder(kind, ax, ay) {
  const fp = footprint(kind, ax, ay);
  return fp.reduce((a, p) => a + oilAt(p.x, p.y), 0) / fp.length;
}

// Personale: chi non prende lavoratori dalle case (la piattaforma) lavora sempre a pieno.
// Con la corrente della rete elettrica si lavora più in fretta.
function staffOf(b) { return JOBS[b.kind] ? (b.workers || 0) / JOBS[b.kind] : 1; }
function gridBoost() { return 1 + GRID.boost * ((game.grid && game.grid.cover) || 0); }

function updateLivestock(b, dt) {
  const L = natureOf(b), cap = CAPS[b.kind].store;
  let staff = staffOf(b) * gridBoost();
  if (L.oil) {   // pozzo e piattaforma: in proporzione al giacimento sotto
    if (b.oil === undefined) b.oil = oilUnder(b.kind, b.ax, b.ay);
    staff *= b.oil;
    b.noInput = !b.oil;
  }
  if (L.trees) {   // azienda forestale: più bosco vicino = più legno (fino a L.trees tile)
    if (!(b.treeTimer > 0)) { b.trees = treesNear(b, L.radius); b.treeTimer = 5; }
    b.treeTimer -= dt;
    staff *= Math.min(1, b.trees / L.trees);
    b.noInput = !b.trees;
  }
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
  const staff = staffOf(b) * gridBoost();
  const cap = CAPS[b.kind].store;
  b.full = sumOf(b.store) >= cap;
  if (staff > 0 && !b.full) {
    b.work += dt * staff / PRODUCE_TICK[b.kind];
    if (b.work >= 1) {
      b.work -= 1;
      let made = 0;
      // le ricette fanno a turno a partire da una diversa ogni ciclo: altrimenti le prime
      // (es. tavoli e sedie) userebbero sempre tutte le assi e letti e cucine non si farebbero mai
      const R = RECIPES[b.kind], start = (b.turn || 0) % R.length;
      b.turn = start + 1;
      for (let k = 0; k < R.length; k++) {
        const r = R[(start + k) % R.length];
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
  const S = SHOPS[b.kind];
  const staff = (b.workers || 0) / JOBS[b.kind];
  pullGoods(b);
  if (!staff) return;
  b.work += dt * staff / S.tick;
  if (b.work < 1) return;
  b.work -= 1;
  let customers = 0;
  for (const h of game.buildings.values())
    if (h.kind === 'house' && distToBuilding(b, h.ax, h.ay) <= S.radius) customers += h.residents || 0;
  b.customers = customers;
  let buys = Math.ceil(customers * S.buyRate);
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

// Centrali: producono energia per la rete (la centrale a carbone solo se ha carbone da bruciare)
function updatePower(b, dt) {
  const P = POWER[b.kind], staff = staffOf(b);
  let out = 0;
  if (staff > 0) {
    if (P.fuel) {
      b.burnLeft = (b.burnLeft || 0) - dt * staff;
      if (b.burnLeft <= 0 && (b.input[P.fuel] || 0) >= 1) { addTo(b.input, P.fuel, -1); b.burnLeft += P.burn; }
      b.burnLeft = Math.max(b.burnLeft, 0);
      if (b.burnLeft > 0) out = P.out * Math.min(1, staff);
      b.noInput = !b.burnLeft && !b.input[P.fuel];
    } else {
      const lvl = P.perLevel ? Math.min(P.max, P.out + P.perLevel * game.map[b.ay][b.ax].elev) : P.out;   // eolica: in alto c'è più vento
      out = lvl * Math.min(1, staff);
    }
  }
  b.power = Math.round(out);
  pullGoods(b);
  return out;
}

// Rete elettrica: produzione delle centrali contro consumo di abitanti e attività
function updateGrid(gen, dt) {
  let demand = 0;
  for (const b of game.buildings.values()) {
    if (b.kind === 'house') demand += (b.residents || 0) * GRID.perResident;
    else if (!POWER[b.kind]) demand += GRID.perBusiness;
  }
  const g = game.grid = game.grid || { billTimer: GRID.billEvery, bills: 0 };
  g.gen = Math.round(gen); g.demand = demand;
  g.cover = demand ? Math.min(1, gen / demand) : (gen > 0 ? 1 : 0);
  g.billTimer -= dt;
  if (g.billTimer <= 0) {   // bollette: ogni abitante con la corrente paga
    g.billTimer += GRID.billEvery;
    const pay = Math.round(game.population * GRID.bill * g.cover);
    if (pay > 0) { game.money += pay; g.bills += pay; updateHud(); }
  }
}

function economyUpdate(dt) {
  let gen = 0;
  for (const b of game.buildings.values()) {
    if (b.retry > 0) b.retry -= dt;
    if (b.pullTimer > 0) b.pullTimer -= dt;
    if (b.kind === 'farm') updateFarm(b, dt);
    else if (natureOf(b)) updateLivestock(b, dt);
    else if (isProcessor(b)) updateProducer(b, dt);
    else if (SHOPS[b.kind]) updateShop(b, dt);
    else if (POWER[b.kind]) gen += updatePower(b, dt);
    else if (isWarehouse(b)) {
      b.full = sumOf(b.store) >= CAPS[b.kind].store;
      if (b.workers) pushGoods(b);   // uscita: manda le scorte alle destinazioni scelte
    }
  }
  updateGrid(gen, dt);
}

// Stato da mostrare con un'icona sopra l'edificio (null = tutto bene)
function buildingStatus(b) {
  // casa senza strada accanto o non raggiungibile dalla strada principale
  if (b.kind === 'house') return (!accessTiles(b).length || b.unreachable) ? 'noRoad' : null;
  if (BUILDINGS[b.kind].water) return b.full ? 'full' : b.noInput ? 'noInput' : null;   // piattaforma: niente strada né lavoratori dalle case
  const need = JOBS[b.kind];
  if (need && (b.workers || 0) < need) return b.workers ? 'fewWorkers' : 'noWorkers';
  if (!accessTiles(b).length) return 'noRoad';
  if (b.full) return 'full';
  if (b.noInput) return 'noInput';
  if (b.empty) return 'empty';
  return null;
}
