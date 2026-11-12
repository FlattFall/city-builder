// ---------- Input: mouse e tastiera ----------
// Sinistro = usa lo strumento (con "Mano": trascina la mappa)
// Destro o centrale (trascinando) = muovi la mappa

let panning = false, painting = false, lastX = 0, lastY = 0, lastTile = null;
let bridgeStart = null;            // prima testa del ponte (si trascina, oppure clic e poi clic sull'altra sponda)
let bridgeDown = false;            // tasto premuto durante il ponte
const paintedNow = new Set();      // tile fatti in questa passata (per girare la freccia del senso unico)

// Percorso a 4 direzioni tra due tile, così le strade trascinate restano collegate
function tilePath(a, b) {
  const out = [{ x: a.x, y: a.y }];
  let x = a.x, y = a.y;
  while (x !== b.x || y !== b.y) {
    const dx = b.x - x, dy = b.y - y;
    if (Math.abs(dx) >= Math.abs(dy)) x += Math.sign(dx); else y += Math.sign(dy);
    out.push({ x, y });
  }
  return out;
}

function paintTo(tile) {
  // gli edifici grandi si piazzano uno per clic; percorsi, campi, case e ruspa si trascinano
  const big = BUILDINGS[game.tool] && BUILDINGS[game.tool].w > 1;
  if (big && lastTile) return;
  const path = (lastTile && (!BUILDINGS[game.tool] || game.tool === 'pylon' || game.tool === 'pole')) ? tilePath(lastTile, tile) : [tile];
  let changed = false, prev = lastTile;
  for (const p of path) {
    if (lastTile && p.x === lastTile.x && p.y === lastTile.y) continue;
    if (game.tool === 'demolish') {
      // la ruspa: il primo clic decide cosa si toglie; trascinando si toglie solo quel tipo di cosa
      game.pickDeck = p.deck !== undefined ? p.deck : game.demolishCat === 'bridge';
      const what = demolishTarget(p.x, p.y);
      if (!lastTile) game.demolishCat = what;
      else if (what !== game.demolishCat || what === 'bridge' || what === 'tunnel') { prev = p; continue; }
    }
    if (game.tool === 'oneway') {
      // il senso unico va nella direzione in cui si trascina; il primo tile si gira al secondo passo
      if (prev) {
        game.pathDir = DIRS.findIndex(D => D.dx === p.x - prev.x && D.dy === p.y - prev.y);
        const pt = game.map[prev.y][prev.x];
        if (paintedNow.has(prev.y * game.size + prev.x) && pt.path === 'oneway') pt.dir = game.pathDir;
      } else game.pathDir = rotationDir();
    }
    // un edificio con della merce dentro: prima si chiede se si è sicuri (la merce si perde)
    if (game.tool === 'demolish' && game.demolishCat === 'building') {
      const b = game.map[p.y][p.x].building;
      if (b && goodsInside(b) > 0) {
        const pick = { x: p.x, y: p.y, deck: game.pickDeck };
        painting = false; lastTile = null;
        askDemolish(b, () => {
          game.pickDeck = pick.deck;
          const r2 = useTool('demolish', pick.x, pick.y);
          if (r2.ok) { game.dirty = true; updateHud(); requestDraw(); if (r2.refund) toast(TR('Demolito: ti ridanno {m}', { m: money(r2.refund) })); } else if (r2.msg) toast(r2.msg);
        });
        if (changed) { updateHud(); requestDraw(); }
        return;
      }
    }
    // tralicci trascinati: uno ogni ELEC.pylonSpacing tile (non uno per casella)
    const spacing = game.tool === 'pylon' ? ELEC.pylonSpacing : game.tool === 'pole' ? ELEC.poleSpacing : 0;   // tralicci e pali: uno ogni tot tile
    if (spacing && game.lastPylon && Math.hypot(p.x - game.lastPylon.x, p.y - game.lastPylon.y) < spacing) { prev = p; continue; }
    const r = useTool(game.tool, p.x, p.y);
    if (r.ok && spacing) game.lastPylon = { x: p.x, y: p.y };
    if (r.ok) { changed = true; game.dirty = true; paintedNow.add(p.y * game.size + p.x); if (r.refund) toast(TR('Demolito: ti ridanno {m}', { m: money(r.refund) })); }
    else if (r.msg) toast(r.msg);
    prev = p;
  }
  lastTile = tile;
  if (changed) { updateHud(); requestDraw(); }
}

canvas.addEventListener('contextmenu', e => e.preventDefault());

let downX = 0, downY = 0, handDown = false;

