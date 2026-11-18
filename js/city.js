// ---------- Municipio, felicità, ladri e polizia (richiesta dell'utente) ----------
// MUNICIPIO (uno per città): dal suo pannello si regolano le tasse sulle vendite (game.taxRate, da TAX.min a
// TAX.max). Più tasse = più soldi dai negozi ma gente meno felice.
// FELICITÀ: ogni casa ha un valore 0..100 (h.happy) fatto di pezzi (h.happyWhy): acqua, corrente, lavoro,
// negozi vicini, sicurezza (polizia), furti recenti, tasse, fabbriche vicine, municipio, bus. La città = media
// pesata sugli abitanti (game.happy, nella barra in alto). Gente felice compra di più; sotto HAPPY.noArrive
// non arriva nessuno in quella casa, sotto HAPPY.leave la gente se ne va (in auto, fuori dalla mappa).
// Città piccola (meno di HAPPY.grace abitanti): si arriva e si resta comunque, così si comincia con le case.
// LADRI: ogni tanto (più spesso nelle città grandi) un ladro colpisce una casa o un negozio: si vede scappare
// (omino a righe con il sacco) e sopra l'edificio compare l'icona del furto. Senza polizia vicina ruba i soldi
// e la felicità del quartiere scende; con una stazione di polizia entro POLICE.radius i furti sono molto più
// rari, l'auto della polizia (sirena blu e rossa) arriva e il ladro viene arrestato.
const TAX = { min: 0.2, max: 0.9, step: 0.05 };
const HAPPY = { base: 50, grace: 40, noArrive: 25, leave: 20, unhappy: 30, every: 2, leaveChance: 0.06, noise: 3 };
const POLICE = { radius: 16, carSpeed: 1.9 };
const CRIME = { every: 14, minPop: 24, perResident: 0.0035, max: 0.75, policeCut: 0.3, stealMin: 80, stealPer: 2, stealMax: 1500, memory: 90, radius: 7, icon: 14 };
const HAPPY_LABELS = { water: 'Acqua', power: 'Corrente', jobs: 'Lavoro', shops: 'Negozi vicini', safety: 'Sicurezza', crime: 'Furti recenti',
  taxes: 'Tasse', noise: 'Fabbriche vicine', hall: 'Municipio', bus: 'Bus',
  school: 'Scuola elementare', highSchool: 'Scuola superiore', university: 'Università' };
// SCUOLE (richiesta dell'utente): una casa "va" a una scuola se sta entro `radius` tile o se è vicina a una
// fermata dello stesso bus (busLinked). Ogni scuola ha `seats` posti, contati in abitanti delle case servite
// (meno maestri = meno posti); le case più vicine prendono il posto per prime. Chi ci va: +`happy` felicità.
const SCHOOLS = {
  school:     { seats: 80,  radius: 10, happy: 6 },
  highSchool: { seats: 150, radius: 14, happy: 5 },
  university: { seats: 400, radius: 24, happy: 7 },
};

function happyColor(v) { return v >= 65 ? '#a7f070' : v >= 40 ? '#ffd966' : '#ff7b6b'; }
function cityState() {
  if (!game.crime || game.crime.map !== game.map) game.crime = { map: game.map, thefts: 0, caught: 0, stolen: 0, t: CRIME.every };
  return game.crime;
}
function townHallOf() { for (const b of game.buildings.values()) if (b.kind === 'townHall') return b; return null; }
function isNoisy(b) { return isProcessor(b) || b.kind === 'coalPlant' || b.kind === 'refinery' || b.kind === 'port' || b.kind === 'oilWell'; }
// stazione di polizia che protegge (x, y): con agenti e entro il raggio
function policeFor(b) {
  let best = null, bd = Infinity;
  for (const p of game.buildings.values()) {
    if (p.kind !== 'police' || !(p.workers > 0)) continue;
    const d = distToBuilding(p, b.ax, b.ay);
    if (d <= POLICE.radius && d < bd) { bd = d; best = p; }
  }
  return best;
}

