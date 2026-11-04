// ---------- Pannello degli edifici e modalità campi ----------
// Con la Mano, un clic su un edificio apre il suo pannello:
//  - Casa: abitanti e lavoro
//  - Fattoria: coltura, campi, crescita, inventario, dove mandare il raccolto
//  - Magazzino: scorte e cosa accetta (griglia di immagini)
//  - Fabbrica / Panificio: ricette attivabili, materie prime, prodotti, dove mandarli
//  - Supermercato: clienti, merce sugli scaffali, vendite e tasse
let panelTimer = 0;
let panelLive = [];      // funzioni che aggiornano numeri e barre senza ricostruire i pulsanti
let panelShape = '';     // quando cambia (nuovo edificio, coltura, ...) il pannello si ricostruisce

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// testo che si aggiorna da solo
function liveText(tag, cls, fn) {
  const e = el(tag, cls, fn());
  panelLive.push(() => { const t = fn(); if (e.textContent !== t) e.textContent = t; });
  return e;
}

function bar(valueFn, max) {
  const b = el('div', 'pbar');
  const f = el('div', 'pbar-fill');
  const upd = () => { f.style.width = Math.round(100 * Math.min(1, valueFn() / max)) + '%'; };
  upd(); panelLive.push(upd);
  b.appendChild(f);
  return b;
}

function goodImg(g, cls) {
  const i = el('img', cls || 'gicon');
  i.src = GOOD_ICONS[g]; i.alt = GOODS[g].name; i.title = GOODS[g].name;
  return i;
}

// elenco di merci con icona e quantità (che si aggiorna)
function goodsList(mapFn, emptyText) {
  const box = el('div', 'pgoods');
  const keys = Object.keys(mapFn());
  if (!keys.length) box.appendChild(el('div', 'pnote', emptyText));
  for (const g of keys) {
    const row = el('div', 'pgood');
    row.append(goodImg(g), el('span', null, GOODS[g].name), liveText('b', null, () => String(mapFn()[g] || 0)));
    box.appendChild(row);
  }
  return box;
}

// cosa determina la forma del pannello (se cambia si ricostruisce)
function panelShapeOf(b) {
  if (!b) return '';
  const others = [...game.buildings.values()].filter(w => w.kind !== 'house').map(w => w.id).join(',');
  return [b.id, b.crop, b.animal, b.name, JSON.stringify(b.dests || []), b.fields, others, b.residents >= HOUSE_CAPACITY, !!b.unreachable, accessTiles(b).length,
    !!b.incoming, Object.keys(b.store || {}).join(), Object.keys(b.input || {}).join(),
    JSON.stringify(b.accept || {}), JSON.stringify(b.recipes || {})].join('|');
}

function openBuildingPanel(b) {
  game.selected = b.id;
  document.getElementById('panel').hidden = false;
  renderPanel();
  requestDraw();
}

function closePanel() {
  game.selected = null;
  document.getElementById('panel').hidden = true;
  requestDraw();
}

function panelIsOpen() { return !document.getElementById('panel').hidden; }

function onBuildingRemoved(b) { if (game.selected === b.id) closePanel(); }

// Destinazioni possibili per la merce di un edificio, con raggiungibilità su strada
function destChoices(b) {
  const from = accessTiles(b);
  return [...game.buildings.values()].filter(w => w !== b && destKindsOf(b).includes(w.kind))
    .map(w => ({ w, ok: !!findRoute(from, accessTiles(w)) }));
}

// Destinazioni: se ne possono accendere più di una (clic per accendere/spegnere);
// ogni merce va alla prima destinazione accesa che la accetta
function destSection(box, b) {
  box.appendChild(el('div', 'plabel', (b.kind === 'farm' ? 'Dove portare il raccolto' : isWarehouse(b) ? 'Uscita: dove mandare le scorte' : 'Dove mandare la merce') + ' (anche più di una)'));
  const list = el('div', 'plist');
  const choices = destChoices(b);
  for (const { w, ok } of choices) {
    const on = b.dests.includes(w.id);
    const name = w.name || BUILDINGS[w.kind].name + ' #' + w.id;
    const btn = el('button', 'pchoice' + (on ? ' active' : ''), (on ? '✔ ' : '') + name + (ok ? '' : ' - nessuna strada'));
    if (!ok) btn.classList.add('bad');
    btn.addEventListener('click', () => {
      b.dests = on ? b.dests.filter(id => id !== w.id) : b.dests.concat(w.id);
      b.retry = 0; b.status = ''; game.dirty = true; renderPanel();
    });
    list.appendChild(btn);
  }
  box.appendChild(list);
  if (!choices.length) box.appendChild(el('div', 'pnote', 'Costruisci ' + destKindsOf(b).map(k => BUILDINGS[k].name.toLowerCase()).join(', ') + ' (gruppo 4).'));
  if (b.dests.length) box.appendChild(liveText('div', 'pnote', () => b.status || (b.van ? 'Furgone in viaggio' : 'Il furgone parte con almeno ' + VAN_MIN_LOAD + ' unità')));
}