canvas.addEventListener('mousedown', e => {
  closeSubmenu();
  if (e.button === 2 && bridgeStart) { bridgeStart = null; game.bridgePlan = null; requestDraw(); return; }   // annulla il ponte
  if (e.button === 1 || e.button === 2 || (e.button === 0 && game.tool === 'hand')) {
    panning = true; lastX = e.clientX; lastY = e.clientY;
    downX = e.clientX; downY = e.clientY; handDown = e.button === 0;
    canvas.style.cursor = 'grabbing';
  } else if (e.button === 0 && isBridgeTool(game.tool)) {
    // ponte: si preme sulla prima sponda e si trascina fino all'altra (oppure un clic per sponda)
    const tile = pickTile(e.clientX, e.clientY);
    if (!tile) return;
    bridgeDown = true;
    if (!bridgeStart) bridgeStart = tile;
    game.bridgePlan = planBridge(bridgeStart, tile, game.tool === 'hwBridge' ? 'highway' : 'road');
    requestDraw();
  } else if (e.button === 0 && game.tool === 'tunnel') {
    // tunnel: un clic ai piedi della collina; l'anteprima mostra già da dove esce
    const tile = pickTile(e.clientX, e.clientY);
    const plan = tile && planTunnel(tile, rotationDir());
    if (!plan) return;
    const r = buildBridge(plan);
    if (r.ok) { game.dirty = true; updateHud(); toast(TR('Tunnel costruito')); }
    else if (r.msg) toast(r.msg);
    game.bridgePlan = planTunnel(tile, rotationDir());
    requestDraw();
  } else if (e.button === 0) {
    painting = true;
    paintedNow.clear();
    // strade: si trasformano quelle esistenti solo se la passata parte da una strada (es. strada -> autostrada)
    const t0 = pickTile(e.clientX, e.clientY);
    game.convertRoads = !!(t0 && PATHS[game.tool] && netOf(pathAt(t0.x, t0.y)) === 'road' && PATHS[game.tool].net === 'road');
    lastTile = null;
    game.levelTarget = null; // Livella: la quota la decide il primo tile
    startTerrainStroke();     // ogni passata = un passo da annullare con Ctrl+Z
    game.lastPylon = null;
    const tile = pickTile(e.clientX, e.clientY);
    if (tile) paintTo(tile);
  }
});

addEventListener('mouseup', e => {
  // con la Mano, un clic (senza trascinare) su un edificio apre il suo pannello
  if (handDown && Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) < 5 && !menuIsOpen()) {
    const t = pickTile(e.clientX, e.clientY);
    const b = t && game.map[t.y][t.x].building;
    if (b) openBuildingPanel(b); else if (panelIsOpen()) closePanel();
  }
  handDown = false;
  if (bridgeStart && bridgeDown) {
    bridgeDown = false;
    const plan = game.bridgePlan;
    if (plan && plan.tiles.length > 1) {   // c'è anche l'altra sponda: si costruisce (o si spiega perché no)
      const r = buildBridge(plan);
      if (r.ok) { game.dirty = true; updateHud(); } else if (r.msg) toast(r.msg);
      bridgeStart = null; game.bridgePlan = null;
    } else toast(TR("Ora clicca sull'altra sponda (tasto destro per annullare)"));
    requestDraw();
  }
  panning = false; painting = false; lastTile = null;
  game.convertRoads = undefined; game.pickDeck = undefined;
  canvas.style.cursor = game.tool === 'hand' ? 'grab' : 'crosshair';
});

let mouseX = 0, mouseY = 0;
addEventListener('mousemove', e => {
  mouseX = e.clientX; mouseY = e.clientY;
  if (menuIsOpen()) return;
  if (panning) {
    cam.x += e.clientX - lastX; cam.y += e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
  }
  game.hover = pickTile(e.clientX, e.clientY);
  if (painting && game.hover) paintTo(game.hover);
  if (bridgeStart && game.hover) game.bridgePlan = planBridge(bridgeStart, game.hover, game.tool === 'hwBridge' ? 'highway' : 'road');
  if (game.tool === 'tunnel') game.bridgePlan = game.hover ? planTunnel(game.hover, rotationDir()) : null;
  if (bridgeStart) setPlanMsg(game.bridgePlan);
  updateInfo();
  requestDraw();
});

canvas.addEventListener('wheel', e => {
  e.preventDefault();
  zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1 : -1);
  game.hover = pickTile(e.clientX, e.clientY);
  requestDraw();
}, { passive: false });

// (Esc apre il menu: vedi menu.js. Nuova mappa e caricamento sono nel menu.)
// Movimento con WASD/frecce: si tiene conto dei tasti premuti in questo momento e la mappa
// scorre in modo continuo a ogni fotogramma (anche in diagonale, es. W + A insieme)
// (i tasti si scelgono nelle Opzioni: keyOf / actionOfKey / panDir in settings.js)
const PAN_SPEED = 900; // pixel dello schermo al secondo
const keysHeld = new Set();

