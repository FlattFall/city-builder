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

// ---------- Statistiche della città (finestra Produzione, tasto C) ----------
// game.stats.cur = quello che succede nel minuto in corso (made = prodotto, used = usato dalle
// fabbriche e dalle centrali, sold = venduto nei negozi, money = entrate/uscite per voce);
// ogni STATS_WINDOW secondi diventa game.stats.last. total = da quando è iniziata la partita.
const STATS_WINDOW = 60;
function newStatsBucket() { return { made: {}, used: {}, sold: {}, money: {} }; }
function stats() {
  if (!game.stats) game.stats = { t: 0, cur: newStatsBucket(), last: null, total: { made: {}, sold: {} } };
  return game.stats;
}
function noteMade(g, q) { if (q > 0) { const S = stats(); addTo(S.cur.made, g, q); addTo(S.total.made, g, q); } }
function noteUsed(g, q) { if (q > 0) addTo(stats().cur.used, g, q); }
function noteSold(g, q) { if (q > 0) { const S = stats(); addTo(S.cur.sold, g, q); addTo(S.total.sold, g, q); } }
function noteMoney(k, m) { if (m) addTo(stats().cur.money, k, m); }
function statsTick(dt) {
  const S = stats();
  S.t += dt;
  if (S.t >= STATS_WINDOW) { S.t -= STATS_WINDOW; S.last = S.cur; S.cur = newStatsBucket(); }
}
// quanto al minuto: l'ultimo minuto intero, o il minuto in corso finché non ce n'è uno
function perMinute(kind, g) {
  const S = stats();
  if (S.last) return S.last[kind][g] || 0;
  return S.t > 5 ? (S.cur[kind][g] || 0) * STATS_WINDOW / S.t : 0;
}

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
// Furgoni per edificio (richiesta dell'utente: con la merce pronta ne devono uscire di più, uno dopo
// l'altro): magazzini e porto 4 (uno resta per le richieste), le altre attività 2. La piattaforma
// manda le navi. Escono distanziati (sendGoods) e il secondo solo se c'è un altro carico pronto.
// Ogni edificio parte con 2 furgoni e se ne possono comprare altri fino a 4 (richiesta dell'utente):
// b.vans = quanti ne ha (salvato con l'edificio). Nei magazzini uno resta per le richieste.
const VANS_START = 2, VANS_MAX = 4, VAN_PRICE = 400;
function vanCount(b) { return Math.min(VANS_MAX, b.vans || VANS_START); }
function vansBusy(b) { return (b.van || 0) >= vanCount(b); }
function buyVan(b) {
  if (vanCount(b) >= VANS_MAX) return { msg: TR('Ha già il massimo di {n} furgoni', { n: VANS_MAX }) };
  if (!spend(VAN_PRICE)) return { msg: TR('Fondi insufficienti') };
  b.vans = vanCount(b) + 1;
  game.dirty = true;
  updateHud();
  return { ok: true };
}
function vanOut(b) { b.van = (b.van || 0) + 1; }
function vanHome(b) { b.van = Math.max(0, (b.van || 0) - 1); }