function renderPanel() {
  const b = game.selected && game.buildings.get(game.selected);
  const box = document.getElementById('panel');
  if (!b) { closePanel(); return; }
  box.textContent = '';
  panelLive = [];
  panelShape = panelShapeOf(b);
  const head = el('div', 'phead');
  const title = el('b', 'pname', buildingName(b));
  title.title = 'Clic per cambiare il nome';
  const pen = el('button', 'prename', '✎');
  pen.title = 'Cambia nome';
  const startRename = () => {
    const inp = el('input', 'pnameinput');
    inp.value = buildingName(b); inp.maxLength = 28;
    let done = false;
    const finish = save => {
      if (done) return; done = true;
      const v = inp.value.trim();
      if (save) { if (v && v !== BUILDINGS[b.kind].name) b.name = v; else delete b.name; game.dirty = true; }
      renderPanel(); requestDraw();
    };
    inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
    inp.addEventListener('blur', () => finish(true));
    title.replaceWith(inp); pen.remove();
    inp.focus(); inp.select();
  };
  title.addEventListener('click', startRename);
  pen.addEventListener('click', startRename);
  head.append(title, el('span', 'pdim', ' #' + b.id), pen);
  const x = el('button', 'pclose', '✕');
  x.addEventListener('click', closePanel);
  head.appendChild(x);
  box.appendChild(head);

  if (b.kind === 'house') {
    box.appendChild(liveText('div', 'prow', () => 'Abitanti: ' + b.residents + ' / ' + HOUSE_CAPACITY));
    box.appendChild(bar(() => b.residents, HOUSE_CAPACITY));
    if (b.incoming) box.appendChild(liveText('div', 'pnote', () => 'In arrivo: ' + b.incoming));
    if (!accessTiles(b).length) box.appendChild(el('div', 'pwarn', 'Nessuna strada accanto alla casa.'));
    else if (b.unreachable) box.appendChild(el('div', 'pwarn', 'Non è collegata alla strada principale.'));
    else if (b.residents >= HOUSE_CAPACITY) box.appendChild(el('div', 'pnote', 'Casa piena.'));
    box.appendChild(liveText('div', 'pnote', () => 'Lavorano: ' + (b.employed || 0) + ' - disoccupati: ' + Math.max(0, b.residents - (b.employed || 0))));
  }

  if (JOBS[b.kind]) {
    box.appendChild(liveText('div', 'prow', () => 'Lavoratori: ' + (b.workers || 0) + ' / ' + JOBS[b.kind]));
    box.appendChild(bar(() => b.workers || 0, JOBS[b.kind]));
    box.appendChild(liveText('div', 'pwarn', () => (b.workers || 0) >= JOBS[b.kind] ? '' :
      'Servono abitanti che vivano entro ' + JOB_RADIUS + ' tile per lavorare qui.'));
    if (!accessTiles(b).length) box.appendChild(el('div', 'pwarn', "L'entrata non è collegata a una strada."));
  }

  if (isWarehouse(b)) {
    box.appendChild(liveText('div', 'prow', () => 'Scorte: ' + sumOf(b.store) + ' / ' + CAPS[b.kind].store));
    box.appendChild(bar(() => sumOf(b.store), CAPS[b.kind].store));
    box.appendChild(goodsList(() => b.store, 'Vuoto.'));
    box.appendChild(el('div', 'plabel', 'Cosa accetta (clic per cambiare)'));
    const grid = el('div', 'pgrid');
    for (const g of Object.keys(GOODS).filter(g => warehouseTakes(b.kind, g))) {
      const on = b.accept[g] !== false;
      const btn = el('button', 'gtoggle' + (on ? ' on' : ''));
      btn.title = GOODS[g].name + (on ? ': accettato' : ': rifiutato');
      btn.appendChild(goodImg(g));
      btn.addEventListener('click', () => { b.accept[g] = !on; game.dirty = true; renderPanel(); });
      grid.appendChild(btn);
    }
    box.appendChild(grid);
    box.appendChild(el('div', 'pnote', b.kind === 'warehouse' ? 'Solo cibo e animali. Fabbrica, panificio, caseificio, macello e supermercato prendono da qui quello che gli serve.'
      : 'Solo merci (legno, mobili, cotone, lana, tessuti, vestiti). Segheria, fabbriche e negozi prendono da qui quello che gli serve.'));
    destSection(box, b);   // uscita: dove mandare le scorte
  }

  if (b.kind === 'farm') {
    box.appendChild(el('div', 'plabel', 'Cosa coltivare'));
    const crops = el('div', 'pchoices pwrap');
    for (const [id, c] of Object.entries(CROPS)) {
      const locked = cropLocked(id);
      const btn = el('button', 'pchoice' + (b.crop === id ? ' active' : '') + (locked ? ' locked' : ''));
      btn.append(goodImg(id), el('span', null, (locked ? '🔒 ' : '') + c.name));
      if (locked) btn.title = 'Bloccato: sbloccalo nei Progressi (P)';
      btn.addEventListener('click', () => {
        if (locked) { openProgress(UNLOCKS.find(u => u.crops && u.crops.includes(id)).id); return; }
        if (b.crop !== id) { b.crop = id; b.growth = 0; game.dirty = true; } // si riparte dalla semina
        renderPanel(); requestDraw();
      });
      crops.appendChild(btn);
    }
    box.appendChild(crops);

    const fr = el('div', 'prow', 'Campi: ' + b.fields + ' ');
    const add = el('button', 'psmall', 'Aggiungi campi');
    add.addEventListener('click', () => enterFieldMode(b));
    fr.appendChild(add);
    box.appendChild(fr);
    if (!b.fields) box.appendChild(el('div', 'pwarn', 'Senza campi la fattoria non produce.'));

    box.appendChild(liveText('div', 'prow', () => 'Crescita: ' + Math.floor(b.growth * 100) + '%'));
    box.appendChild(bar(() => b.growth, 1));
    box.appendChild(liveText('div', 'prow', () => 'Inventario: ' + sumOf(b.store) + ' / ' + CAPS.farm.store));
    box.appendChild(bar(() => sumOf(b.store), CAPS.farm.store));
    box.appendChild(goodsList(() => b.store, 'Ancora niente raccolto.'));
    box.appendChild(liveText('div', 'pwarn', () => sumOf(b.store) >= CAPS.farm.store ? 'Inventario pieno: la crescita è ferma.' : ''));
    destSection(box, b);
  }

  if (b.kind === 'livestock') {
    box.appendChild(el('div', 'plabel', 'Cosa allevare'));
    const row = el('div', 'pchoices pwrap');
    for (const [a, A] of Object.entries(LIVESTOCK)) {
      const ok = animalAllowed(b, a);
      const btn = el('button', 'pchoice' + (b.animal === a ? ' active' : '') + (ok ? '' : ' bad'));
      btn.append(goodImg(A.icon), el('span', null, A.animal));
      btn.title = ok ? 'Produce: ' + Object.keys(A.out).map(g => GOODS[g].name.toLowerCase()).join(', ') : 'Qui non c\'è erba: solo pecore';
      btn.addEventListener('click', () => { if (setAnimal(b, a)) { game.dirty = true; renderPanel(); requestDraw(); } else toast('In montagna e sulla sabbia non c\'è erba: qui solo pecore'); });
      row.appendChild(btn);
    }
    box.appendChild(row);
  }

  if (natureOf(b)) {
    const L = natureOf(b);
    if (L.trees) {
      box.appendChild(liveText('div', 'prow', () => 'Bosco vicino: ' + (b.trees || 0) + ' tile (a pieno ritmo con ' + L.trees + ', entro ' + L.radius + ' tile)'));
      box.appendChild(liveText('div', 'pwarn', () => !b.trees ? 'Nessun bosco vicino: mettila accanto a una foresta.' : ''));
    }
    const prod = el('div', 'prow', 'Produce: ');
    for (const [g, q] of Object.entries(L.out)) { prod.appendChild(goodImg(g)); prod.appendChild(el('span', 'pdim', q + ' ')); }
    prod.appendChild(el('span', 'pdim', 'ogni ' + L.every + ' s'));
    box.appendChild(prod);
    box.appendChild(liveText('div', 'prow', () => 'Prossima produzione: ' + Math.floor((b.growth || 0) * 100) + '%'));
    box.appendChild(bar(() => b.growth || 0, 1));
    box.appendChild(liveText('div', 'prow', () => 'Deposito: ' + sumOf(b.store) + ' / ' + CAPS[b.kind].store));
    box.appendChild(goodsList(() => b.store, 'Ancora niente.'));
    box.appendChild(liveText('div', 'pwarn', () => b.full ? 'Deposito pieno: scegli dove mandare la merce.' : ''));
    destSection(box, b);
  }

  if (isProcessor(b)) {
    box.appendChild(el('div', 'plabel', 'Ricette (clic per accendere/spegnere)'));
    for (const r of RECIPES[b.kind]) {
      const on = b.recipes[r.out] !== false;
      const row = el('button', 'precipe' + (on ? ' on' : ''));
      for (const [g, n] of Object.entries(r.in)) { if (n > 1) row.appendChild(el('span', 'pdim', n + 'x')); row.appendChild(goodImg(g)); }
      row.appendChild(el('span', 'parrow', '→'));
      row.append(goodImg(r.out), el('span', null, GOODS[r.out].name));
      row.addEventListener('click', () => { b.recipes[r.out] = !on; game.dirty = true; renderPanel(); });
      box.appendChild(row);
    }
    box.appendChild(liveText('div', 'prow', () => 'Materie prime: ' + sumOf(b.input) + ' / ' + CAPS[b.kind].input));
    box.appendChild(goodsList(() => b.input, 'Nessuna materia prima.'));
    box.appendChild(liveText('div', 'prow', () => 'Prodotti pronti: ' + sumOf(b.store) + ' / ' + CAPS[b.kind].store));
    box.appendChild(bar(() => sumOf(b.store), CAPS[b.kind].store));
    box.appendChild(goodsList(() => b.store, 'Ancora niente.'));
    box.appendChild(liveText('div', 'pwarn', () => b.full ? 'Deposito prodotti pieno: scegli dove mandarli.' :
      b.noInput ? 'Mancano materie prime: mandale qui da una fattoria o mettile in un magazzino.' : ''));
    destSection(box, b);
  }

  if (SHOPS[b.kind]) {
    const S = SHOPS[b.kind], cap = CAPS[b.kind].store;
    box.appendChild(liveText('div', 'prow', () => 'Clienti (abitanti entro ' + S.radius + ' tile): ' + (b.customers || 0)));
    box.appendChild(liveText('div', 'prow', () => 'Venduti: ' + b.sold + ' - tasse incassate: ' + b.taxes.toLocaleString('it-IT') + ' €'));
    box.appendChild(liveText('div', 'prow', () => 'Scaffali: ' + sumOf(b.store) + ' / ' + cap));
    box.appendChild(bar(() => sumOf(b.store), cap));
    box.appendChild(goodsList(() => b.store, 'Scaffali vuoti.'));
    box.appendChild(liveText('div', 'pwarn', () => b.empty ? 'Scaffali vuoti: mandagli merce o mettila in un magazzino.' : ''));
    const sells = Object.keys(GOODS).filter(g => shopOf(g) === b.kind);
    const row = el('div', 'prow pwrapicons', 'Vende: ');
    for (const g of sells) { const im = goodImg(g); im.title = GOODS[g].name; row.appendChild(im); }
    box.appendChild(row);
    box.appendChild(el('div', 'pnote', 'Si rifornisce anche dai magazzini. Tasse: ' + Math.round(TAX_RATE * 100) + '% del prezzo.'));
  }
}