// ---- felicità ----
function houseHappiness(h, ctx) {
  const why = {};
  if (WATER.required) why.water = (h.watered || 0) >= 0.5 ? 8 : -12;
  why.power = (h.powered || 0) >= 0.5 ? 8 : -12;
  if (h.residents > 0) why.jobs = Math.round(((h.employed || 0) / h.residents - 0.5) * 20);
  let shops = 0;
  for (const s of ctx.shops) if (distToBuilding(s, h.ax, h.ay) <= SHOPS[s.kind].radius) shops |= 1 << Object.keys(SHOPS).indexOf(s.kind);
  const kinds = shops ? shops.toString(2).split('1').length - 1 : 0;
  why.shops = kinds ? 6 + 2 * Math.min(3, kinds - 1) : -10;
  const cop = ctx.police.some(p => distToBuilding(p, h.ax, h.ay) <= POLICE.radius);
  why.safety = cop ? 10 : game.population < CRIME.minPop ? 0 : -Math.min(18, 4 + Math.round(game.population / 50));
  if (h.crimeT > 0) why.crime = -Math.round(15 * h.crimeT / CRIME.memory);
  why.taxes = Math.round((TAX_RATE - taxRate()) * 60);
  if (ctx.noisy.some(n => distToBuilding(n, h.ax, h.ay) <= HAPPY.noise)) why.noise = -10;
  if (ctx.hall) why.hall = 5;
  if (game.bus && game.bus.near && game.bus.near.has(h.id)) why.bus = 4;
  if (h.edu) for (const k in SCHOOLS) if (h.edu[k]) why[k] = SCHOOLS[k].happy;
  let v = HAPPY.base;
  for (const k in why) v += why[k];
  h.happyWhy = why;
  h.happy = Math.max(0, Math.min(100, v));
}
function happyBlocksArrival(h) { return game.population >= HAPPY.grace && h.happy != null && h.happy < HAPPY.noArrive; }
// ---- scuole ----
function schoolSeats(s) { return Math.floor(SCHOOLS[s.kind].seats * Math.min(1, (s.workers || 0) / JOBS[s.kind])); }
function schoolReach(s, h) { return distToBuilding(s, h.ax, h.ay) <= SCHOOLS[s.kind].radius || (typeof busLinked === 'function' && busLinked(h, s)); }
function updateSchools(all) {
  const houses = all.filter(b => b.kind === 'house');
  for (const h of houses) h.edu = null;
  for (const kind in SCHOOLS) {
    const schools = all.filter(b => b.kind === kind);
    for (const s of schools) { s.pupils = 0; s.homes = 0; s.free = schoolSeats(s); }
    if (!schools.length) continue;
    // le case più vicine prima, ognuna alla scuola più vicina che ha ancora posto
    const near = h => Math.min(...schools.map(s => distToBuilding(s, h.ax, h.ay)));
    const list = houses.filter(h => h.residents > 0).map(h => [near(h), h]).sort((a, b) => a[0] - b[0]);
    for (const [, h] of list) {
      let best = null, bd = Infinity;
      for (const s of schools) {
        if (s.free < h.residents || !schoolReach(s, h)) continue;
        const d = distToBuilding(s, h.ax, h.ay);
        if (d < bd) { bd = d; best = s; }
      }
      if (!best) continue;
      best.free -= h.residents; best.pupils += h.residents; best.homes++;
      (h.edu || (h.edu = {}))[kind] = best.id;
    }
  }
}
function updateHappiness() {
  const all = [...game.buildings.values()];
  updateSchools(all);
  const ctx = {
    shops: all.filter(b => SHOPS[b.kind] && b.workers > 0),
    police: all.filter(b => b.kind === 'police' && b.workers > 0),
    noisy: all.filter(isNoisy),
    hall: all.some(b => b.kind === 'townHall' && b.workers > 0),
  };
  let sum = 0, n = 0;
  for (const h of all) if (h.kind === 'house') {
    houseHappiness(h, ctx);
    sum += h.happy * (h.residents || 0); n += h.residents || 0;
    // gente infelice: ogni tanto una famiglia se ne va (in auto, fuori dalla mappa)
    if (game.population >= HAPPY.grace && h.happy < HAPPY.leave && h.residents > 0 && Math.random() < HAPPY.leaveChance) {
      h.residents--; game.population--;
      const starts = accessTiles(h);
      if (starts.length) leaveMap({ kind: 'car', color: CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)] }, starts);
      updateHud();
    }
  }
  game.happy = n ? sum / n : null;
  updateHud();
}
// i negozi vendono di più quando la gente è felice (da 0.6 a 1.4 volte)
function happyBuy() { return game.happy == null ? 1 : 0.6 + 0.8 * game.happy / 100; }
// media dei pezzi della felicità su tutta la città (per il municipio)
function cityHappyWhy() {
  const sum = {}; let n = 0;
  for (const h of game.buildings.values()) if (h.kind === 'house' && h.happyWhy && h.residents) {
    for (const k in h.happyWhy) sum[k] = (sum[k] || 0) + h.happyWhy[k] * h.residents;
    n += h.residents;
  }
  for (const k in sum) sum[k] = Math.round(sum[k] / n);
  return sum;
}

// ---- ladri ----
function crimeTick(dt) {
  const C = cityState();
  for (const b of game.buildings.values()) {
    if (b.theftT > 0) b.theftT -= dt;
    if (b.crimeT > 0) b.crimeT -= dt;
  }
  if ((C.t -= dt) > 0) return;
  C.t = CRIME.every * (0.7 + Math.random() * 0.6);
  if (game.population < CRIME.minPop) return;
  const targets = [...game.buildings.values()].filter(b => (b.kind === 'house' && b.residents > 0) || (SHOPS[b.kind] && b.workers > 0) || b.kind === 'bakery');
  if (!targets.length) return;
  const t = targets[Math.floor(Math.random() * targets.length)];
  const cop = policeFor(t);
  const chance = Math.min(CRIME.max, game.population * CRIME.perResident) * (cop ? CRIME.policeCut : 1);
  if (Math.random() > chance) return;
  commitTheft(t, cop);
}
function commitTheft(t, cop) {
  const C = cityState();
  C.thefts++;
  t.theftT = CRIME.icon;
  t.theftCop = !!cop;
  const thief = spawnThief(t);
  // con la polizia: arriva l'auto, il ladro viene arrestato e i soldi restano
  let route = null;
  if (cop) route = findRoute(accessTiles(cop), accessTiles(t));
  if (route) {
    spawnVehicle({ kind: 'police', from: cop.id, tiles: route, pts: routePoints(route, false), speed: POLICE.carSpeed, color: '#f4f4f4',
      arrive() {
        if (thief && peds.includes(thief)) peds = peds.filter(p => p !== thief);
        C.caught++;
        const tb = game.buildings.get(t.id);
        if (tb) tb.theftT = Math.min(tb.theftT, 2);
        toast(TR('Ladro arrestato vicino a {name}', { name: buildingLabel(t) }));
        const back = findRoute(route.slice(-1), accessTiles(cop));
        const st = game.buildings.get(cop.id);
        if (back && st) spawnVehicle({ kind: 'police', from: cop.id, tiles: back, pts: routePoints(back, false), speed: POLICE.carSpeed * 0.7, color: '#f4f4f4', calm: true, arrive() {}, cancel() {} });
      },
      cancel() {} });
    for (const h of game.buildings.values()) if (h.kind === 'house' && distToBuilding(h, t.ax, t.ay) <= CRIME.radius / 2) h.crimeT = Math.max(h.crimeT || 0, CRIME.memory / 3);
    return;
  }
  // senza polizia: il ladro scappa con i soldi e il quartiere ha paura
  const amount = Math.min(CRIME.stealMax, CRIME.stealMin + Math.round(game.population * CRIME.stealPer));
  game.money -= amount; C.stolen += amount;
  if (typeof noteMoney === 'function') noteMoney('thefts', -amount);
  for (const h of game.buildings.values()) if (h.kind === 'house' && distToBuilding(h, t.ax, t.ay) <= CRIME.radius) h.crimeT = CRIME.memory;
  toast(TR('Furto a {name}: rubati {m}. Una stazione di polizia vicina li fermerebbe.', { name: buildingLabel(t), m: money(amount) }));
  updateHud();
}
// il ladro: omino vestito a righe con il sacco, esce dall'edificio e scappa veloce
function spawnThief(t) {
  const doors = pedDoors(t);
  if (!doors.length) return null;
  const walk = planWalk({ b: t, doors }, w => w === t ? 0 : 1, 5);
  if (!walk) return null;
  const p = newPed(pedPoints(walk));
  Object.assign(p, { thief: true, shirt: '#2b2b33', pants: '#1b1b20', hair: '#1b1b1b', bag: true, speed: PEDS.speed * 1.9 });
  peds.push(p);
  return p;
}

