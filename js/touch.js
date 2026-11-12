// ---------- Telefono e tablet (richiesta dell'utente: giocare anche sul telefono) ----------
// I tocchi diventano gli stessi eventi del mouse, così tutte le regole di input.js valgono uguali:
//  - un dito: usa lo strumento (con la Mano trascina la mappa; un tocco su un edificio apre il pannello)
//  - due dita: muovono la mappa e, allargandole o stringendole, cambiano lo zoom
//  - tenere premuto un dito fermo (ponte iniziato): annulla il ponte, come il tasto destro
// Un dito aspetta un attimo prima di partire: se arriva il secondo dito non si costruisce niente per sbaglio.
const TOUCH = { delay: 110, move: 10, pinch: 1.3, hold: 600 };
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');

let tState = null;   // { mode: 'wait' | 'one' | 'two', ... }
function mouseEv(type, x, y, button = 0) {
  const ev = new MouseEvent(type, { clientX: x, clientY: y, button, bubbles: true, cancelable: true });
  (type === 'mousedown' ? canvas : window).dispatchEvent(ev);
}
function touchMid(ts) { return [(ts[0].clientX + ts[1].clientX) / 2, (ts[0].clientY + ts[1].clientY) / 2]; }
function touchDist(ts) { return Math.hypot(ts[0].clientX - ts[1].clientX, ts[0].clientY - ts[1].clientY); }
function startOne() {
  if (!tState || tState.mode !== 'wait') return;
  clearTimeout(tState.timer);
  tState.mode = 'one';
  mouseEv('mousemove', tState.x0, tState.y0);   // così l'anteprima è già nel punto giusto
  mouseEv('mousedown', tState.x0, tState.y0);
  if (tState.x !== tState.x0 || tState.y !== tState.y0) mouseEv('mousemove', tState.x, tState.y);
}

canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  if (game.started) touchHint();
  const ts = e.touches;
  if (ts.length === 1 && !tState) {
    const t = ts[0];
    tState = { mode: 'wait', x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY, t0: performance.now() };
    tState.timer = setTimeout(startOne, TOUCH.delay);
    tState.holdTimer = setTimeout(() => {   // dito fermo a lungo con un ponte iniziato: si annulla
      if (tState && tState.mode !== 'two' && Math.hypot(tState.x - tState.x0, tState.y - tState.y0) < TOUCH.move && typeof bridgeStart !== 'undefined' && bridgeStart) {
        bridgeStart = null; game.bridgePlan = null; requestDraw(); toast(TR('Ponte annullato'));
      }
    }, TOUCH.hold);
  } else if (ts.length >= 2) {
    // secondo dito: si muove la mappa. Se il primo stava già costruendo, la passata si chiude lì.
    if (tState) { clearTimeout(tState.timer); clearTimeout(tState.holdTimer); if (tState.mode === 'one') { painting = false; mouseEv('mouseup', tState.x, tState.y); } }
    const [mx, my] = touchMid(ts);
    tState = { mode: 'two', mx, my, d: touchDist(ts) };
  }
}, { passive: false });

canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  if (!tState) return;
  const ts = e.touches;
  if (tState.mode === 'two') {
    if (ts.length < 2) return;
    const [mx, my] = touchMid(ts), d = touchDist(ts);
    cam.x += mx - tState.mx; cam.y += my - tState.my;
    tState.mx = mx; tState.my = my;
    // lo zoom va a scatti (come la rotella): un passo ogni volta che le dita si allargano o stringono abbastanza
    if (d > tState.d * TOUCH.pinch) { zoomAt(mx, my, 1); tState.d = d; }
    else if (d < tState.d / TOUCH.pinch) { zoomAt(mx, my, -1); tState.d = d; }
    requestDraw();
    return;
  }
  const t = ts[0];
  tState.x = t.clientX; tState.y = t.clientY;
  if (tState.mode === 'wait') {
    if (Math.hypot(tState.x - tState.x0, tState.y - tState.y0) > TOUCH.move) startOne();
    return;
  }
  mouseEv('mousemove', tState.x, tState.y);
}, { passive: false });

function touchEnd(e) {
  e.preventDefault();
  if (!tState) return;
  if (e.touches.length > 0) {
    // da due dita a una: si resta a muovere la mappa finché non si alzano tutte
    if (tState.mode === 'two' && e.touches.length === 1) { tState.mx = e.touches[0].clientX; tState.my = e.touches[0].clientY; tState.one = true; }
    return;
  }
  clearTimeout(tState.timer); clearTimeout(tState.holdTimer);
  if (tState.mode === 'wait') startOne();   // tocco veloce: un clic
  if (tState.mode === 'one') mouseEv('mouseup', tState.x, tState.y);
  tState = null;
}
canvas.addEventListener('touchend', touchEnd, { passive: false });
canvas.addEventListener('touchcancel', touchEnd, { passive: false });

