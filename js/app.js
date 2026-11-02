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
newGame(Math.floor(Math.random() * 100000));
centerCamera();
buildToolbar();
document.getElementById('regen').addEventListener('click', e => { newTerrain(); e.target.blur(); });
updateHud();
updateInfo();
requestDraw();
loop();
