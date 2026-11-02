// ---------- Pannello degli edifici e modalità campi ----------
// Con la Mano, un clic su un edificio apre il suo pannello:
//  - Fattoria: coltura (grano/carote/patate), campi, crescita, inventario, magazzino di destinazione
//  - Magazzino: scorte
//  - Casa: abitanti
let panelTimer = 0;
let panelLive = [];      // funzioni che aggiornano numeri e barre senza ricostruire i pulsanti
let panelShape = '';     // quando cambia (nuovo magazzino, coltura, ...) il pannello si ricostruisce

// testo che si aggiorna da solo
function liveText(tag, cls, fn) {
  const e = el(tag, cls, fn());
  panelLive.push(() => { const t = fn(); if (e.textContent !== t) e.textContent = t; });
  return e;
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
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

// cosa determina la forma del pannello (se cambia si ricostruisce)
function panelShapeOf(b) {
  if (!b) return '';
  const whs = [...game.buildings.values()].filter(w => w.kind === 'warehouse').map(w => w.id).join(',');
  return [b.id, b.crop, b.storage, b.fields, whs, b.residents >= HOUSE_CAPACITY, !!b.unreachable,
    b.inventory >= FARM.inventoryCap, !!b.incoming].join('|');
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

// Magazzini raggiungibili su strada dalla fattoria
function warehouseChoices(farm) {
  const from = accessTiles(farm);
  return [...game.buildings.values()].filter(w => w.kind === 'warehouse')
    .map(w => ({ w, ok: !!findRoute(from, accessTiles(w)) }));
}

function renderPanel() {
  const b = game.selected && game.buildings.get(game.selected);
  const box = document.getElementById('panel');
  if (!b) { closePanel(); return; }
  box.textContent = '';
  panelLive = [];
  panelShape = panelShapeOf(b);
  const head = el('div', 'phead');
  head.append(el('b', null, BUILDINGS[b.kind].name), el('span', 'pdim', ' #' + b.id));
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
  }

  if (b.kind === 'warehouse') {
    const tot = () => Object.values(b.stock).reduce((a, c) => a + c, 0);
    box.appendChild(liveText('div', 'prow', () => 'Scorte: ' + tot() + ' / ' + WAREHOUSE_CAPACITY));
    box.appendChild(bar(tot, WAREHOUSE_CAPACITY));
    for (const [id, c] of Object.entries(CROPS)) box.appendChild(liveText('div', 'prow', () => c.name + ': ' + b.stock[id]));
    if (!accessTiles(b).length) box.appendChild(el('div', 'pwarn', 'Nessuna strada accanto al magazzino.'));
  }

  if (b.kind === 'farm') {
    box.appendChild(el('div', 'plabel', 'Cosa coltivare'));
    const crops = el('div', 'pchoices');
    for (const [id, c] of Object.entries(CROPS)) {
      const btn = el('button', 'pchoice' + (b.crop === id ? ' active' : ''), c.name);
      btn.addEventListener('click', () => {
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
    box.appendChild(liveText('div', 'prow', () => 'Inventario: ' + b.inventory + ' / ' + FARM.inventoryCap + ' (' + CROPS[b.crop].name.toLowerCase() + ')'));
    box.appendChild(bar(() => b.inventory, FARM.inventoryCap));
    if (b.inventory >= FARM.inventoryCap) box.appendChild(el('div', 'pwarn', 'Inventario pieno: la crescita è ferma.'));

    box.appendChild(el('div', 'plabel', 'Dove portare il cibo'));
    const list = el('div', 'plist');
    const none = el('button', 'pchoice' + (!b.storage ? ' active' : ''), 'Nessun magazzino');
    none.addEventListener('click', () => { b.storage = null; renderPanel(); });
    list.appendChild(none);
    const choices = warehouseChoices(b);
    for (const { w, ok } of choices) {
      const btn = el('button', 'pchoice' + (b.storage === w.id ? ' active' : ''),
        'Magazzino #' + w.id + (ok ? ' - raggiungibile' : ' - nessuna strada'));
      if (!ok) btn.classList.add('bad');
      btn.addEventListener('click', () => { b.storage = w.id; b.retry = 0; b.status = ''; game.dirty = true; renderPanel(); });
      list.appendChild(btn);
    }
    box.appendChild(list);
    if (!choices.length) box.appendChild(el('div', 'pnote', 'Costruisci un magazzino alimenti (gruppo 4).'));
    if (b.storage) box.appendChild(liveText('div', 'pnote', () => b.status || (b.van ? 'Furgone in viaggio' : 'Il furgone parte con almeno ' + FARM.vanMinLoad + ' unità')));
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
  if (panelShapeOf(b) !== panelShape) renderPanel();   // è cambiato qualcosa di importante
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
    'Fattoria #' + farm.id + ': trascina sul terreno per mettere i campi (dentro il riquadro tratteggiato).';
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
  document.getElementById('fieldbar-done').addEventListener('click', () => exitFieldMode());
}