// Il furgone di "from" porta q unità di g a "to" e poi torna indietro
// extra = altre merci nello stesso furgone ({ merce: quantità }): se la destinazione le accetta tutte,
// il furgone parte pieno con merci diverse (richiesta dell'utente: massimizzare il viaggio)
function sendGoods(from, to, g, q, extra) {
  if (bySea(from, to)) return sendByShip(from, to, g, q);   // dal mare o da porto a porto: in nave (vehicles.js)
  const route = findRoute(accessTiles(from), accessTiles(to));
  if (!route) { from.status = TR('Nessuna strada verso {b}', { b: buildingLabel(to) }); from.retry = 3; return false; }
  // un furgone alla volta dalla stessa entrata: il prossimo parte quando il primo si è allontanato
  // (prima dal magazzino ne uscivano due insieme, uno sopra l'altro)
  const st = route[0];
  if (vehicles.some(o => o.kind === 'van' && o.tiles[0][0] === st[0] && o.tiles[0][1] === st[1] && o.seg < 6 &&
    Math.hypot(vehiclePos(o).mx - o.pts[0][0], vehiclePos(o).my - o.pts[0][1]) < 0.75)) return false;
  const cargo = { [g]: q };
  for (const [g2, q2] of Object.entries(extra || {})) if (q2 > 0 && g2 !== g) cargo[g2] = q2;
  to.expect = to.expect || {};
  for (const [g2, q2] of Object.entries(cargo)) { addTo(from.store, g2, -q2); addTo(to.expect, g2, q2); }
  const total = sumOf(cargo);
  from.status = TR('Furgone in viaggio verso {b}', { b: buildingLabel(to) });
  const fid = from.id, tid = to.id, stripe = VAN_STRIPES[from.kind === 'livestock' ? from.animal : from.kind];
  vanOut(from);
  spawnVehicle({
    kind: 'van', from: fid, to: tid, good: g, load: total, cargo, stripe, tiles: route, pts: routePoints(route, false), speed: VAN_SPEED,
    arrive() {
      const t = game.buildings.get(tid), f = game.buildings.get(fid);
      if (t) for (const [g2, q2] of Object.entries(cargo)) { addTo(t.expect, g2, -q2); receive(t, g2, Math.min(q2, Math.max(0, freeFor(t, g2)))); }
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
      for (const [g2, q2] of Object.entries(cargo)) { if (t) addTo(t.expect, g2, -q2); if (f) addTo(f.store, g2, q2); }
      if (f) vanHome(f);
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
  if (isWarehouse(b) && vanCount(b) > 1 && (b.van || 0) >= vanCount(b) - 1) return;   // un furgone resta per le richieste (pullGoods)
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
    // posto libero nel furgone: altre merci che questa destinazione accetta (non quelle che ora toccano a un'altra)
    const extra = {};
    let left = VAN_CAPACITY - q;
    if (!bySea(b, to)) for (const [g, qq] of Object.entries(b.store)) {
      if (left <= 0) break;
      if (g === best || qq <= 0 || roomFor(to, g) <= 0) continue;
      // a un negozio non si aggiunge quello che una fabbrica tra le destinazioni trasforma (es. la farina al panificio)
      if (SHOPS[to.kind] && b.dests.some(id => { const p = game.buildings.get(id); return p && isProcessor(p) && usesInput(p, g); })) continue;
      const t = splitTarget(b, g, w => !loop(w) && w.workers && roomFor(w, g) > 0);
      if (t !== null && t !== to.id) continue;
      const n = Math.min(qq, left, roomFor(to, g));
      if (n > 0) { extra[g] = n; left -= n; }
    }
    if (sendGoods(b, to, best, q, extra)) {
      if (splitOf(b, best)) noteSent(b, best, to.id, q);
      for (const [g, n] of Object.entries(extra)) if (splitOf(b, g)) noteSent(b, g, to.id, n);
      return;
    }
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
  const staff = (f.workers || 0) / JOBS.farm * gridBoost(f) * upBoost(f) * waterFactor(f) * busBoost(f);
  const cap = farmCap(f), crop = (f.fields || 0) * FARM.yieldPerField;
  f.full = sumOf(f.store) + crop > cap;   // non c'è posto per il prossimo raccolto intero: si aspetta
  if (f.fields > 0 && staff > 0 && !f.full) {
    const before = Math.floor(f.growth * 4);
    f.growth += dt / FARM.cycleSec * staff;
    if (f.growth >= 1) {
      f.growth = 0;
      addTo(f.store, f.crop, crop); noteMade(f.crop, crop);
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
function canUpgrade(b) { return b.kind === 'farm' || !!natureOf(b) || isProcessor(b); }
function upBoost(b) { return UPGRADE.speed[Math.min(UPGRADE.max, (b && b.level) || 0)]; }
function upgradeCost(b) { const l = b.level || 0; return l >= UPGRADE.max ? 0 : Math.round(BUILDINGS[b.kind].cost * UPGRADE.cost[l] / 10) * 10; }
function buyUpgrade(b) {
  if (!canUpgrade(b)) return { msg: TR('Questo edificio non si può migliorare') };
  if ((b.level || 0) >= UPGRADE.max) return { msg: TR('Già al massimo dei miglioramenti') };
  if (!spend(upgradeCost(b))) return { msg: TR('Fondi insufficienti') };
  b.level = (b.level || 0) + 1;
  game.dirty = true; updateHud(); requestDraw();
  return { ok: true, msg: TR('{b}: miglioramento {n} di {m}', { b: buildingLabel(b), n: b.level, m: UPGRADE.max }) };
}
function gridBoost(b) { return 1 + GRID.boost * ((b && b.powered) || 0); }   // con la corrente si lavora più in fretta

function updateLivestock(b, dt) {
  const L = natureOf(b), cap = CAPS[b.kind].store;
  let staff = staffOf(b) * gridBoost(b) * upBoost(b) * waterFactor(b) * busBoost(b);
  if (L.oil) {   // pozzo e piattaforma: in proporzione al giacimento sotto
    if (b.oil === undefined) b.oil = oilUnder(b.kind, b.ax, b.ay);
    staff *= b.oil;
    b.noInput = !b.oil;
  }
  if (L.trees) {   // azienda forestale: più bosco nella zona = più legno (100% con L.trees tile, fino a +50%)
    if (!(b.treeTimer > 0)) { b.trees = treesNear(b, L.radius); b.treeTimer = 5; }
    b.treeTimer -= dt;
    staff *= forestRatio(b, L);
    b.noInput = !b.trees;
  }
  b.full = sumOf(b.store) >= cap;
  if (L.trees) forestTick(b, L, dt, staff > 0 && !b.full);   // boscaioli che tagliano gli alberi (forest.js)
  if (staff > 0 && !b.full) {
    b.growth = (b.growth || 0) + dt / L.every * staff;
    if (b.growth >= 1) {
      b.growth = 0;
      for (const [g, q] of Object.entries(L.out)) { const n = Math.min(q, cap - sumOf(b.store)); addTo(b.store, g, n); noteMade(g, n); }
    }
  }
  pushGoods(b);
}

// Trasformatori: a ogni ciclo ogni ricetta attiva con le materie prime fa 1 prodotto
function updateProducer(b, dt) {
  const staff = staffOf(b) * gridBoost(b) * upBoost(b) * waterFactor(b) * busBoost(b);
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
        for (const [g, n] of Object.entries(r.in)) { addTo(b.input, g, -n); noteUsed(g, n); }
        addTo(b.store, r.out, 1); noteMade(r.out, 1);
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
  const staff = (b.workers || 0) / JOBS[b.kind] * waterFactor(b) * busBoost(b);
  pullGoods(b);
  if (!staff) return;
  b.work += dt * staff / S.tick;
  if (b.work < 1) return;
  b.work -= 1;
  sellToCustomers(b, S);
}
// Clienti = abitanti entro S.radius; ne compra S.buyRate per volta; solo le merci che `ok` accetta
function sellToCustomers(b, S, ok) {
  b.sold = b.sold || 0; b.taxes = b.taxes || 0;
  let customers = 0;
  for (const h of game.buildings.values())
    if (h.kind === 'house' && distToBuilding(b, h.ax, h.ay) <= S.radius) customers += h.residents || 0;
  b.customers = customers;
  let buys = Math.ceil(customers * S.buyRate);
  const goods = Object.keys(b.store).filter(g => !ok || ok(g));
  b.empty = customers > 0 && !goods.length;
  let i = b.cursor || 0;
  while (buys > 0 && sumOf(b.store) > 0) {
    const g = goods[i++ % goods.length];
    if (!b.store[g]) continue;
    addTo(b.store, g, -1);
    const tax = Math.max(1, Math.round(GOODS[g].price * TAX_RATE));
    game.money += tax; b.taxes += tax; b.sold++; buys--; noteSold(g, 1); noteMoney('taxes', tax);
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
      if (b.burnLeft <= 0 && (b.input[P.fuel] || 0) >= 1) { addTo(b.input, P.fuel, -1); noteUsed(P.fuel, 1); b.burnLeft += P.burn; }
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

// ---------- Corrente: bassa e alta tensione (richiesta dell'utente) ----------
// BASSA tensione: sotto ogni strada c'è il cavo (strade vicine = stesso cavo) e i pali di legno
// (entro ELEC.poleRange tra loro) la portano dove le strade non arrivano. Case, attività e centrali
// sono attaccate se hanno una strada accanto o un palo entro ELEC.poleReach (`b.lv` = pezzo di rete).
// Le centrali (solare, eolica, carbone) danno corrente a bassa tensione: bastano per la città vicina.
// ALTA tensione: i tralicci (entro ELEC.pylonRange tra loro, `b.hv`); un traliccio sul bordo della
// mappa porta fuori. La SOTTOSTAZIONE (strada + lavoratori) collega un pezzo di bassa tensione a un
// traliccio entro ELEC.linkRange: così si porta corrente da lontano e si compra/vende fuori mappa.
// La forma delle reti si ricalcola quando cambia qualcosa (game.elecVer) e ogni 2 s;
// i "sistemi" (bassa + alta unite dalle sottostazioni che lavorano) a ogni passo.
function isConsumer(b) { const d = BUILDINGS[b.kind]; return !d.infra && !POWER[b.kind] && !d.water && b.kind !== 'substation'; }
function consumerDemand(b) { return b.kind === 'house' ? (b.residents || 0) * GRID.perResident : GRID.perBusiness; }
function elecChanged() { if (typeof game !== 'undefined') game.elecVer = (game.elecVer || 0) + 1; }
function lvTile(x, y) {   // il tile porta la bassa tensione: strade (non binari) e pali
  const t = game.map[y][x];
  return cablePath(t) || (t.building && t.building.kind === 'pole');
}
// strade con i cavi sotto: asfalto, senso unico, autostrada. Le strade di terra e i binari no (richiesta
// dell'utente): chi sta solo su una strada di terra va collegato con i pali della luce
function cablePath(t) { return !!t.path && t.path !== 'rail' && t.path !== 'dirt';
}
// albero più corto tra punti vicini (per i fili): [[a, b], ...] e unione nel union-find
function wireTree(list, range, unite) {
  const edges = [], R2 = range * range, out = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j], d2 = (a.ax - b.ax) ** 2 + (a.ay - b.ay) ** 2;
    if (d2 <= R2) edges.push([d2, a, b]);
  }
  edges.sort((p, q) => p[0] - q[0]);
  for (const [, a, b] of edges) if (unite(a, b)) out.push([a, b]);
  return out;
}
function buildElecNets() {
  const N = game.size, all = [...game.buildings.values()];
  const pylons = all.filter(b => b.kind === 'pylon'), poles = all.filter(b => b.kind === 'pole');
  // --- bassa tensione: union-find sui tile
  const par = new Map();
  const find = k => { let r = k; while (par.has(r) && par.get(r) !== r) r = par.get(r); par.set(k, r); return r; };
  const unite = (a, b) => { const ra = find(a), rb = find(b); if (ra === rb) return false; par.set(ra, rb); return true; };
  for (const k of game.pathKeys) {
    const x = k % N, y = (k - x) / N;
    if (!lvTile(x, y)) continue;
    find(k);
    if (x + 1 < N && lvTile(x + 1, y)) unite(k, k + 1);
    if (y + 1 < N && lvTile(x, y + 1)) unite(k, k + N);
  }
  for (const br of game.bridges.values()) {   // ponti e tunnel: il cavo passa da una testa all'altra
    const [x1, y1] = bridgeTile(br, br.n);
    if (lvTile(br.x0, br.y0) && lvTile(x1, y1)) unite(br.y0 * N + br.x0, y1 * N + x1);
  }
  const key = b => b.ay * N + b.ax;
  for (const p of poles) find(key(p));
  const lvWires = wireTree(poles, ELEC.poleRange, (a, b) => unite(key(a), key(b)));
  for (const p of poles) {   // traversa di traverso rispetto ai fili
    let sx = 0, sy = 0;
    for (const [a, b] of lvWires) if (a === p || b === p) { sx += Math.abs(a.ax - b.ax); sy += Math.abs(a.ay - b.ay); }
    p.armV = sx >= sy;
  }
  const lvLinks = [];   // palo -> strada vicina / edificio attaccato al palo
  for (const p of poles) {   // il palo prende il cavo della strada vicina
    let best = null, bd = Infinity;
    for (let dy = -ELEC.poleReach; dy <= ELEC.poleReach; dy++) for (let dx = -ELEC.poleReach; dx <= ELEC.poleReach; dx++) {
      const x = p.ax + dx, y = p.ay + dy;
      if (!inMap(x, y) || !cablePath(game.map[y][x])) continue;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = [x, y]; }
    }
    p.feed = null; p._road = best; p._bd = bd;
  }
  // il palo scende sotto terra fino al cavo della strada (niente filo in mezzo alla strada: all'utente non piaceva).
  // Il pozzetto lo ha UN solo palo per fila di pali e per strada: il più vicino (richiesta dell'utente)
  const feeder = new Map();
  for (const p of poles) {
    if (!p._road) continue;
    const k = find(key(p)) + '|' + find(p._road[1] * N + p._road[0]);
    const cur = feeder.get(k);
    if (!cur || p._bd < cur._bd) feeder.set(k, p);
  }
  for (const p of feeder.values()) p.feed = [Math.sign(p._road[0] - p.ax), Math.sign(p._road[1] - p.ay)];
  for (const p of poles) if (p._road) unite(key(p), p._road[1] * N + p._road[0]);
  // edifici: strada accanto (cavo sotto la strada) o palo vicino
  for (const b of all) {
    b.lv = null;
    if (b.kind === 'pylon' || b.kind === 'pole' || BUILDINGS[b.kind].water) continue;
    const d = BUILDINGS[b.kind];
    for (let y = b.ay - 1; y <= b.ay + d.h && b.lv == null; y++) for (let x = b.ax - 1; x <= b.ax + d.w; x++) {
      const side = (y === b.ay - 1 || y === b.ay + d.h) !== (x === b.ax - 1 || x === b.ax + d.w);   // solo i 4 lati, non gli angoli
      if (!side || !inMap(x, y) || !cablePath(game.map[y][x])) continue;
      b.lv = find(y * N + x); break;
    }
    if (b.lv == null) {
      let best = null, bd = Infinity;
      for (const p of poles) { const dd = distToBuilding(b, p.ax, p.ay); if (dd <= ELEC.poleReach && dd < bd) { best = p; bd = dd; } }
      if (best) { b.lv = find(key(best)); lvLinks.push([best, b]); }
    }
  }
  for (const b of all) if (b.lv != null) b.lv = find(b.lv);   // radici finali (le unioni dopo possono averle cambiate)
  // --- alta tensione: tralicci
  const hpar = new Map(pylons.map(p => [p.id, p.id]));
  const hfind = i => { while (hpar.get(i) !== i) { hpar.set(i, hpar.get(hpar.get(i))); i = hpar.get(i); } return i; };
  const wires = wireTree(pylons, ELEC.pylonRange, (a, b) => { const ra = hfind(a.id), rb = hfind(b.id); if (ra === rb) return false; hpar.set(ra, rb); return true; });
  for (const p of pylons) {   // le mensole di traverso rispetto ai fili
    let sx = 0, sy = 0;
    for (const [a, b] of wires) if (a === p || b === p) { sx += Math.abs(a.ax - b.ax); sy += Math.abs(a.ay - b.ay); }
    p.armV = sx >= sy;
  }
  const hvNets = new Map();
  for (const p of pylons) {
    p.hv = hfind(p.id);
    if (!hvNets.has(p.hv)) hvNets.set(p.hv, { pylons: 0, outside: false });
    const n = hvNets.get(p.hv); n.pylons++;
    if (p.ax === 0 || p.ay === 0 || p.ax === N - 1 || p.ay === N - 1) n.outside = true;
  }
  const links = [];   // traliccio -> sottostazione
  for (const s of all) {
    if (s.kind !== 'substation') continue;
    s.hv = null;
    let best = null, bd = Infinity;
    for (const p of pylons) { const d = distToBuilding(s, p.ax, p.ay); if (d <= ELEC.linkRange && d < bd) { best = p; bd = d; } }
    if (best) { s.hv = best.hv; links.push([best, s]); }
  }
  game.elec = { ver: game.elecVer || 0, hvNets, wires, links, lvWires, lvLinks, systems: new Map(), timer: 0 };
}
// sottostazione che lavora: attaccata ai due lati, alta (traliccio) e bassa tensione (strada accanto o palo
// della luce vicino). Niente lavoratori e niente strada obbligatoria: va da sola (richiesta dell'utente)
function substationWorks(s) { return s.lv != null && s.hv != null; }
function systemOf(b) {
  if (!game.elec) return null;
  const k = b.kind === 'pylon' ? 'H' + b.hv : b.lv != null ? 'L' + b.lv : b.hv != null ? 'H' + b.hv : null;
  return k ? game.elec.systems.get(game.elec.sysOf.get(k)) || null : null;
}
function updateGrid(gen, dt) {
  if (!game.elec || game.elec.ver !== (game.elecVer || 0) || (game.elec.timer -= dt) <= 0) {   // ogni 2 s (case e strade nuove) o se cambia la rete
    buildElecNets(); game.elec.timer = 2;
  }
  const E = game.elec, par = new Map();
  const find = k => { let r = k; while (par.has(r) && par.get(r) !== r) r = par.get(r); par.set(k, r); return r; };
  const all = [...game.buildings.values()];
  for (const b of all) {
    if (b.lv != null) find('L' + b.lv);
    if (b.kind === 'substation') b.works = substationWorks(b);
    if (b.kind === 'substation' && b.works) { const a = find('L' + b.lv), h = find('H' + b.hv); if (a !== h) par.set(a, h); }
  }
  for (const k of E.hvNets.keys()) find('H' + k);
  const systems = new Map(), sysOf = new Map();
  const sys = r => { if (!systems.has(r)) systems.set(r, { id: r, gen: 0, demand: 0, cover: 0, outside: false, imported: 0, exported: 0, plants: 0, subs: 0, pylons: 0, consumers: 0 }); return systems.get(r); };
  for (const k of par.keys()) { const r = find(k); sysOf.set(k, r); sys(r); }
  for (const [k, n] of E.hvNets) { const s = sys(sysOf.get('H' + k)); s.pylons += n.pylons; if (n.outside) s.outside = true; }
  E.systems = systems; E.sysOf = sysOf;
  for (const b of all) {
    if (b.lv == null) continue;
    const s = systems.get(sysOf.get('L' + b.lv));
    if (POWER[b.kind]) { s.gen += b.power || 0; s.plants++; }
    else if (b.kind === 'substation') { if (b.works) s.subs++; }
    else if (isConsumer(b)) { s.demand += consumerDemand(b); s.consumers++; }
  }
  let tg = 0, td = 0, covered = 0, imported = 0, exported = 0;
  for (const s of systems.values()) {
    s.cover = !s.demand ? 0 : s.outside ? 1 : Math.min(1, s.gen / s.demand);
    s.imported = s.outside ? Math.max(0, s.demand - s.gen) : 0;
    s.exported = s.outside ? Math.max(0, s.gen - s.demand) : 0;
    tg += s.gen; covered += s.demand * s.cover; imported += s.imported; exported += s.exported;
  }
  let allDemand = 0;
  for (const b of all) if (isConsumer(b)) {
    const s = b.lv != null ? systems.get(sysOf.get('L' + b.lv)) : null;
    b.powered = s ? s.cover : 0;
    allDemand += consumerDemand(b);
  }
  td = allDemand;
  const g = game.grid = game.grid || { billTimer: GRID.billEvery, bills: 0 };
  g.gen = Math.round(tg); g.demand = td; g.imported = Math.round(imported); g.exported = Math.round(exported);
  g.cover = td ? covered / td : 0;
  g.billTimer -= dt;
  if (g.billTimer <= 0) {   // bollette: ogni abitante con la corrente paga; fuori mappa si compra e si vende
    g.billTimer += GRID.billEvery;
    let pay = 0;
    for (const b of all) if (b.kind === 'house') pay += (b.residents || 0) * GRID.bill * (b.powered || 0);
    pay = Math.round(pay);
    const cost = Math.round(imported * ELEC.importPrice), sold = Math.round(exported * ELEC.exportPrice);
    g.lastBills = pay; g.lastImport = cost; g.lastExport = sold;
    if (pay || cost || sold) {
      game.money += pay - cost + sold; g.bills += pay;
      noteMoney('bills', pay); noteMoney('import', -cost); noteMoney('export', sold);
      g.importCost = (g.importCost || 0) + cost; g.exportIncome = (g.exportIncome || 0) + sold; updateHud();
    }
  }
}

function economyUpdate(dt) {
  let gen = 0;
  for (const b of game.buildings.values()) {
    if (b.retry > 0) b.retry -= dt;
    if (b.pullTimer > 0) b.pullTimer -= dt;
    if (b.kind === 'farm') updateFarm(b, dt);
    else if (natureOf(b)) updateLivestock(b, dt);
    else if (isProcessor(b)) {
      updateProducer(b, dt);
      const C = COUNTER[b.kind];   // panificio: vende anche al banco
      if (C && b.workers) {
        b.counterWork = (b.counterWork || 0) + dt * Math.min(1, b.workers / JOBS[b.kind]) / C.tick;
        if (b.counterWork >= 1) { b.counterWork -= 1; sellToCustomers(b, C, g => GOODS[g].cat === C.cat); b.empty = false; }
      }
    }
    else if (SHOPS[b.kind]) updateShop(b, dt);
    else if (POWER[b.kind]) gen += updatePower(b, dt);
    else if (isWarehouse(b)) {
      b.full = sumOf(b.store) >= CAPS[b.kind].store;
      if (b.workers) pushGoods(b);   // uscita: manda le scorte alle destinazioni scelte
    }
  }
  updateGrid(gen, dt);
  updateWater(dt);
  busTick(dt);
  statsTick(dt);
}

// Stato da mostrare con un'icona sopra l'edificio (null = tutto bene)
// Icona "senza corrente" (richiesta dell'utente, come quella della strada): sempre, anche quando non
// c'è ancora nessuna rete, così il giocatore vede subito che case e attività vanno collegate.
function gridExists() { const E = game.elec; return !!E && (E.hvNets.size > 0 || E.lvWires.length > 0 || (game.grid && game.grid.gen > 0)); }
function powerStatus(b) {
  if (POWER[b.kind]) return b.lv == null ? 'noPower' : null;   // centrale non attaccata a strade o pali
  if (b.kind === 'substation') return b.lv == null || b.hv == null ? 'noPower' : null;
  if (isConsumer(b)) return (b.powered || 0) < 0.5 ? 'noPower' : null;
  return null;
}
function buildingStatus(b) {
  // casa senza strada accanto o non raggiungibile dalla strada principale
  if (b.kind === 'house') return (!accessTiles(b).length || b.unreachable) ? 'noRoad' : waterStatus(b) || powerStatus(b);
  if (b.kind === 'sewage') return waterStatus(b);
  if (b.kind === 'busStop') return accessTiles(b).length ? (b.depot ? null : 'noInput') : 'noRoad';
  if (BUILDINGS[b.kind].water) return b.full ? 'full' : b.noInput ? 'noInput' : null;   // piattaforma: niente strada né lavoratori dalle case
  if (b.kind === 'pylon' || b.kind === 'pole') return null;   // tralicci e pali: niente strada né lavoratori
  if (b.kind === 'substation') return powerStatus(b);   // niente strada né lavoratori: solo i collegamenti
  const need = JOBS[b.kind];
  if (need && (b.workers || 0) < need) return b.workers ? 'fewWorkers' : 'noWorkers';
  if (!accessTiles(b).length) return 'noRoad';
  if (b.full) return 'full';
  if (b.noInput) return 'noInput';
  if (b.empty) return 'empty';
  return waterStatus(b) || powerStatus(b);   // per ultime: senza acqua e corrente si lavora lo stesso (solo più piano)
}