let happyTimer = 0;
function cityUpdate(dt) {
  if ((happyTimer -= dt) <= 0) { happyTimer = HAPPY.every; updateHappiness(); }
  crimeTick(dt);
  // senza municipio le tasse tornano quelle di partenza
  if (game.taxRate != null && !townHallOf()) game.taxRate = null;
}

// ---- pannello ----
function happyFactorRows(box, why) {
  const keys = Object.keys(HAPPY_LABELS).filter(k => why[k]);
  keys.sort((a, b) => why[a] - why[b]);
  const list = el('div', 'phappy-list');
  for (const k of keys) {
    const v = why[k];
    const r = el('div', 'phappy-row');
    r.append(el('span', null, TR(HAPPY_LABELS[k])), el('b', v > 0 ? 'up' : 'down', (v > 0 ? '+' : '') + v));
    list.appendChild(r);
  }
  box.appendChild(list);
}
function happyBar(box, valueFn, label) {
  const w = el('div', 'phappy');
  const head = el('div', 'phappy-head');
  head.append(el('span', null, label), liveText('b', null, () => { const v = valueFn(); return v == null ? '-' : Math.round(v) + '%'; }));
  const b = el('div', 'pbar'), f = el('div', 'pbar-fill');
  const upd = () => { const v = valueFn() ?? 0; f.style.width = Math.round(v) + '%'; f.style.background = happyColor(v); head.lastChild.style.color = happyColor(v); };
  upd(); panelLive.push(upd);
  b.appendChild(f);
  w.append(head, b);
  box.appendChild(w);
}
// casa: felicità con i pezzi che la fanno salire e scendere
function houseHappySection(box, h) {
  happyBar(box, () => h.happy, TR('Felicità'));
  if (h.happyWhy) happyFactorRows(box, h.happyWhy);
}
// municipio: tasse e felicità di tutta la città
function townHallSection(box, b) {
  box.appendChild(el('div', 'plabel', TR('Tasse sulle vendite')));
  const row = el('div', 'ptax');
  const minus = el('button', 'pstep', '−'), plus = el('button', 'pstep', '+');
  const set = d => { game.taxRate = Math.round(Math.max(TAX.min, Math.min(TAX.max, taxRate() + d)) * 100) / 100; game.dirty = true; updateHappiness(); renderPanel(); };
  minus.addEventListener('click', () => set(-TAX.step)); plus.addEventListener('click', () => set(TAX.step));
  const pct = Math.round(taxRate() * 100);
  row.append(minus, el('b', 'ptax-v', pct + '%'), plus);
  const eff = Math.round((TAX_RATE - taxRate()) * 60);
  row.appendChild(el('span', 'ptax-eff ' + (eff > 0 ? 'up' : eff < 0 ? 'down' : ''), TR('Felicità {n}', { n: (eff > 0 ? '+' : '') + eff })));
  box.appendChild(row);
  box.appendChild(el('div', 'pnote', TR('Più tasse = più soldi dai negozi, ma la gente è meno felice. Si parte dal {n}%.', { n: Math.round(TAX_RATE * 100) })));
  box.appendChild(el('div', 'plabel', TR('La città')));
  happyBar(box, () => game.happy, TR('Felicità media'));
  happyFactorRows(box, cityHappyWhy());
  const C = cityState();
  box.appendChild(liveText('div', 'pnote', () => TR('Furti: {a} - ladri arrestati: {b} - soldi rubati: {m}', { a: C.thefts, b: C.caught, m: money(C.stolen) })));
}
function policeSection(box, b) {
  const n = () => [...game.buildings.values()].filter(h => (h.kind === 'house' || SHOPS[h.kind]) && distToBuilding(b, h.ax, h.ay) <= POLICE.radius).length;
  box.appendChild(liveText('div', 'pnote', () => TR('Protegge {n} case e negozi entro {r} tile.', { n: n(), r: POLICE.radius })));
  const C = cityState();
  box.appendChild(liveText('div', 'pnote', () => TR('Ladri arrestati in città: {n}', { n: C.caught })));
}
// scuola: posti usati, case servite, raggio
function schoolSection(box, b) {
  const S = SCHOOLS[b.kind];
  box.appendChild(barWithLabels(() => b.pupils || 0, S.seats, () => TR('Posti: {a} / {b}', { a: b.pupils || 0, b: schoolSeats(b) }), () => ''));
  box.appendChild(liveText('div', 'pnote', () => TR('Ci vanno {n} case: quelle entro {r} tile e quelle vicine a una fermata dello stesso bus.', { n: b.homes || 0, r: S.radius })));
  box.appendChild(el('div', 'pnote', TR('Le famiglie che ci vanno sono più felici (+{n}). Senza tutto il personale ci sono meno posti.', { n: S.happy })));
  box.appendChild(liveText('div', 'pnote', () => (b.pupils || 0) >= schoolSeats(b) && schoolSeats(b) > 0 ? TR('Piena: costruiscine un\'altra per le case che restano fuori.') : ''));
}
// zona protetta dalla polizia (con la stazione in mano o selezionata): fArea in render.js

