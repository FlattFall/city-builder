// ---------- Avvio del gioco ----------
function resize() {
  // altezza vera dello schermo visibile (sul telefono 100vh comprende le barre del browser e la X del
  // manuale finiva fuori: segnalazione dell'utente)
  document.documentElement.style.setProperty('--app-h', innerHeight + 'px');
  view.w = canvas.width = innerWidth;
  view.h = canvas.height = innerHeight;
  requestDraw();
}
addEventListener('resize', resize);
if (window.visualViewport) visualViewport.addEventListener('resize', resize);
addEventListener('orientationchange', () => setTimeout(resize, 200));

let lastTime = performance.now(), lastWaterFrame = 0;
function loop(now) {
  const dt = Math.max(0, ((now || performance.now()) - lastTime) / 1000);
  lastTime = now || performance.now();
  panWithKeys(Math.min(dt, 0.05));
  // velocità del gioco: 0 = fermo, 1 normale, 2 veloce, 5 super rapido (a passi piccoli, così i veicoli non saltano)
  let left = dt * (game.speed ?? 1);
  while (left > 1e-6) { const st = Math.min(left, 0.1); simUpdate(st); left -= st; }
  panelUpdate(dt);
  statsUpdate(dt);
  // l'acqua si anima ~8 volte al secondo (solo se si vede e lo zoom è vicino: da lontano costerebbe troppo)
  // pale eoliche, pompe, fumo e navi: ~30 volte al secondo, così girano lisce anche con il mouse fermo
  // (prima andavano insieme all'acqua a 8 volte al secondo e sembravano a scatti)
  const every = animSeen ? 33 : 125;
  if ((waterSeen || animSeen) && zoomLevel() >= 1 && lastTime - lastWaterFrame > every) { lastWaterFrame = lastTime; needsDraw = true; }
  if (needsDraw) { needsDraw = false; drawFrame(); }
  requestAnimationFrame(loop);
}

resize();
// All'avvio una mappa casuale fa da sfondo al menu principale (non è ancora una partita)
newGame(Math.floor(Math.random() * 100000));
centerCamera();
initLanguage();   // lingua scelta l'ultima volta (i18n.js): prima di costruire la barra
buildToolbar();
initMenu();
initPanel();
initProgress();
initStats();
initManual();
initBugReport();
initSettings();   // tasti e volume (settings.js)
initMusic();      // musica (music.js)
updateHud();
updateInfo();
refreshSpeed();
openMenu('main');
loop();
