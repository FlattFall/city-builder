// ---------- Manuale (tasto M) ----------
// Un capitolo per settore, con le icone del gioco. Le catene di montaggio, i prezzi e i numeri
// sono presi dai dati (RECIPES, LIVESTOCK, GOODS, SHOPS...), così restano giusti se cambiano.
let manualOpen = false, manualPage = 'start';
function manualIsOpen() { return manualOpen; }

function openManual(page) {
  if (typeof closeProgress === 'function' && progressIsOpen()) closeProgress();
  manualOpen = true;
  if (page) manualPage = page;
  document.getElementById('manual').hidden = false;
  game.hover = null;
  renderManual();
}
function closeManual() { manualOpen = false; document.getElementById('manual').hidden = true; }
function toggleManual() { if (manualOpen) closeManual(); else openManual(); }

// ---------- piccoli aiuti per costruire le pagine ----------
function mEl(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
function mImg(src, cls) { const i = document.createElement('img'); i.src = src; i.alt = ''; if (cls) i.className = cls; return i; }
const euro = n => money(n);   // money() è in i18n.js (caricato dopo)
const shortName = id => TOOL_INFO[id].label.replace(/ \(.*\)$/, '');

function goodChip(g, q) {
  const s = mEl('span', 'gd');
  s.append(mImg(GOOD_ICONS[g]), document.createTextNode((q && q > 1 ? q + ' ' : '') + GOODS[g].name));
  return s;
}
function buildingChip(id) { const s = mEl('span', 'bd'); s.title = shortName(id); s.appendChild(mImg(ICONS[id])); return s; }
const arrow = () => mEl('span', 'ar', '→');
const plus = () => mEl('span', 'pl', '+');
function priceNote(g) {
  const shop = shopOf(g);
  return shop ? mEl('span', 'pr', TR('si vende al {s} a {p} €', { s: shortName(shop).toLowerCase(), p: GOODS[g].price })) : null;
}

// Riga di una ricetta: materie prime -> edificio -> prodotto
function recipeRow(kind, r) {
  const row = mEl('div', 'chain-row');
  Object.entries(r.in).forEach(([g, q], i) => { if (i) row.appendChild(plus()); row.appendChild(goodChip(g, q)); });
  row.append(arrow(), buildingChip(kind), arrow(), goodChip(r.out));
  const p = priceNote(r.out);
  if (p) row.appendChild(p);
  return row;
}
// Un edificio con icona, nome, costo e descrizione
function item(id, extra) {
  const it = mEl('div', 'man-item');
  it.appendChild(mImg(ICONS[id]));
  const t = mEl('div');
  const cost = TOOL_INFO[id].cost ? ' - ' + euro(TOOL_INFO[id].cost) : '';
  const lock = typeof toolLocked === 'function' && toolLocked(id) ? ' <span style="color:#ff9b6b">🔒 ' + TR('da sbloccare (P)') + '</span>' : '';
  const jobs = JOBS[id] ? ' <span style="color:#94b0c2">- ' + TR('{n} lavoratori', { n: JOBS[id] }) + '</span>' : '';
  t.innerHTML = '<b>' + shortName(id) + '</b>' + cost + jobs + lock + '<br>' + (TOOL_INFO[id].desc || '') + (extra ? ' ' + extra : '');
  it.appendChild(t);
  return it;
}
function statusIcon(st) {
  const cv = document.createElement('canvas'); cv.width = 24; cv.height = 24;
  const c = cv.getContext('2d'); c.setTransform(1.8, 0, 0, 1.8, 12, 12);
  drawStatusIcon(c, st, 0, 0);
  return cv.toDataURL();
}
function destLine(kind) {
  return TR('Può mandare a: {list}.', { list: destKindsOf({ kind }).map(k => shortName(k).toLowerCase()).join(', ') });
}

// ---------- capitoli ----------
const MANUAL = [
  { id: 'start', title: 'Come si inizia', icon: 'house', build(b) {
    b.append(mEl('p', null, TR('Il gioco è una città che cresce: le case portano abitanti, gli abitanti lavorano nelle attività, le attività producono merce che i negozi vendono agli abitanti. Su ogni vendita incassi le <b>tasse</b>: sono i soldi per costruire e per sbloccare nuovi settori.')));
    const ol = mEl('ol');
    ol.innerHTML = [
      'Costruisci <b>case</b> lungo la strada principale (o su strade collegate a lei): arrivano le famiglie in auto.',
      'Metti una <b>fattoria</b> vicino alle case e scegli i campi intorno.',
      'Costruisci un <b>supermercato</b> e, dal pannello della fattoria (clic con la Mano), scegli il supermercato come destinazione: le verdure si vendono anche fresche.',
      'Aggiungi un <b>magazzino alimenti</b> per tenere da parte il raccolto.',
      'Con i soldi delle tasse apri la finestra <b>Progressi</b> (tasto <span class="man-key">P</span>) e sblocca fabbrica alimentare, allevamenti, legno, tessile, energia...',
      'Per provare il gioco senza accumulare soldi: tasto <span class="man-key">I</span> = sblocca tutto.',
    ].map(x => '<li>' + TR(x) + '</li>').join('');
    b.appendChild(ol);
    b.appendChild(mEl('div', 'man-tip', TR("Ogni attività ha bisogno di lavoratori che abitano vicino (entro {n} tile) e di una strada davanti all'entrata. Quando piazzi un edificio vedi l'entrata: verde = c'è la strada, giallo = manca.", { n: JOB_RADIUS })));
    b.appendChild(mEl('h4', null, TR('Si parte con')));
    const ok = mEl('div', 'chain-row');
    for (const t of START_TOOLS.filter(t => ICONS[t] && !['field', 'raise', 'lower', 'level', 'hand'].includes(t))) ok.appendChild(buildingChip(t));
    b.appendChild(ok);
    b.appendChild(mEl('p', null, TR("Soldi all'inizio: <b>{m}</b>.", { m: euro(START_MONEY) })));
  } },

  { id: 'roads', title: 'Strade', icon: 'road', build(b) {
    b.appendChild(mEl('p', null, TR('Le auto e i furgoni si muovono solo sulle strade collegate. Trascina con il mouse per costruire. Le strade salgono da sole sulle colline con le rampe (un livello alla volta, in linea retta).')));
    for (const id of ['road', 'dirt', 'oneway', 'highway', 'bridge', 'hwBridge', 'tunnel', 'rail']) b.appendChild(item(id));
    b.appendChild(mEl('div', 'man-tip', TR('Rotonda: costruisci un quadrato 2x2 di strade asfaltate. Si gira solo in senso antiorario. Per trasformare una strada (es. in autostrada) inizia il trascinamento sopra una strada.')));
  } },

  { id: 'homes', title: 'Case, abitanti e lavoro', icon: 'house', build(b) {
    b.appendChild(item('house'));
    b.appendChild(mEl('p', null, TR("Gli abitanti arrivano dai bordi della mappa lungo la strada principale. Una casa si riempie solo se è accanto a una strada collegata alla principale. Se demolisci una casa, chi ci abita cerca un'altra casa libera o se ne va dalla mappa.")));
    b.appendChild(mEl('p', null, TR('Ogni attività prende i lavoratori dalle case entro <b>{n} tile</b>. Più personale = lavora più in fretta; senza personale si ferma. In alto vedi quanti <b>Disoccupati</b> ci sono: se sono tanti puoi aprire nuove attività.', { n: JOB_RADIUS })));
    b.appendChild(mEl('h4', null, TR('Le icone sopra gli edifici')));
    const names = { noRoad: 'Nessuna strada (o non collegata alla principale)', noWorkers: 'Nessun lavoratore', fewWorkers: 'Pochi lavoratori',
      full: 'Deposito pieno: scegli una destinazione', noInput: 'Mancano le materie prime', empty: 'Negozio vuoto: niente da vendere' };
    for (const [st, txt] of Object.entries(names)) {
      const s = mEl('div', 'man-stat'); s.append(mImg(statusIcon(st)), document.createTextNode(TR(txt))); b.appendChild(s);
    }
  } },

  { id: 'farm', title: 'Agricoltura', icon: 'farm', build(b) {
    b.appendChild(item('farm'));
    b.appendChild(mEl('p', null, TR('Dopo aver piazzato la fattoria scegli i campi (entro {r} tile, poi "Fatto"). Nel pannello della fattoria scegli la coltura e le destinazioni. Con tutto il personale si raccoglie ogni {s} secondi, {y} unità per campo. La fattoria tiene al massimo {c} unità.', { r: FARM.fieldRadius, s: FARM.cycleSec, y: FARM.yieldPerField, c: CAPS.farm.store })));
    b.appendChild(mEl('h4', null, TR('Colture')));
    for (const c of Object.keys(CROPS)) {
      const row = mEl('div', 'chain-row');
      row.append(buildingChip('farm'), arrow(), goodChip(c));
      const uses = Object.entries(RECIPES).filter(([, rs]) => rs.some(r => r.in[c])).map(([k]) => shortName(k).toLowerCase());
      if (uses.length) row.appendChild(mEl('span', 'pr', TR('serve a: {list}', { list: uses.join(', ') })));
      const p = priceNote(c); if (p) row.appendChild(p);
      if (typeof cropLocked === 'function' && cropLocked(c)) row.appendChild(mEl('span', 'pr', '🔒 ' + TR('da sbloccare')));
      b.appendChild(row);
    }
    b.appendChild(mEl('p', null, destLine('farm')));
  } },

  { id: 'animals', title: 'Allevamento', icon: 'livestock', build(b) {
    b.appendChild(item('livestock'));
    b.appendChild(mEl('p', null, TR('Un solo edificio: nel pannello scegli quale animale allevare. Produce da solo (non servono campi), più in fretta con tutto il personale.')));
    for (const [k, L] of Object.entries(LIVESTOCK)) {
      b.appendChild(mEl('h4', null, L.animal + ' - ' + TR('ogni {n} secondi', { n: L.every }) + ' ' + (L.grass ? TR("(vuole l'erba)") : TR('(anche in montagna)'))));
      const row = mEl('div', 'chain-row');
      row.append(buildingChip('livestock'), arrow());
      Object.entries(L.out).forEach(([g, q], i) => { if (i) row.appendChild(plus()); row.appendChild(goodChip(g, q)); });
      b.appendChild(row);
      b.appendChild(mEl('p', null, TR('Può mandare a: {list}.', { list: DEST_KINDS[k].map(x => shortName(x).toLowerCase()).join(', ') })));
    }
  } },

  { id: 'food', title: 'Trasformazione alimentare', icon: 'factory', build(b) {
    b.appendChild(mEl('p', null, TR('Le fabbriche prendono le materie prime (mandate dai produttori o prese da sole dai magazzini) e ad ogni ciclo fanno un prodotto per ogni ricetta. Nel pannello puoi spegnere le ricette che non vuoi.')));
    for (const k of ['factory', 'bakery', 'dairy', 'slaughterhouse']) {
      b.appendChild(item(k));
      for (const r of RECIPES[k]) b.appendChild(recipeRow(k, r));
      b.appendChild(mEl('p', null, destLine(k)));
    }
  } },

  { id: 'wood', title: 'Legno e mobili', icon: 'forestry', build(b) {
    b.appendChild(item('forestry', TR('Lavora a pieno ritmo con almeno {n} tile di bosco entro {r} tile.', { n: FORESTRY.forestry.trees, r: FORESTRY.forestry.radius })));
    const row = mEl('div', 'chain-row');
    row.append(buildingChip('forestry'), arrow());
    Object.entries(FORESTRY.forestry.out).forEach(([g, q], i) => { if (i) row.appendChild(plus()); row.appendChild(goodChip(g, q)); });
    b.appendChild(row);
    for (const k of ['sawmill', 'furnitureFactory']) {
      b.appendChild(item(k));
      for (const r of RECIPES[k]) b.appendChild(recipeRow(k, r));
    }
    b.appendChild(item('furnitureStore'));
    b.appendChild(item('goodsWarehouse'));
  } },

  { id: 'textile', title: 'Tessile e abbigliamento', icon: 'textileMill', build(b) {
    b.appendChild(mEl('p', null, TR('Il cotone arriva dalle fattorie, la lana dagli allevamenti di pecore. Con cotone e lana insieme si fanno le stoffe lavorate, che servono per i capi più cari.')));
    for (const k of ['textileMill', 'clothingFactory']) {
      b.appendChild(item(k));
      for (const r of RECIPES[k]) b.appendChild(recipeRow(k, r));
    }
    b.appendChild(item('clothingStore'));
  } },

  { id: 'energy', title: 'Energia e petrolio', icon: 'coalPlant', build(b) {
    b.appendChild(mEl('p', null, TR('La città ha una sola <b>rete elettrica</b>: le centrali producono, abitanti e attività consumano ({a} per abitante, {b} per attività). Ogni {s} secondi gli abitanti con la corrente pagano la <b>bolletta</b> e le attività con la corrente lavorano fino al <b>{p}%</b> più in fretta. Nel pannello di ogni centrale vedi produzione, consumo e quanta città è coperta.', { a: GRID.perResident, b: GRID.perBusiness, s: GRID.billEvery, p: Math.round(GRID.boost * 100) })));
    b.appendChild(mEl('h4', null, TR('Carbone')));
    b.appendChild(item('charcoalKiln'));
    for (const r of RECIPES.charcoalKiln) b.appendChild(recipeRow('charcoalKiln', r));
    b.appendChild(item('coalPlant'));
    const cr = mEl('div', 'chain-row');
    cr.append(goodChip('coal'), arrow(), buildingChip('coalPlant'), arrow(), mEl('span', 'pr', '⚡ ' + TR('{n} di energia (1 carbone ogni {s} s)', { n: POWER.coalPlant.out, s: POWER.coalPlant.burn })));
    b.appendChild(cr);
    b.appendChild(mEl('h4', null, TR('Rinnovabili')));
    b.appendChild(item('solarPlant', '⚡ ' + TR('{n} di energia.', { n: POWER.solarPlant.out })));
    b.appendChild(item('windPlant', '⚡ ' + TR('da {a} (in pianura) fino a {b} (in montagna).', { a: POWER.windPlant.out, b: POWER.windPlant.max })));
    b.appendChild(mEl('h4', null, TR('Petrolio')));
    b.appendChild(mEl('p', null, TR("Il petrolio sta nei <b>giacimenti</b> sotto terra e sotto il mare: quando prendi in mano il pozzo o la piattaforma, le zone dove ce n'è diventano scure (più scure = più petrolio).")));
    b.appendChild(item('oilWell'));
    b.appendChild(item('oilPlatform'));
    b.appendChild(item('port', TR("Le navi viaggiano sull'acqua collegata dalla piattaforma alle caselle d'acqua dietro al porto.")));
    const sr = mEl('div', 'chain-row');
    sr.append(buildingChip('oilPlatform'), arrow(), mEl('span', 'pr', '🚢 ' + TR('nave')), arrow(), buildingChip('port'), arrow(), mEl('span', 'pr', '🚚 ' + TR('furgone')), arrow(), buildingChip('refinery'));
    b.appendChild(sr);
    b.appendChild(item('refinery'));
    for (const r of RECIPES.refinery) b.appendChild(recipeRow('refinery', r));
    b.appendChild(item('gasStation'));
  } },

  { id: 'logistics', title: 'Magazzini e furgoni', icon: 'warehouse', build(b) {
    b.appendChild(item('warehouse'));
    b.appendChild(item('goodsWarehouse'));
    b.appendChild(mEl('p', null, TR("Ogni attività ha un furgone (i magazzini {w}). Il furgone parte quando ci sono almeno <b>{a} unità</b> e ne porta fino a <b>{b}</b>, poi torna indietro. Le destinazioni si scelgono nel pannello dell'edificio: se ne scegli più di una, ogni merce va alla prima che la accetta e ha posto.", { w: VANS.warehouse, a: VAN_MIN_LOAD, b: VAN_CAPACITY })));
    b.appendChild(mEl('p', null, TR('Fabbriche e negozi vanno anche da soli a prendere nei magazzini quello che gli serve. Il supermercato lascia la precedenza alle fabbriche per le merci che loro trasformano (es. la farina va prima al panificio).')));
    b.appendChild(mEl('div', 'man-tip', TR("Nel pannello del magazzino puoi scegliere cosa accetta (clic sulle merci) e un'uscita verso altri edifici. Due magazzini non possono mandarsi la merce a vicenda.")));
  } },

  { id: 'shops', title: 'Negozi, vendite e soldi', icon: 'supermarket', build(b) {
    b.appendChild(mEl('p', null, TR('I clienti di un negozio sono gli abitanti delle case vicine. Per ogni cosa venduta incassi il <b>{n}%</b> del prezzo come tasse.', { n: Math.round(TAX_RATE * 100) })));
    for (const [k, S] of Object.entries(SHOPS)) {
      b.appendChild(item(k, TR('Clienti entro {n} tile.', { n: S.radius })));
      const row = mEl('div', 'chain-row');
      for (const g of Object.keys(GOODS).filter(g => shopOf(g) === k)) {
        const chip = goodChip(g);
        chip.appendChild(mEl('span', 'pr', ' ' + GOODS[g].price + ' €'));
        row.appendChild(chip);
      }
      b.appendChild(row);
    }
    b.appendChild(mEl('div', 'man-tip', TR("Le merci senza prezzo (grano, animali, tronchi, cotone, lana, filati, tessuti, carbone, petrolio) non si vendono: servono alle fabbriche. Latte, farina e legname si vendono anche così, ma se c'è una fabbrica che li usa vanno prima a lei.")));
  } },

  { id: 'progress', title: 'Progressi e sblocchi', icon: 'factory', build(b) {
    b.appendChild(mEl('p', null, TR("In una mappa nuova hai solo le cose di base. Apri la finestra <b>Progressi</b> con il tasto <span class=\"man-key\">P</span> (o il pulsante in alto) e paga per sbloccare nuove strade, colture e industrie. Alcune ne vogliono prima un'altra: ad esempio il panificio vuole la fabbrica alimentare. Il tasto <span class=\"man-key\">I</span> sblocca tutto (per provare il gioco).")));
    for (const sector of [...new Set(UNLOCKS.map(u => u.sector))]) {
      b.appendChild(mEl('h4', null, sector));
      const row = mEl('div', 'chain-row');
      UNLOCKS.filter(u => u.sector === sector).forEach((u, i) => {
        if (i) row.appendChild(mEl('span', 'pl', '·'));
        const s = mEl('span', 'gd');
        s.append(mImg(u.tools ? ICONS[u.tools[0]] : GOOD_ICONS[u.crops[0]]), document.createTextNode(unlockName(u) + ' ' + euro(u.cost) + (isUnlocked(u.id) ? ' ✓' : '')));
        row.appendChild(s);
      });
      b.appendChild(row);
    }
    b.appendChild(mEl('div', 'man-tip', TR('Uno strumento bloccato nella barra ha il lucchetto: cliccandolo si apre direttamente la finestra Progressi.')));
  } },

  { id: 'terrain', title: 'Terreno e demolizione', icon: 'demolish', build(b) {
    for (const id of ['demolish', 'raise', 'lower', 'level']) b.appendChild(item(id));
    b.appendChild(mEl('p', null, TR("Il terreno si modella solo dove non ci sono strade o edifici. A quota 0 diventa acqua. Si costruisce anche in montagna, ma fattorie e la maggior parte degli allevamenti vogliono l'erba.")));
  } },

  { id: 'keys', title: 'Comandi', icon: 'hand', build(b) {
    const ul = mEl('ul');
    ul.innerHTML = [
      ['Clic sinistro', 'usa lo strumento (trascina per strade, campi, demolizioni)'],
      ['Mano + clic', "apre il pannello dell'edificio (merce, lavoratori, destinazioni, nome con ✎)"],
      ['Destro / centrale + trascina', 'sposta la mappa'], ['Rotella', 'zoom'],
      ['W A S D / frecce', 'sposta la mappa'], ['1 - 8', 'gruppi della barra (premi di nuovo per il prossimo strumento)'],
      ['R', "ruota l'edificio (o la direzione di senso unico e tunnel)"], ['M', 'manuale'], ['P', 'progressi'], ['I', 'sblocca tutto (per provare il gioco)'],
      ['Esc', 'chiude le finestre, poi menu e salvataggio'],
    ].map(([k, d]) => '<li><span class="man-key">' + TR(k) + '</span> ' + TR(d) + '</li>').join('');
    b.appendChild(ul);
  } },
];

function renderManual() {
  const nav = document.getElementById('manual-nav'), body = document.getElementById('manual-body');
  nav.textContent = ''; body.textContent = '';
  for (const ch of MANUAL) {
    const btn = mEl('button', ch.id === manualPage ? 'active' : null);
    btn.dataset.page = ch.id;
    btn.append(mImg(ICONS[ch.icon]), document.createTextNode(ch.title));
    btn.addEventListener('click', () => { manualPage = ch.id; renderManual(); });
    nav.appendChild(btn);
  }
  const ch = MANUAL.find(c => c.id === manualPage) || MANUAL[0];
  body.appendChild(mEl('h3', null, ch.title));
  ch.build(body);
  body.scrollTop = 0;
}

function initManual() {
  document.getElementById('manual-close').addEventListener('click', closeManual);
  document.getElementById('manual-btn').addEventListener('click', e => { e.target.blur(); toggleManual(); });
  document.getElementById('manual').addEventListener('mousedown', e => { if (e.target.id === 'manual') closeManual(); });
}