// ---- disegno ----
// Municipio: palazzo color pietra con il portico a colonne, la torre dell'orologio e la bandiera
function drawTownHall(c, ax, ay, base, r) {
  groundRect(c, ax, ay, base, [0.05, 0.05, 1.95, 1.95], r, '#c9c4b6');
  const stone = { l: '#efe6cf', r: '#d4c8a8', t: '#c9bfa5' }, white = { l: '#f8f6f0', r: '#dcd8cc', t: '#ffffff', plain: true };
  const glass = '#7fb0cf';
  const win = (face, list, z0, z1) => list.map(a => ({ face, a, b: a + 0.14, z0, z1, color: glass }));
  const cols = [0.52, 0.8, 1.12, 1.4].map(u => ({ box: [u, 1.36, u + 0.08, 1.44], h: 13, z: 2, col: white }));
  // orologio: un quadrante su ogni faccia della torre che guarda lo schermo, disegnato nel piano della faccia
  const clocks = (bx, top) => {   // bx già girato: le facce visibili sono +u e +v
    if (!DETAIL) return;
    const cu = (bx[0] + bx[2]) / 2, cv = (bx[1] + bx[3]) / 2, zc = top - 5 / STEP, R = 0.09, RZ = 2.6 / STEP;
    // un quadrante solo, sulla facciata principale (quella del portico), e solo se si vede: con due
    // sembravano occhi, e spostato di lato nelle altre rotazioni non era coerente (scelta dell'utente)
    const face = rotVec(0, 1, r);
    if (!((face[0] === 0 && face[1] === 1) || (face[0] === 1 && face[1] === 0))) return;
    for (const [nu, nv] of [face]) {
      const fu = nu ? bx[2] + 0.002 : cu, fv = nv ? bx[3] + 0.002 : cv, tu = nv ? 1 : 0, tv = nu ? 1 : 0;
      const P = (a, z) => iso(ax, ay, fu + tu * a, fv + tv * a, zc + z);
      const ring = []; for (let k = 0; k < 18; k++) { const t = k / 18 * Math.PI * 2; ring.push(P(Math.cos(t) * R, Math.sin(t) * RZ)); }
      poly(c, ring, '#ffffff'); c.strokeStyle = '#3a3a40'; c.lineWidth = 0.6;
      c.beginPath(); ring.forEach((q, i) => i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1])); c.closePath(); c.stroke();
      const t = animT * 0.2, o = P(0, 0), m = P(Math.cos(t) * R * 0.75, Math.sin(t) * RZ * 0.75), h = P(0, RZ * 0.55);
      c.beginPath(); c.moveTo(o[0], o[1]); c.lineTo(m[0], m[1]); c.moveTo(o[0], o[1]); c.lineTo(h[0], h[1]); c.stroke();
    }
  };
  drawParts2(c, ax, ay, base, r, [
    { box: [0.15, 0.2, 1.85, 1.28], h: 18, col: stone, doors: [
      { face: '+v', a: 0.88, b: 1.12, z1: 10, color: '#5a3d2b' },
      ...win('+v', [0.25, 1.61], 4, 10), ...win('+v', [0.25, 0.55, 0.88, 1.31, 1.61], 12, 16),
      ...win('-v', [0.25, 0.55, 0.88, 1.21, 1.51], 4, 10), ...win('-v', [0.25, 0.55, 0.88, 1.21, 1.51], 12, 16),
      ...win('+u', [0.35, 0.67, 0.99], 4, 10), ...win('+u', [0.35, 0.67, 0.99], 12, 16),
      ...win('-u', [0.35, 0.67, 0.99], 4, 10), ...win('-u', [0.35, 0.67, 0.99], 12, 16),
    ] },
    { group: [
      { box: [0.42, 1.28, 1.58, 1.58], h: 2, col: { l: '#d8d2c2', r: '#bdb6a6', t: '#e6e1d4', plain: true } },   // scalini
      ...cols,
      { box: [0.44, 1.28, 1.56, 1.5], h: 3, z: 15, col: stone, roof: { rh: 4, back: '#b9ad8e', roof: '#c9bfa5', gable: '#e6dcc0' } },   // frontone sopra le colonne
    ] },
    { box: [0.78, 0.5, 1.22, 0.94], h: 16, z: 18, col: stone, roof: { rh: 7, back: '#4f6b8a', roof: '#5f7fa3', gable: '#d4c8a8' }, after: clocks },
    // asta della bandiera sulla punta del tetto della torre (sul tetto grande in una rotazione finiva davanti alla torre)
    { box: [0.98, 0.7, 1.02, 0.74], h: 9, z: 37, col: { l: '#9aa0a8', r: '#7d838b', t: '#b4bac2', plain: true },
      after(bx, top) {   // bandiera che sventola
        const p = iso(ax, ay, bx[2], bx[3], top);
        const w = Math.sin(animT * 3) * 0.6; animSeen = true;
        c.fillStyle = '#3f6fd9'; c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo(p[0] + 6, p[1] + 1 + w); c.lineTo(p[0] + 6, p[1] + 4 + w); c.lineTo(p[0], p[1] + 3); c.closePath(); c.fill();
        c.fillStyle = '#ffd966'; c.fillRect(p[0] + 2.3, p[1] + 1.6 + w * 0.5, 1.4, 1.2);
      } },
  ]);
}
// Stazione di polizia: edificio bianco con la fascia blu su tutti i lati, il distintivo, le luci sul
// tetto e la volante parcheggiata davanti (la stessa auto che gira per le strade, drawVehicle)
function drawPolice(c, ax, ay, base, r) {
  groundRect(c, ax, ay, base, [0.1, 1.28, 1.9, 1.95], r, '#55585f');
  const blue = { l: '#2f55b0', r: '#24448e', t: '#3f6fd9', plain: true };
  const glass = '#9fc4e0', band = '#2f55b0';
  const win = (face, list) => list.map(a => ({ face, a, b: a + 0.18, z0: 4, z1: 9, color: glass }));
  const blink = Math.floor(animT * 3) % 2;
  if (DETAIL) animSeen = true;
  const red = blink ? { l: '#ff4d4d', r: '#d93636', t: '#ff8080', plain: true } : { l: '#5a2020', r: '#4a1a1a', t: '#6a2a2a', plain: true };
  const blu = blink ? { l: '#2a3d70', r: '#22325c', t: '#2a3d70', plain: true } : { l: '#4d7dff', r: '#365ed9', t: '#80a4ff', plain: true };
  const fwd = rotVec(1, 0, r);
  drawParts2(c, ax, ay, base, r, [
    { box: [0.15, 0.15, 1.85, 1.2], h: 16, col: { l: '#e9eef3', r: '#c7cfd8', t: '#8a919c' }, doors: [
      { face: '+v', a: 0.15, b: 1.85, z0: 11, z1: 13, color: band }, { face: '-v', a: 0.15, b: 1.85, z0: 11, z1: 13, color: band },
      { face: '+u', a: 0.15, b: 1.2, z0: 11, z1: 13, color: band }, { face: '-u', a: 0.15, b: 1.2, z0: 11, z1: 13, color: band },
      { face: '+v', a: 0.35, b: 0.7, z1: 9, color: '#2b3f6b' },
      ...win('+v', [0.85, 1.15, 1.45]), ...win('-v', [0.35, 0.65, 0.95, 1.25, 1.55]),
      ...win('+u', [0.3, 0.75]), ...win('-u', [0.3, 0.75]),
    ] },
    { box: [0.7, 0.95, 1.3, 1.08], h: 4, z: 16, col: blue, after(bx, top) {   // insegna con il distintivo, sulla faccia che si vede
      if (!DETAIL) return;
      const n = rotVec(0, 1, r), seen = (n[0] === 0 && n[1] === 1) || (n[0] === 1 && n[1] === 0);
      if (!seen) return;
      const fu = n[0] > 0 ? bx[2] : (bx[0] + bx[2]) / 2, fv = n[1] > 0 ? bx[3] : (bx[1] + bx[3]) / 2;
      const p = iso(ax, ay, fu, fv, top - 2 / STEP);
      c.fillStyle = '#ffd966'; c.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 0.8 : 1.8; c.lineTo(p[0] + Math.cos(a) * rr, p[1] + Math.sin(a) * rr); }
      c.closePath(); c.fill();
    } },
    { box: [0.4, 0.4, 0.52, 0.52], h: 2, z: 16, col: red },
    { box: [0.56, 0.4, 0.68, 0.52], h: 2, z: 16, col: blu },
    { box: [1.4, 0.35, 1.44, 0.39], h: 10, z: 16, col: { l: '#9aa0a8', r: '#7d838b', t: '#b4bac2', plain: true } },   // antenna
    { box: [1.22, 1.5, 1.78, 1.74], h: 7, draw(b) {   // volante parcheggiata davanti (vera auto della polizia)
      const mx = ax + (b[0] + b[2]) / 2, my = ay + (b[1] + b[3]) / 2;
      drawVehicle(c, { kind: 'police', color: '#f4f4f4', calm: true, pos: { mx, my, h: base }, pts: [[mx, my], [mx + fwd[0], my + fwd[1]]], seg: 0 });
    } },
  ]);
}
// luci della sirena sull'auto della polizia (drawVehicle): rossa e blu che si alternano
function drawSirenLights(c, v, mx, my, h, f, sd) {
  if (!DETAIL) return;
  animSeen = true;
  const on = v.calm ? -1 : Math.floor(animT * 6) % 2;
  for (const [w, col] of [[-0.05, on === 0 ? '#ff4d4d' : '#6a2a2a'], [0.05, on === 1 ? '#4d7dff' : '#2a3d70']]) {
    const p = iso(0, 0, mx + sd[0] * w, my + sd[1] * w, h + 8 / STEP);
    c.fillStyle = v.calm ? (w < 0 ? '#c94040' : '#3f6fd9') : col; c.fillRect(p[0] - 0.8, p[1] - 0.6, 1.6, 1.2);
    if (!v.calm && ((w < 0 && on === 0) || (w > 0 && on === 1))) { c.fillStyle = w < 0 ? 'rgba(255,80,80,0.35)' : 'rgba(80,130,255,0.35)'; c.beginPath(); c.arc(p[0], p[1], 3.2, 0, Math.PI * 2); c.fill(); }
  }
}