// ---------- Conferma prima di demolire un edificio con della merce ----------
function goodsInside(b) { return sumOf(b.store || {}) + sumOf(b.input || {}); }
let confirmYes = null;
function confirmIsOpen() { return !document.getElementById('confirm').hidden; }
function closeConfirm() { document.getElementById('confirm').hidden = true; confirmYes = null; }
function askDemolish(b, yes) {
  const box = document.getElementById('confirm');
  document.getElementById('confirm-title').textContent = TR('Demolire {b}?', { b: buildingName(b) });
  const list = document.getElementById('confirm-goods');
  list.textContent = '';
  const all = {};
  for (const m of [b.store || {}, b.input || {}]) for (const [g, q] of Object.entries(m)) if (q > 0) all[g] = (all[g] || 0) + q;
  for (const [g, q] of Object.entries(all)) {
    const row = document.createElement('span');
    row.className = 'cgood';
    const img = document.createElement('img');
    img.src = GOOD_ICONS[g]; img.alt = GOODS[g].name;
    row.append(img, document.createTextNode(GOODS[g].name + ' ' + Math.floor(q)));
    list.appendChild(row);
  }
  document.getElementById('confirm-text').textContent = TR('Dentro ci sono {n} unità di merce: se lo demolisci le perdi.', { n: Math.floor(goodsInside(b)) });
  confirmYes = yes;
  box.hidden = false;
  document.getElementById('confirm-yes').focus();
}
document.getElementById('confirm-yes').addEventListener('click', () => { const f = confirmYes; closeConfirm(); if (f) f(); });
document.getElementById('confirm-no').addEventListener('click', closeConfirm);
document.getElementById('confirm').addEventListener('mousedown', e => { if (e.target.id === 'confirm') closeConfirm(); });
addEventListener('keydown', e => {   // con la domanda aperta: Invio = sì, Esc = no, il resto è fermo
  if (!confirmIsOpen()) return;
  e.preventDefault(); e.stopImmediatePropagation();
  if (e.key === 'Escape') closeConfirm();
  else if (e.key === 'Enter') document.getElementById('confirm-yes').click();
}, true);

// ---------- Velocità del gioco: pausa, normale, veloce, super rapido ----------
const SPEED_NAMES = { 0: 'Pausa (Spazio)', 1: 'Normale', 2: 'Veloce', 5: 'Super rapido' };
function setSpeed(n) {
  game.speed = n;
  refreshSpeed();
}
function refreshSpeed() {
  for (const b of document.querySelectorAll('#speed-btns button')) {
    b.classList.toggle('active', +b.dataset.speed === (game.speed ?? 1));
    b.title = TR(SPEED_NAMES[b.dataset.speed]);
  }
}
for (const b of document.querySelectorAll('#speed-btns button')) b.addEventListener('click', () => { setSpeed(+b.dataset.speed); b.blur(); });
let speedBeforePause = 1;
function togglePause() {
  if ((game.speed ?? 1) === 0) setSpeed(speedBeforePause || 1);
  else { speedBeforePause = game.speed ?? 1; setSpeed(0); }
  toast(game.speed === 0 ? TR('Gioco in pausa (Spazio per riprendere)') : TR('Il gioco riprende'));
}

addEventListener('keydown', e => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;   // si sta scrivendo un nome
  if (menuIsOpen()) return; // con il menu aperto la tastiera non comanda il gioco
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z' && game.started) {   // annulla l'ultima modifica del terreno
    e.preventDefault();
    if (undoTerrain()) { game.dirty = true; updateHud(); requestDraw(); toast(TR('Terreno com\'era prima (Ctrl+Z)')); }
    else toast(TR('Niente da annullare: Ctrl+Z annulla solo le modifiche del terreno'));
    return;
  }
  if (!e.repeat && game.started && cheatTyped(k)) return;   // "makemoney" scritto in partita: sblocca tutto (per le prove)
  const act = actionOfKey(k);
  if (!e.repeat && act === 'manual') { toggleManual(); return; }
  if (!e.repeat && act === 'progress') { toggleProgress(); return; }
  if (!e.repeat && act === 'stats') { toggleStats(); return; }
  if (!e.repeat && act === 'underground') { toggleUnderground(); return; }
  if (!e.repeat && act === 'pause' && game.started) { e.preventDefault(); togglePause(); return; }   // pausa
  if (manualIsOpen() || progressIsOpen() || statsIsOpen()) return;   // con manuale o progressi aperti il resto è fermo
  if (panDir(k)) { keysHeld.add(k); e.preventDefault(); return; }
  if (e.repeat) return;
  if (selectGroupByKey(e.key)) { /* strumento scelto */ }
  else if (act === 'rotate') rotateTool();
});
addEventListener('keyup', e => keysHeld.delete(e.key.toLowerCase()));
addEventListener('blur', () => keysHeld.clear()); // la finestra perde il fuoco: niente tasti "incollati"

function panWithKeys(dt) {
  if (!keysHeld.size || menuIsOpen()) return;
  let dx = 0, dy = 0;
  for (const k of keysHeld) { const d = panDir(k); if (d) { dx += d[0]; dy += d[1]; } }
  if (!dx && !dy) return;
  const len = Math.hypot(dx, dy); // in diagonale stessa velocità
  cam.x += dx / len * PAN_SPEED * dt;
  cam.y += dy / len * PAN_SPEED * dt;
  clampCamera();
  if (game.hover) { game.hover = pickTile(mouseX, mouseY); updateInfo(); }
  requestDraw();
}
