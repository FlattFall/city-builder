// ---------- Menu (principale e pausa) ----------
// Ordine: Riprendi e Salva (solo durante una partita), Nuova mappa, Carica mappa, Opzioni, Esci.
let menuOpen = false;

function menuIsOpen() { return menuOpen; }
function $(id) { return document.getElementById(id); }

function showMenuPage(page) {
  for (const el of document.querySelectorAll('.menu-page')) el.hidden = el.dataset.page !== page;
  $('menu-msg').textContent = '';
  if (page === 'main') {
    $('m-resume').hidden = !game.started;
    $('m-save').hidden = !game.started;
    $('menu-sub').textContent = game.started ? 'Pausa' : 'Menu principale';
  }
  if (page === 'load') renderSaveList();
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
  return !game.started || !game.dirty || confirm('Le modifiche non salvate andranno perse. Continuare?');
}

function enterGame() {
  centerCamera();
  setTool('hand');
  updateHud(); updateInfo();
  requestDraw();
  closeMenu();
}

// "Nuova mappa" apre la scelta della grandezza; la mappa si crea quando se ne sceglie una
function startNewMap(size) {
  if (!confirmLoseChanges()) return;
  newGame(Math.floor(Math.random() * 100000), size);
  game.started = true;
  enterGame();
}

function buildSizeChoices() {
  const box = $('size-list');
  for (const s of MAP_SIZES) {
    const b = document.createElement('button');
    b.id = 'm-size-' + s.size;
    b.textContent = s.name + ' - ' + s.size + ' x ' + s.size;
    b.addEventListener('click', () => startNewMap(s.size));
    box.appendChild(b);
  }
}

function saveFromMenu() {
  menuMessage(saveGame() ? 'Partita salvata.' : 'Impossibile salvare: spazio pieno o non disponibile.');
  updateHud();
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('it-IT') + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function renderSaveList() {
  const box = $('save-list');
  box.textContent = '';
  const saves = readSaves();
  if (!saves.length) {
    const p = document.createElement('p');
    p.className = 'menu-note';
    p.textContent = 'Nessuna partita salvata. Durante una partita usa "Salva partita" nel menu (Esc).';
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
      s.roads + ' strade, ' + s.houses + ' case';
    info.append(name, meta);
    const load = document.createElement('button');
    load.textContent = 'Carica';
    load.addEventListener('click', () => {
      if (!confirmLoseChanges()) return;
      if (loadGame(s.id)) enterGame(); else menuMessage('Salvataggio non leggibile.');
    });
    const del = document.createElement('button');
    del.textContent = 'Elimina';
    del.className = 'danger';
    del.addEventListener('click', () => {
      if (confirm('Eliminare "' + s.name + '"?')) { deleteSave(s.id); renderSaveList(); }
    });
    row.append(info, load, del);
    box.appendChild(row);
  }
}

function exitGame() {
  if (!confirmLoseChanges()) return;
  if (navigator.userAgent.includes('Electron')) window.close();
  else menuMessage('Nella versione web chiudi la scheda del browser per uscire.');
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
    if (!document.getElementById('submenu').hidden) { closeSubmenu(); return; }
    if (!menuOpen) { if (game.started) openMenu(); return; }
    const page = document.querySelector('.menu-page:not([hidden])').dataset.page;
    if (page !== 'main') showMenuPage('main'); else closeMenu();
  });
}