// ---- scuole: disegno (richiesta dell'utente) ----
// linea dipinta a terra (campi da gioco), con le coordinate del riquadro senza rotazione
function groundLine(c, ax, ay, base, r, pts, color, w = 0.7, close = false) {
  if (!DETAIL) return;
  const q = pts.map(([u, v]) => { const p = rotUV(u, v, r); return iso(ax, ay, p[0], p[1], base); });
  c.strokeStyle = color; c.lineWidth = w;
  c.beginPath(); q.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); if (close) c.closePath(); c.stroke();
}
// albero sul prato di un edificio, ordinato come un pezzo (draw)
function partTree(c, ax, ay, base, u, v, seed) {
  return { box: [u - 0.08, v - 0.08, u + 0.08, v + 0.08], h: 16, draw(b) {
    const p = iso(ax, ay, (b[0] + b[2]) / 2, (b[1] + b[3]) / 2, base);
    drawTree(c, p[0], p[1] - 8, seed, seed * 3 + 1);
  } };
}
const winRow = (face, list, z0, z1, w = 0.16, color = '#9fd3e8') => list.map(a => ({ face, a, b: a + w, z0, z1, color }));

// Scuola elementare: edificio basso giallo con il tetto rosso, porta blu, finestre su tutti i lati,
// cortile rosso con il gioco della campana e l'altalena
function drawSchool(c, ax, ay, base, r) {
  groundRect(c, ax, ay, base, [0.3, 1.12, 0.7, 2.0], r, '#c9c4b6');            // vialetto dall'entrata
  groundRect(c, ax, ay, base, [0.85, 1.22, 1.9, 1.9], r, '#c96f4e');           // cortile
  groundLine(c, ax, ay, base, r, [[0.95, 1.3], [1.8, 1.3], [1.8, 1.82], [0.95, 1.82]], '#f4e9d8', 0.6, true);
  for (let i = 0; i < 4; i++) groundLine(c, ax, ay, base, r, [[1.0 + i * 0.1, 1.4], [1.1 + i * 0.1, 1.4], [1.1 + i * 0.1, 1.5], [1.0 + i * 0.1, 1.5]], '#ffffff', 0.5, true);   // campana
  const wall = { l: '#f4d36b', r: '#d8b24a', t: '#c9a43e' };
  const wood = { l: '#c9472f', r: '#a3382a', t: '#e0604a', plain: true };
  const glass = '#9fd3e8';
  drawParts2(c, ax, ay, base, r, [
    { box: [0.12, 0.15, 1.88, 1.1], h: 13, col: wall, roof: { rh: 8, back: '#9c3b2e', roof: '#c4513d', gable: '#f4d36b' }, doors: [
      { face: '+v', a: 0.38, b: 0.62, z1: 9, color: '#3f6fd9' },
      ...winRow('+v', [0.78, 1.08, 1.38, 1.62], 4, 10, 0.18, glass), ...winRow('-v', [0.25, 0.55, 0.85, 1.15, 1.45], 4, 10, 0.18, glass),
      ...winRow('+u', [0.3, 0.65], 4, 10, 0.18, glass), ...winRow('-u', [0.3, 0.65], 4, 10, 0.18, glass),
    ] },
    // pensilina colorata sopra la porta
    { box: [0.32, 1.1, 0.68, 1.2], h: 1.2, z: 9.5, col: { l: '#e0453a', r: '#b8362d', t: '#f06a5e', plain: true } },
    // altalena: due pali e la trave (un gruppo solo)
    { group: [
      { box: [1.22, 1.56, 1.245, 1.585], h: 7, col: wood },
      { box: [1.575, 1.56, 1.6, 1.585], h: 7, col: wood },
      { box: [1.22, 1.56, 1.6, 1.585], h: 0.8, z: 7, col: wood, after(bx, top) {
        if (!DETAIL) return;
        for (const f of [0.33, 0.67]) {   // le corde e il seggiolino
          const u = bx[0] + (bx[2] - bx[0]) * f, v = bx[1] + (bx[3] - bx[1]) * f;
          const a = iso(ax, ay, u, v, top - 1 / STEP), b = iso(ax, ay, u, v, base + 2.5 / STEP);
          line(c, a, b, '#4a3a2a'); c.fillStyle = '#3a3a40'; c.fillRect(b[0] - 1, b[1] - 0.5, 2, 1);
        }
      } },
    ] },
    // casetta-scivolo verde e gialla nel cortile
    { box: [1.62, 1.28, 1.82, 1.46], h: 5, col: { l: '#4caf50', r: '#3a8f3e', t: '#f2c230', plain: true } },
  ]);
}

