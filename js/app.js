// ---------- Avvio del gioco ----------
function resize() {
  view.w = canvas.width = innerWidth;
  view.h = canvas.height = innerHeight;
  requestDraw();
}
addEventListener('resize', resize);

let lastTime = performance.now();
function loop(now) {
  const dt = Math.max(0, ((now || performance.now()) - lastTime) / 1000);
  lastTime = now || performance.now();
  simUpdate(dt);
  panelUpdate(dt);
  if (needsDraw) { needsDraw = false; drawFrame(); }
  requestAnimationFrame(loop);
}

resize();
// All'avvio una mappa casuale fa da sfondo al menu principale (non è ancora una partita)
newGame(Math.floor(Math.random() * 100000));
centerCamera();
buildToolbar();
initMenu();
initPanel();
updateHud();
updateInfo();
openMenu('main');
loop();
