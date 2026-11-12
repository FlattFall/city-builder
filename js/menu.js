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
    $('m-tutorial').hidden = !game.started;
  }
  if (page === 'load') renderSaveList();
  if (page === 'new') sizeLabels();
  if (page === 'options') { renderLangList(); renderSettings(); }
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
    maybeStartTutorial();   // tutorial o gioca subito (richiesta dell'utente)
  }, 30);
}

// Nuova mappa: una scheda per grandezza con un'isola in miniatura (più grande per le mappe grandi)
function buildSizeChoices() {
  const box = $('size-list');
  MAP_SIZES.forEach((s, i) => {
    const b = document.createElement('button');
    b.id = 'm-size-' + s.size;
    b.className = 'size-card';
    const cv = document.createElement('canvas');
    cv.width = 150; cv.height = 84;
    drawMapPreview(cv, s.preview, 4242 + i * 17, 0.55 + i * 0.15);
    const name = document.createElement('b'), dim = document.createElement('span'), desc = document.createElement('small');
    dim.className = 'size-dim';
    b.append(cv, name, dim, desc);
    b.addEventListener('click', () => startNewMap(s.size));
    box.appendChild(b);
  });
  sizeLabels();
}
function sizeLabels() {
  for (const s of MAP_SIZES) {
    const b = $('m-size-' + s.size);
    if (!b) continue;
    b.querySelector('b').textContent = s.name;
    b.querySelector('.size-dim').textContent = s.size + ' × ' + s.size;
    b.querySelector('small').textContent = s.desc;
  }
}

// Isola isometrica in miniatura (terreno vero generato piccolo): n tile per lato, scale = grandezza nel riquadro
function drawMapPreview(cv, n, seed, scale) {
  const c = cv.getContext('2d'), map = generateTerrain(seed, n);
  const tw = 136 * (scale || 1) / n, th = tw / 2, step = th * 0.55;
  const ox = cv.width / 2, oy = 10 + (84 - 10 - n * th) / 2;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const t = map[y][x], h = t.elev * step;
    const cx = ox + (x - y) * tw / 2, cy = oy + (x + y) * th / 2 - h;
    const col = COLORS[t.type];
    const top = [[cx, cy], [cx + tw / 2, cy + th / 2], [cx, cy + th], [cx - tw / 2, cy + th / 2]];
    const fill = (pts, color) => { c.fillStyle = color; c.beginPath(); c.moveTo(...pts[0]); for (const p of pts.slice(1)) c.lineTo(...p); c.closePath(); c.fill(); };
    if (h > 0) {   // fianchi davanti (solo dove si vedono, fino a terra)
      fill([[cx - tw / 2, cy + th / 2], [cx, cy + th], [cx, cy + th + h], [cx - tw / 2, cy + th / 2 + h]], col[1]);
      fill([[cx, cy + th], [cx + tw / 2, cy + th / 2], [cx + tw / 2, cy + th / 2 + h], [cx, cy + th + h]], col[2]);
    }
    fill(top, col[0]);
    if (t.type === T.FOREST) { c.fillStyle = '#2f6b2a'; c.beginPath(); c.arc(cx, cy + th / 2 - tw * 0.18, tw * 0.22, 0, Math.PI * 2); c.fill(); }
  }
}
// Salva: prima si sceglie il nome della partita (richiesta dell'utente)
function saveFromMenu() {
  showMenuPage('save');
  const inp = $('save-name');
  inp.value = currentSaveName();
  $('save-new').hidden = !game.saveId;   // "Salva come nuova" solo se la partita viene già da un salvataggio
  inp.focus(); inp.select();
}
function doSave(asNew) {
  const ok = saveGame($('save-name').value, asNew);
  showMenuPage('main');
  menuMessage(ok ? TR('Partita salvata: "{n}".', { n: currentSaveName() }) : TR('Impossibile salvare: spazio pieno o non disponibile.'));
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
    const ren = document.createElement('button');
    ren.textContent = '✎';
    ren.title = TR('Cambia nome');
    ren.addEventListener('click', () => {   // il nome diventa un campo da scrivere
      const inp = document.createElement('input');
      inp.className = 'save-rename'; inp.value = s.name; inp.maxLength = 40;
      const done = ok => { if (ok && renameSave(s.id, inp.value)) s.name = inp.value.trim(); renderSaveList(); };
      inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); });
      inp.addEventListener('blur', () => done(true));
      name.replaceWith(inp); inp.focus(); inp.select();
    });
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
    row.append(info, ren, load, del);
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
  $('m-tutorial').addEventListener('click', () => { closeMenu(); openTutorial(1); });   // tutorial dal menu (riparte dal primo passo)
  $('save-ok').addEventListener('click', () => doSave(false));
  $('save-new').addEventListener('click', () => doSave(true));
  $('save-name').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') doSave(false); if (e.key === 'Escape') showMenuPage('main'); });
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
      if (statsIsOpen()) { closeStats(); return; }
      if (!document.getElementById('submenu').hidden) { closeSubmenu(); return; }
      if (game.fieldMode) { exitFieldMode(); return; }
      if (panelIsOpen()) { closePanel(); return; }
    }
    if (!menuOpen) { if (game.started) openMenu(); return; }
    const page = document.querySelector('.menu-page:not([hidden])').dataset.page;
    if (page !== 'main') showMenuPage('main'); else closeMenu();
  });
}
