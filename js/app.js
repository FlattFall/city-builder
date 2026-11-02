// ---------- Avvio del gioco ----------
function resize() {
  view.w = canvas.width = innerWidth;
  view.h = canvas.height = innerHeight;
  requestDraw();
}
addEventListener('resize', resize);

function loop() {
  if (needsDraw) { needsDraw = false; drawFrame(); }
  requestAnimationFrame(loop);
}

resize();
// All'avvio una mappa casuale fa da sfondo al menu principale (non è ancora una partita)
newGame(Math.floor(Math.random() * 100000));
centerCamera();
buildToolbar();
initMenu();
updateHud();
updateInfo();
openMenu('main');
loop();
