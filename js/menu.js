// ---------- Menu (principale e pausa) ----------
// Ordine: Riprendi e Salva (solo durante una partita), Nuova mappa, Carica mappa, Opzioni, Esci.
let menuOpen = false;

function menuIsOpen() { return menuOpen; }
function $(id) { return document.getElementById(id); }

function showMenuPage(page) {
  for (const el of document.querySelectorAll('.menu-page')) el.hidden = el.dataset.page !== page;
  $('menu-msg').textContent = '';
  $('menu-sub').textContent = game.started ? TR('Pausa') : TR('Menu principale');
  if (page === 'main') {
    $('m-resume').hidden = !game.started;
    $('m-save').hidden = !game.started;
  }
  if (page === 'load') renderSaveList();
  if (page === 'new') for (const sz of MAP_SIZES) { const b = $('m-size-' + sz.size); if (b) b.textContent = sz.name + ' - ' + sz.size + ' x ' + sz.size; }
  if (page === 'options') renderLangList();
}

// Scelta della lingua (menu Opzioni): si cambia subito, anche a partita aperta
function renderLangList() {
  const box = $('lang-list');
  box.textContent = '';
  for (const [id, name] of Object.entries(LANGS)) {
    const b = document.createElement('button');
    b.id = 'lang-' + id;
    b.textContent = name;
    if (id === LANG) b.classList.add('active');
    b.addEventListener('click', () => { setLanguage(id); renderLangList(); });
    box.appendChild(b);
  }
}

function openMenu(page = 'main') {
  menuOpen = true;
  $('menu').hidden = false;
  game.hover = null;
  showMenuPage(page);
  requestDraw();
}

function closeMenu() {
  if (!game.started) return; // senza una mappa si resta nel menu
  menuOpen = false;
  $('menu').hidden = true;
}

function menuMessage(msg) { $('menu-msg').textContent = msg; }

function confirmLoseChanges() {
  return !game.started || !game.dirty || confirm(TR('Le modifiche non salvate andranno perse. Continuare?'));
}

function enterGame() {
  centerCamera();
  refreshLocks();
  setTool('hand');
  updateHud(); updateInfo();
  requestDraw();
  closeMenu();
}

// "Nuova mappa" apre la scelta della grandezza; la mappa si crea quando se ne sceglie una
function startNewMap(size) {
  if (!confirmLoseChanges()) return;
  menuMessage(TR('Creazione della mappa {n} x {n}...', { n: size }));
  // lascia al browser il tempo di mostrare il messaggio prima del calcolo
  setTimeout(() => {
    newGame(Math.floor(Math.random() * 100000), size);
    game.started = true;
    if (panelIsOpen()) closePanel();
    enterGame();
  }, 30);
}

function buildSizeChoices() {
  const box = $('size-list');
  for (const s of MAP_SIZES) {
    const b = document.createElement('button');
    b.id = 'm-size-' + s.size;
    b.textContent = s.name + ' - ' + s.size + ' x ' + s.size;
    b.dataset.size = s.size;
    b.addEventListener('click', () => startNewMap(s.size));
    box.appendChild(b);
  }
}

function saveFromMenu() {
  menuMessage(saveGame() ? TR('Partita salvata.') : TR('Impossibile salvare: spazio pieno o non disponibile.'));
  updateHud();
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(LOCALE()) + ' ' + d.toLocaleTimeString(LOCALE(), { hour: '2-digit', minute: '2-digit' });
}

function renderSaveList() {
  const box = $('save-list');
  box.textContent = '';
  const saves = readSaves();
  if (!saves.length) {
    const p = document.createElement('p');
    p.className = 'menu-note';
    p.textContent = TR('Nessuna partita salvata. Durante una partita usa "Salva partita" nel menu (Esc).');
    box.appendChild(p);
    return;
  }
  for (const s of saves) {
    const row = document.createElement('div');
    row.className = 'save-row';
    const info = document.createElement('div');
    info.className = 'save-info';
    const name = document.createElement('b');
    name.textContent = s.name;
    const meta = document.createElement('span');
    meta.textContent = formatDate(s.date) + ' - ' + (s.size || 128) + 'x' + (s.size || 128) + ', ' +
      TR('{r} strade, {h} case', { r: s.roads, h: s.houses });
    info.append(name, meta);
    const load = document.createElement('button');
    load.textContent = TR('Carica');
    load.addEventListener('click', () => {
      if (!confirmLoseChanges()) return;
      if (loadGame(s.id)) enterGame(); else menuMessage(TR('Salvataggio non leggibile.'));
    });
    const del = document.createElement('button');
    del.textContent = TR('Elimina');
    del.className = 'danger';
    del.addEventListener('click', () => {
      if (confirm(TR('Eliminare "{n}"?', { n: s.name }))) { deleteSave(s.id); renderSaveList(); }
    });
    row.append(info, load, del);
    box.appendChild(row);
  }
}

function exitGame() {
  if (!confirmLoseChanges()) return;
  if (navigator.userAgent.includes('Electron')) window.close();
  else menuMessage(TR('Nella versione web chiudi la scheda del browser per uscire.'));
}

function initMenu() {
  $('m-resume').addEventListener('click', closeMenu);
  $('m-save').addEventListener('click', saveFromMenu);
  $('m-new').addEventListener('click', () => showMenuPage('new'));
  buildSizeChoices();
  $('m-load').addEventListener('click', () => showMenuPage('load'));
  $('m-options').addEventListener('click', () => showMenuPage('options'));
  $('m-exit').addEventListener('click', exitGame);
  for (const b of document.querySelectorAll('.m-back')) b.addEventListener('click', () => showMenuPage('main'));
  $('menu-btn').addEventListener('click', e => { openMenu(); e.target.blur(); });

  // Esc: apre il menu durante la partita; nel menu torna indietro o riprende
  addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!menuOpen) {
      if (typeof manualIsOpen === 'function' && manualIsOpen()) { closeManual(); return; }
      if (progressIsOpen()) { closeProgress(); return; }
      if (!document.getElementById('submenu').hidden) { closeSubmenu(); return; }
      if (game.fieldMode) { exitFieldMode(); return; }
      if (panelIsOpen()) { closePanel(); return; }
    }
    if (!menuOpen) { if (game.started) openMenu(); return; }
    const page = document.querySelector('.menu-page:not([hidden])').dataset.page;
    if (page !== 'main') showMenuPage('main'); else closeMenu();
  });
}