// Primo avvio di una partita sul telefono: come si gioca con le dita
let touchHintShown = false;
function touchHint() {
  if (!isTouch || touchHintShown) return;
  touchHintShown = true;
  toast(innerHeight > innerWidth ? TR('Gira il telefono in orizzontale per giocare meglio') : TR('Un dito: usa lo strumento. Due dita: muovi la mappa e zoom'));
}

// Sul telefono i tasti tra parentesi ("Manuale (M)") non servono e occupano spazio: si tolgono
// (anche quando la lingua o i tasti cambiano e i pulsanti vengono riscritti)
// Sul telefono i pulsanti in alto mostrano solo l'icona (topicons.js; style.css body.touch .tlabel) e dal
// pulsante Ruota si toglie il tasto tra parentesi
if (isTouch) {
  const strip = () => {
    const b = document.getElementById('rotate-btn');
    const t = b.textContent, s = t.replace(/\s*\([^()]*\)\s*$/, '');
    if (s !== t) b.textContent = s;
  };
  new MutationObserver(strip).observe(document.getElementById('rotate-btn'), { subtree: true, childList: true, characterData: true });
  strip();
}

// Schermo intero (richiesta dell'utente): pulsante ⛶ nella barra in alto. Sul telefono gira anche in
// orizzontale dove il browser lo permette (Android). Su iPhone nessun browser ha lo schermo intero
// (Chrome compreso: su iPhone usano tutti il motore di Safari): il pulsante spiega come aggiungere il
// gioco alla schermata Home, da dove si apre senza le barre del browser (manifest.json).
function fullscreenOn() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
function fullscreenApi() { const el = document.documentElement; return !!((document.fullscreenEnabled || document.webkitFullscreenEnabled) && (el.requestFullscreen || el.webkitRequestFullscreen)); }
function isStandalone() { return navigator.standalone === true || matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches; }
function showHomeScreenHelp() {
  let box = document.getElementById('home-help');
  if (!box) {
    box = document.createElement('div');
    box.id = 'home-help'; box.className = 'overlay';
    box.innerHTML = '<div class="ov-box" style="max-width:420px"><div class="ov-head"><h2></h2><button class="ov-close">✕</button></div><div class="ov-body" style="padding:12px 16px;line-height:1.5;font-size:13px"></div></div>';
    document.body.appendChild(box);
    box.addEventListener('click', e => { if (e.target === box || e.target.classList.contains('ov-close')) box.hidden = true; });
  }
  box.querySelector('h2').textContent = TR('Schermo intero');
  box.querySelector('.ov-body').innerHTML = TR("Su iPhone i browser (Safari e anche Chrome) non permettono lo schermo intero.<br><br>Per giocare senza barre: in Safari tocca <b>Condividi</b> (il quadrato con la freccia) e poi <b>Aggiungi alla schermata Home</b>. Apri Supplyville dall'icona: si gioca a tutto schermo, come un'app.");
  box.hidden = false;
}
function toggleFullscreen() {
  const el = document.documentElement;
  if (fullscreenOn()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
  if (!fullscreenApi()) { showHomeScreenHelp(); return; }
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  const p = req.call(el, { navigationUI: 'hide' });
  if (isTouch && p && p.then) p.then(() => { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); }).catch(() => { if (isTouch) showHomeScreenHelp(); });
}
(() => {
  const btn = document.getElementById('fs-btn');
  if (!btn) return;
  // si vede se lo schermo intero c'è, oppure sul telefono (iPhone: spiega la schermata Home); non serve se
  // il gioco è già aperto dalla schermata Home
  btn.hidden = isStandalone() || !(fullscreenApi() || isTouch);
  btn.addEventListener('click', () => { toggleFullscreen(); btn.blur(); });
  const upd = () => { const img = btn.querySelector('img'); if (img) img.src = TOP_ICONS[fullscreenOn() ? 'exitFullscreen' : 'fullscreen']; btn.title = fullscreenOn() ? TR('Esci dallo schermo intero') : TR('Schermo intero'); setTimeout(resize, 50); };
  document.addEventListener('fullscreenchange', upd);
  document.addEventListener('webkitfullscreenchange', upd);
})();
