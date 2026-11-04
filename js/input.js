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
  const path = (lastTile && !BUILDINGS[game.tool]) ? tilePath(lastTile, tile) : [tile];
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
    const r = useTool(game.tool, p.x, p.y);
    if (r.ok) { changed = true; game.dirty = true; paintedNow.add(p.y * game.size + p.x); }
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
    if (r.ok) { game.dirty = true; updateHud(); toast('Tunnel costruito'); }
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
    } else toast("Ora clicca sull'altra sponda (tasto destro per annullare)");
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
const PAN_KEYS = { w: [0, 1], arrowup: [0, 1], s: [0, -1], arrowdown: [0, -1],
  a: [1, 0], arrowleft: [1, 0], d: [-1, 0], arrowright: [-1, 0] };
const PAN_SPEED = 900; // pixel dello schermo al secondo
const keysHeld = new Set();

addEventListener('keydown', e => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;   // si sta scrivendo un nome
  if (menuIsOpen()) return; // con il menu aperto la tastiera non comanda il gioco
  const k = e.key.toLowerCase();
  if (!e.repeat && k === 'm') { toggleManual(); return; }
  if (!e.repeat && k === 'p') { toggleProgress(); return; }
  if (manualIsOpen() || progressIsOpen()) return;   // con manuale o progressi aperti il resto è fermo
  if (PAN_KEYS[k]) { keysHeld.add(k); e.preventDefault(); return; }
  if (e.repeat) return;
  if (selectGroupByKey(e.key)) { /* strumento scelto */ }
  else if (k === 'r') rotateTool();
});
addEventListener('keyup', e => keysHeld.delete(e.key.toLowerCase()));
addEventListener('blur', () => keysHeld.clear()); // la finestra perde il fuoco: niente tasti "incollati"

function panWithKeys(dt) {
  if (!keysHeld.size || menuIsOpen()) return;
  let dx = 0, dy = 0;
  for (const k of keysHeld) { dx += PAN_KEYS[k][0]; dy += PAN_KEYS[k][1]; }
  if (!dx && !dy) return;
  const len = Math.hypot(dx, dy); // in diagonale stessa velocità
  cam.x += dx / len * PAN_SPEED * dt;
  cam.y += dy / len * PAN_SPEED * dt;
  clampCamera();
  if (game.hover) { game.hover = pickTile(mouseX, mouseY); updateInfo(); }
  requestDraw();
}