// Scuola superiore: palazzo grigio chiaro a due piani con la fascia verde acqua, tetto piano,
// pensilina sull'entrata e il campo sportivo davanti
function drawHighSchool(c, ax, ay, base, r) {
  groundRect(c, ax, ay, base, [0.3, 1.0, 0.7, 2.0], r, '#c9c4b6');
  groundRect(c, ax, ay, base, [0.85, 1.12, 1.92, 1.92], r, '#4f9a44');         // campo sportivo
  groundLine(c, ax, ay, base, r, [[0.95, 1.2], [1.84, 1.2], [1.84, 1.84], [0.95, 1.84]], '#f2f2f2', 0.6, true);
  groundLine(c, ax, ay, base, r, [[1.395, 1.2], [1.395, 1.84]], '#f2f2f2', 0.6);
  if (DETAIL) {   // cerchio di centrocampo
    const ring = []; for (let k = 0; k <= 16; k++) { const t = k / 16 * Math.PI * 2; ring.push([1.395 + Math.cos(t) * 0.12, 1.52 + Math.sin(t) * 0.12]); }
    groundLine(c, ax, ay, base, r, ring, '#f2f2f2', 0.6);
  }
  const wall = { l: '#e4e7ea', r: '#bfc5cc', t: '#9aa3ad' };
  const teal = '#3a8f9a', glass = '#9fd3e8';
  const band = f => ({ face: f, a: f[1] === 'v' ? 0.12 : 0.12, b: f[1] === 'v' ? 1.88 : 1.0, z0: 10, z1: 12, color: teal });
  const steel = { l: '#9aa0a8', r: '#7d838b', t: '#b4bac2', plain: true };
  drawParts2(c, ax, ay, base, r, [
    { box: [0.12, 0.12, 1.88, 1.0], h: 22, col: wall, doors: [
      band('+v'), band('-v'), band('+u'), band('-u'),
      { face: '+v', a: 0.36, b: 0.64, z1: 9, color: glass },
      ...winRow('+v', [0.8, 1.1, 1.4, 1.65], 3, 8, 0.18, glass), ...winRow('+v', [0.2, 0.5, 0.8, 1.1, 1.4, 1.65], 13.5, 19, 0.18, glass),
      ...winRow('-v', [0.2, 0.5, 0.8, 1.1, 1.4, 1.65], 3, 8, 0.18, glass), ...winRow('-v', [0.2, 0.5, 0.8, 1.1, 1.4, 1.65], 13.5, 19, 0.18, glass),
      ...winRow('+u', [0.22, 0.6], 3, 8, 0.18, glass), ...winRow('+u', [0.22, 0.6], 13.5, 19, 0.18, glass),
      ...winRow('-u', [0.22, 0.6], 3, 8, 0.18, glass), ...winRow('-u', [0.22, 0.6], 13.5, 19, 0.18, glass),
    ] },
    { box: [0.28, 1.0, 0.72, 1.2], h: 1.5, z: 9, col: { l: teal, r: '#2c6f78', t: '#4fb0bb', plain: true } },   // pensilina
    { box: [1.3, 0.3, 1.66, 0.62], h: 5, z: 22, col: { l: '#cfd3d8', r: '#a9afb6', t: '#8a919c' } },           // vano scale sul tetto
    // canestri ai due lati del campo
    { box: [0.9, 1.5, 0.93, 1.54], h: 11, col: steel, after(bx, top) { if (DETAIL) { const p = iso(ax, ay, bx[2], (bx[1] + bx[3]) / 2, top); c.fillStyle = '#ffffff'; c.fillRect(p[0] - 1.5, p[1] - 1.5, 3, 2.4); c.fillStyle = '#e0602a'; c.fillRect(p[0] - 1, p[1] + 0.9, 2, 0.6); } } },
    { box: [1.86, 1.5, 1.89, 1.54], h: 11, col: steel, after(bx, top) { if (DETAIL) { const p = iso(ax, ay, bx[0], (bx[1] + bx[3]) / 2, top); c.fillStyle = '#ffffff'; c.fillRect(p[0] - 1.5, p[1] - 1.5, 3, 2.4); c.fillStyle = '#e0602a'; c.fillRect(p[0] - 1, p[1] + 0.9, 2, 0.6); } } },
  ]);
}