// aggiornamento del pannello aperto (chiamato dal ciclo del gioco)
function panelUpdate(dt) {
  if (!panelIsOpen()) return;
  panelTimer -= dt;
  if (panelTimer > 0) return;
  panelTimer = 0.25;
  const b = game.selected && game.buildings.get(game.selected);
  if (!b) { closePanel(); return; }
  const typing = document.activeElement && document.activeElement.classList.contains('pnameinput');
  if (panelShapeOf(b) !== panelShape && !typing) renderPanel();   // è cambiato qualcosa di importante (non mentre si scrive il nome)
  else for (const f of panelLive) f();                  // solo numeri e barre
}

// ---------- Modalità campi ----------
function enterFieldMode(farm) {
  game.fieldMode = farm.id;
  setTool('field');
  game.fieldMode = farm.id; // setTool potrebbe averla chiusa
  const fb = document.getElementById('fieldbar');
  fb.hidden = false;
  document.getElementById('fieldbar-text').textContent =
    buildingName(farm) + ' #' + farm.id + ': trascina sul terreno per mettere i campi (dentro il riquadro tratteggiato).';
  requestDraw();
}

function exitFieldMode(keepTool) {
  game.fieldMode = null;
  document.getElementById('fieldbar').hidden = true;
  if (!keepTool) setTool('hand');
  requestDraw();
}

// appena piazzata una fattoria si scelgono i suoi campi
function onFarmPlaced(b) { enterFieldMode(b); }

function initPanel() {
  document.getElementById('rotate-btn').addEventListener('click', e => { rotateTool(); e.target.blur(); });
  document.getElementById('fieldbar-done').addEventListener('click', () => exitFieldMode());
}
