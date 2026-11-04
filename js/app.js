// ---------- Avvio del gioco ----------
function resize() {
  view.w = canvas.width = innerWidth;
  view.h = canvas.height = innerHeight;
  requestDraw();
}
addEventListener('resize', resize);

let lastTime = performance.now(), lastWaterFrame = 0;
function loop(now) {
  const dt = Math.max(0, ((now || performance.now()) - lastTime) / 1000);
  lastTime = now || performance.now();
  panWithKeys(Math.min(dt, 0.05));
  simUpdate(dt);
  panelUpdate(dt);
  // l'acqua si anima ~8 volte al secondo (solo se si vede e lo zoom è vicino: da lontano costerebbe troppo)
  if (waterSeen && zoomLevel() >= 1 && lastTime - lastWaterFrame > 125) { lastWaterFrame = lastTime; needsDraw = true; }
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