// Università 3x3 (richiesta dell'utente: più grande e più bella): campus a U. Dietro il palazzo principale
// color pietra con il colonnato, il frontone e la grande cupola verde rame su un tamburo con le finestre;
// ai lati due ali di mattoni rossi con il tetto di ardesia che vengono avanti; nella piazza la fontana;
// davanti il viale con le siepi, il cancello di mattoni e gli alberi sul prato. Riquadro da 0 a 3
// (withRotSize(3)), entrata al centro del lato davanti.
function drawUniversity(c, ax, ay, base, r) { withRotSize(3, () => drawUniversity3(c, ax, ay, base, r)); }
function drawUniversity3(c, ax, ay, base, r) {
  const pave = '#ddd6c4';
  groundRect(c, ax, ay, base, [0.05, 0.05, 2.95, 2.95], r, '#69b058');         // prato
  groundRect(c, ax, ay, base, [0.72, 1.32, 2.28, 2.1], r, pave);              // piazza
  groundRect(c, ax, ay, base, [1.3, 2.1, 1.7, 3.0], r, pave);                 // viale fino al cancello
  groundRect(c, ax, ay, base, [0.2, 2.25, 0.62, 2.4], r, pave);               // vialetti verso le porte delle ali
  groundRect(c, ax, ay, base, [2.38, 2.25, 2.8, 2.4], r, pave);
  const stone = { l: '#f3ecdb', r: '#d8cfb8', t: '#e6dfcc' }, white = { l: '#fbf9f3', r: '#e0dbcf', t: '#ffffff', plain: true };
  const brick = { l: '#b9573c', r: '#94432e', t: '#7e3a2a' };
  const slate = { rh: 9, back: '#3c4650', roof: '#56626e', gable: '#b9573c', cross: true };
  const glass = '#bcd6e6', wood = '#5a3d2b';
  const hedge = { l: '#3f8a3a', r: '#2f6f2c', t: '#4fa046', plain: true };
  const W = (face, list, z0, z1, w = 0.13) => winRow(face, list, z0, z1, w, glass);
  // ala di mattoni (lunga verso il davanti), porta sul lato che guarda la piazza
  const wing = (u0, u1, inner) => ({ box: [u0, 0.25, u1, 2.25], h: 20, col: brick, roof: slate, doors: [
    ...W('+v', [u0 + 0.1, u0 + 0.34], 4, 9), ...W('+v', [u0 + 0.1, u0 + 0.34], 12, 17),
    ...W('-v', [u0 + 0.1, u0 + 0.34], 4, 9), ...W('-v', [u0 + 0.1, u0 + 0.34], 12, 17),
    ...W(inner, [0.4, 0.75, 1.1, 1.45], 4, 9), ...W(inner, [0.4, 0.75, 1.1, 1.45, 1.8], 12, 17),
    { face: inner, a: 1.78, b: 1.98, z1: 9, color: wood },
    ...W(inner === '+u' ? '-u' : '+u', [0.4, 0.75, 1.1, 1.45, 1.8], 4, 9), ...W(inner === '+u' ? '-u' : '+u', [0.4, 0.75, 1.1, 1.45, 1.8], 12, 17),
  ] });
  // tamburo con le finestrelle e la cupola verde rame con la lanterna
  const dome = (bx, top) => {
    const cu = (bx[0] + bx[2]) / 2, cv = (bx[1] + bx[3]) / 2, rad = (bx[2] - bx[0]) / 2;
    const [x, y] = iso(ax, ay, cu, cv, top), rx = rad * TW * 0.7071, ry = rad * TH * 0.7071, hh = rx * 0.9;
    if (DETAIL) {   // finestrelle sulla metà del tamburo che si vede
      const yb = y + 7.5;
      for (let k = 1; k < 6; k++) {
        const a = k / 6 * Math.PI, wx = x + Math.cos(a) * rx * 0.92, wy = yb - 5.5 + Math.sin(a) * ry * 0.92;
        c.fillStyle = '#7d97ab'; c.fillRect(wx - 0.9 * Math.sin(a), wy, 1.8 * Math.sin(a), 3.4);
      }
    }
    const L = '#73c4a0', R = '#4c9677';
    c.fillStyle = L; c.beginPath(); c.ellipse(x, y, rx, hh, 0, Math.PI, Math.PI * 1.5); c.lineTo(x, y + ry); c.ellipse(x, y, rx, ry, 0, Math.PI / 2, Math.PI); c.closePath(); c.fill();
    c.fillStyle = R; c.beginPath(); c.ellipse(x, y, rx, hh, 0, Math.PI * 1.5, Math.PI * 2); c.ellipse(x, y, rx, ry, 0, 0, Math.PI / 2); c.lineTo(x, y - hh); c.closePath(); c.fill();
    if (DETAIL) {   // costoloni della cupola, contorno, riflesso
      c.strokeStyle = 'rgba(30,70,55,0.55)'; c.lineWidth = 0.45;
      for (const f of [0.35, 0.7]) for (const sg of [-1, 1]) { c.beginPath(); c.ellipse(x, y, rx * f, hh, 0, sg < 0 ? Math.PI : Math.PI * 1.5, sg < 0 ? Math.PI * 1.5 : Math.PI * 2); c.stroke(); }
      c.beginPath(); c.moveTo(x, y - hh); c.lineTo(x, y + ry); c.stroke();
      c.strokeStyle = 'rgba(0,0,0,0.4)'; c.beginPath(); c.ellipse(x, y, rx, hh, 0, Math.PI, Math.PI * 2); c.ellipse(x, y, rx, ry, 0, 0, Math.PI); c.stroke();
      aline(c, [x - rx * 0.62, y - hh * 0.45], [x - rx * 0.25, y - hh * 0.88], '#ffffff', 0.55);
    }
    // lanterna in cima con la punta dorata
    c.fillStyle = '#f3ecdb'; c.fillRect(x - 1.6, y - hh - 3.4, 3.2, 3.6);
    c.fillStyle = '#d8cfb8'; c.fillRect(x, y - hh - 3.4, 1.6, 3.6);
    c.fillStyle = '#7d97ab'; c.fillRect(x - 0.6, y - hh - 2.8, 1.2, 1.8);
    c.fillStyle = '#4c9677'; c.beginPath(); c.moveTo(x - 2.1, y - hh - 3.4); c.lineTo(x + 2.1, y - hh - 3.4); c.lineTo(x, y - hh - 6.2); c.closePath(); c.fill();
    c.fillStyle = '#ffd966'; c.fillRect(x - 0.4, y - hh - 8, 0.8, 2);
  };
  const fountain = (bx, top) => {   // acqua che zampilla e ricade nella vasca
    if (!DETAIL) return;
    animSeen = true;
    const [x, y] = iso(ax, ay, (bx[0] + bx[2]) / 2, (bx[1] + bx[3]) / 2, top);
    c.fillStyle = '#d8cfb8'; c.fillRect(x - 0.8, y - 4, 1.6, 4);
    for (let k = 0; k < 6; k++) {
      const t = (animT * 0.9 + k / 6) % 1, a = k / 6 * Math.PI * 2;
      const px = x + Math.cos(a) * 4.5 * t, py = y - 4 - 5 * t + 9 * t * t + Math.sin(a) * 1.6 * t;
      c.fillStyle = 'rgba(220,240,255,' + (0.9 - 0.5 * t).toFixed(2) + ')'; c.fillRect(px - 0.5, py - 0.5, 1, 1);
    }
  };
  drawParts2(c, ax, ay, base, r, [
    wing(0.12, 0.7, '+u'), wing(2.3, 2.88, '-u'),
    // palazzo principale: due piani di finestre, cornicione chiaro, porta grande dietro le colonne
    { box: [0.7, 0.2, 2.3, 1.3], h: 24, col: stone, doors: [
      { face: '+v', a: 1.38, b: 1.62, z1: 12, color: wood },
      ...W('+v', [0.8, 1.04, 1.83, 2.07], 4, 10), ...W('+v', [0.8, 1.04, 1.28, 1.59, 1.83, 2.07], 14, 20),
      ...W('-v', [0.8, 1.04, 1.28, 1.59, 1.83, 2.07], 4, 10), ...W('-v', [0.8, 1.04, 1.28, 1.59, 1.83, 2.07], 14, 20),
      ...W('+u', [0.35, 0.65, 0.95], 4, 10), ...W('+u', [0.35, 0.65, 0.95], 14, 20),
      ...W('-u', [0.35, 0.65, 0.95], 4, 10), ...W('-u', [0.35, 0.65, 0.95], 14, 20),
      { face: '+v', a: 0.7, b: 2.3, z0: 22, z1: 24, color: '#e6dfcc' }, { face: '-v', a: 0.7, b: 2.3, z0: 22, z1: 24, color: '#e6dfcc' },
      { face: '+u', a: 0.2, b: 1.3, z0: 22, z1: 24, color: '#e6dfcc' }, { face: '-u', a: 0.2, b: 1.3, z0: 22, z1: 24, color: '#e6dfcc' },
    ] },
    // colonnato e frontone (gruppo: dal basso verso l'alto)
    { group: [
      { box: [0.98, 1.3, 2.02, 1.5], h: 1.5, col: { l: '#e6e0d2', r: '#cbc4b4', t: '#efeadf', plain: true } },   // gradini
      ...[1.02, 1.2, 1.38, 1.55, 1.73, 1.91].map(u => ({ box: [u, 1.36, u + 0.07, 1.43], h: 15, z: 1.5, col: white })),
      { box: [0.98, 1.3, 2.02, 1.47], h: 3, z: 16.5, col: stone, roof: { rh: 6, back: '#cfc6b0', roof: '#e6dfcc', gable: '#f3ecdb', cross: true } },
    ] },
    { box: [1.16, 0.4, 1.84, 1.08], h: 8, z: 24, cyl: true, col: { l: '#f3ecdb', r: '#d8cfb8', t: '#e6dfcc' }, after: dome },
    // fontana nella piazza
    { box: [1.28, 1.52, 1.72, 1.96], h: 2.5, cyl: true, col: { l: '#e6dfcc', r: '#c9c0aa', t: '#d8cfb8', hollow: '#5fb3e0' }, after: fountain },
    // siepi lungo il viale
    { box: [1.14, 2.2, 1.24, 2.82], h: 2.5, col: hedge }, { box: [1.76, 2.2, 1.86, 2.82], h: 2.5, col: hedge },
    // cancello di mattoni con l'arco e i cappelli di pietra
    { group: [
      { box: [1.02, 2.86, 1.16, 3.0], h: 11, col: brick }, { box: [1.84, 2.86, 1.98, 3.0], h: 11, col: brick },
      { box: [1.16, 2.9, 1.84, 2.96], h: 2, z: 9, col: { l: '#2f4f7a', r: '#24405f', t: '#3a5f8f', plain: true } },
      { box: [1.0, 2.84, 1.18, 3.02], h: 1.2, z: 11, col: stone }, { box: [1.82, 2.84, 2.0, 3.02], h: 1.2, z: 11, col: stone },
    ] },
    partTree(c, ax, ay, base, 0.45, 2.7, 4), partTree(c, ax, ay, base, 0.85, 2.62, 7),
    partTree(c, ax, ay, base, 2.15, 2.62, 11), partTree(c, ax, ay, base, 2.55, 2.7, 13),
  ]);
}
