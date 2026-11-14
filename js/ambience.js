// ---------- Suoni d'ambiente (richiesta dell'utente) ----------
// Avvicinandosi alla mappa si sente quello che si sta guardando: la città (traffico, voci, auto che passano,
// un clacson ogni tanto), la fattoria (uccellini, mucche, galline, pecore, maiali secondo gli allevamenti che si vedono),
// il mare (onde, gabbiani), il bosco (vento tra le foglie, uccellini, l'ascia dell'azienda forestale) e le
// fabbriche (ronzio e colpi di metallo). Tutto fatto dal codice con Web Audio, come la musica: niente file.
// Più si è vicini più si sente (da zoom 2 in su, `AMB_ZOOM`); da lontano silenzio. Volume: Opzioni -> Effetti sonori.
const AMB = { ready: false, out: null, layers: {}, w: { city: 0, traffic: 0, farm: 0, sea: 0, forest: 0, industry: 0, chop: 0, animals: {} }, scanT: 0, zf: 0 };
const AMB_ZOOM = z => z < 2 ? 0 : z < 3 ? 0.45 : z < 4 ? 0.7 : z < 6 ? 0.88 : 1;
function sfxVolume() { return Math.pow((settings.volume.sfx || 0) / 100, 1.5) * 0.9; }

function ambInit() {
  const ctx = MUSIC.ctx; if (!ctx || AMB.ready) return;
  AMB.out = ctx.createGain(); AMB.out.gain.value = 0;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3;
  AMB.out.connect(comp); comp.connect(ctx.destination);
  AMB.fx = ctx.createGain(); AMB.fx.gain.value = AMB_LV.fx; AMB.fx.connect(AMB.out);   // suoni singoli (versi, auto, colpi)
  // Rumore di base lungo 4 secondi (con 1 secondo si sentiva ripetersi): bianco per i fruscii, "marrone"
  // (più scuro e morbido) per il rombo e le onde. Prima era tutto rumore bianco filtrato e sembrava
  // un vento forte e continuo (segnalazione dell'utente).
  const N = ctx.sampleRate * 4, white = ctx.createBuffer(1, N, ctx.sampleRate), brown = ctx.createBuffer(1, N, ctx.sampleRate);
  const wd = white.getChannelData(0), bd = brown.getChannelData(0);
  let last = 0, peak = 0;
  for (let i = 0; i < N; i++) { const r = Math.random() * 2 - 1; wd[i] = r; last = (last + 0.02 * r) / 1.02; bd[i] = last; if (Math.abs(last) > peak) peak = Math.abs(last); }
  for (let i = 0; i < N; i++) bd[i] /= peak;
  const fade = Math.floor(ctx.sampleRate * 0.05);   // giunta morbida tra fine e inizio
  for (let i = 0; i < fade; i++) { const k = i / fade; bd[N - fade + i] = bd[N - fade + i] * (1 - k) + bd[i] * k; }
  AMB.white = white; AMB.brown = brown;
  // strati continui: rumore filtrato con un volume proprio (che segue quello che si vede)
  const loop = (buf, type, freq, q, lfoHz, lfoDepth) => {
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.playbackRate.value = 0.8 + Math.random() * 0.3;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const sw = ctx.createGain(); sw.gain.value = 1 - lfoDepth;   // respiro lento (onde, folate leggere)
    if (lfoHz) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = lfoHz; lg.gain.value = lfoDepth; l.connect(lg); lg.connect(sw.gain); l.start(); }
    const g = ctx.createGain(); g.gain.value = 0;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 55;   // via i bassi che non si sentono ma mangiano volume
    src.connect(hp); hp.connect(f); f.connect(sw); sw.connect(g); g.connect(AMB.out); src.start(0, Math.random() * 3);
    return g;
  };
  AMB.layers.traffic = loop(brown, 'lowpass', 160, 0.5, 0.07, 0.2);    // rombo lontano e basso della città
  AMB.layers.sea = loop(brown, 'lowpass', 900, 0.4, 0.13, 0.6);        // onde
  AMB.layers.sea2 = loop(white, 'bandpass', 2800, 0.6, 0.11, 0.85);    // risacca
  AMB.layers.leaves = loop(white, 'bandpass', 2200, 0.35, 0.08, 0.5);  // fruscio leggero di foglie e campi
  // ronzio delle fabbriche
  const hg = ctx.createGain(); hg.gain.value = 0; hg.connect(AMB.out);
  for (const [hz, v] of [[50, 1], [100, 0.5], [151, 0.2]]) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = hz; g.gain.value = v; o.connect(g); g.connect(hg); o.start(); }
  AMB.layers.hum = hg;
  AMB.ready = true;
}

// Cosa c'è al centro dello schermo: pesi 0..1 per ogni tipo di suono
function ambScan() {
  const w = { city: 0, traffic: 0, farm: 0, sea: 0, forest: 0, industry: 0, chop: 0, animals: {} };
  if (!game.started || !game.map) return w;
  const z = zoomLevel(), c = tileFromWorld((view.w / 2 - cam.x) / z, (view.h / 2 - cam.y) / z);
  const R = Math.max(3, Math.min(12, Math.round(Math.min(view.w, view.h * 2) / (TW * z) * 0.55)));
  let tot = 0;
  const seen = new Set();
  for (let y = c.y - R; y <= c.y + R; y++) for (let x = c.x - R; x <= c.x + R; x++) {
    const d = Math.hypot(x - c.x, y - c.y); if (d > R) continue;
    const k = 1 - 0.7 * d / R; tot += k;
    if (!inMap(x, y)) { w.sea += k * 0.5; continue; }
    const t = game.map[y][x], b = t.building;
    if (t.type === T.WATER) w.sea += k;
    else if (t.type === T.FOREST) w.forest += k;
    if (t.field) w.farm += k * 0.8;
    if (t.path === 'road' || t.path === 'oneway' || t.path === 'highway') w.traffic += k * (t.path === 'highway' ? 0.35 : 0.15);
    if (b) {
      if (b.kind === 'house') w.city += k * (0.6 + 0.25 * (b.residents || 0));
      else if (SHOPS[b.kind] || b.kind === 'bakery' || b.kind === 'busStop' || b.kind === 'busDepot') w.city += k * 1.2;
      else if (b.kind === 'farm') w.farm += k * 1.5;
      else if (b.kind === 'livestock') { w.farm += k; if ((b.workers || 0) > 0 || true) w.animals[b.animal] = (w.animals[b.animal] || 0) + k; }
      else if (isProcessor(b) || POWER[b.kind] || b.kind === 'refinery' || b.kind === 'port' || b.kind === 'oilWell') w.industry += k * (staffOf(b) > 0 ? 1 : 0.3);
      else if (isWarehouse(b)) w.industry += k * 0.3;
      else if (b.kind === 'forestry' && !seen.has(b) && staffOf(b) > 0 && !b.full) { seen.add(b); w.chop += 1; }
    }
  }
  for (const v of vehicles) if (v.pos && v.kind !== 'ship' && Math.hypot(v.pos.mx - c.x, v.pos.my - c.y) < R) w.traffic += 2.5;
  const n = k => Math.min(1, k / (tot * 0.22));   // un quinto dello schermo pieno = volume pieno
  w.city = n(w.city); w.traffic = Math.min(1, w.traffic / (tot * 0.12)); w.farm = n(w.farm); w.sea = Math.min(1, w.sea / (tot * 0.35));
  w.forest = Math.min(1, w.forest / (tot * 0.35)); w.industry = Math.min(1, w.industry / (tot * 0.1)); w.chop = Math.min(1, w.chop);
  for (const a in w.animals) w.animals[a] = Math.min(1, w.animals[a] / 4);
  return w;
}

// chiamata dal ciclo del gioco (app.js): aggiorna i volumi e fa partire i suoni singoli
function ambUpdate(dt) {
  const ctx = MUSIC.ctx;
  if (!ctx) return;
  if (!AMB.ready) { if (sfxVolume() > 0 && MUSIC.noise) ambInit(); if (!AMB.ready) return; }
  if (ctx.state !== 'running') return;
  AMB.scanT -= dt;
  if (AMB.scanT > 0) return;
  const step = 0.25; AMB.scanT = step;
  const menu = typeof menuIsOpen === 'function' && menuIsOpen();
  const zf = (!game.started || menu) ? 0 : AMB_ZOOM(zoomLevel());
  AMB.zf = zf;
  const now = ctx.currentTime, set = (g, v) => g.gain.setTargetAtTime(v, now, 0.5);
  set(AMB.out, sfxVolume() * zf);
  if (zf <= 0 || sfxVolume() <= 0) return;
  const w = AMB.w = ambScan(), L = AMB.layers, paused = game.speed === 0;
  const lv = ambLevels(w, paused);
  for (const k in lv) set(L[k], lv[k]);
  // suoni singoli: probabilità al secondo x passo
  const chance = perSec => Math.random() < perSec * step;
  if (chance(0.3 * Math.max(w.forest, w.farm * 0.7) + 0.04 * (1 - w.sea) * (1 - w.city))) ambBird();
  if (chance(0.09 * w.sea)) ambGull();
  if (!paused) {
    if (chance(0.3 * w.traffic)) ambCar();
    if (chance(0.025 * w.city * w.traffic)) ambHorn();
    if (chance(0.05 * w.city)) ambDoor();
    if (chance(0.45 * w.city)) ambVoice();
    if (chance(0.12 * (w.animals.cowFarm || 0))) ambMoo();
    if (chance(0.25 * (w.animals.chickenFarm || 0))) ambCluck();
    if (chance(0.14 * (w.animals.sheepFarm || 0))) ambBleat();
    if (chance(0.14 * (w.animals.pigFarm || 0))) ambOink();
    if (chance(0.18 * w.chop)) ambChop();
    if (chance(0.12 * w.industry)) ambClank();
  }
}

// Volumi (richiesta dell'utente: livellare musica e ambiente): gli strati continui stanno bassi, sotto la musica;
// sono i suoni singoli (versi, auto, voci) a farsi sentire. Misurati con amb-render.js.
const AMB_LV = { traffic: 0.11, sea: 0.11, sea2: 0.05, leaves: 0.028, hum: 0.006, fx: 2.2 };
// volume di ogni strato continuo (il rumore filtrato in basso è debole: per questo i numeri sono alti)
function ambLevels(w, paused) {
  return { traffic: paused ? 0 : AMB_LV.traffic * Math.max(w.traffic, w.city * 0.5),
    sea: AMB_LV.sea * w.sea, sea2: AMB_LV.sea2 * w.sea, leaves: AMB_LV.leaves * Math.max(w.forest, w.farm * 0.6), hum: paused ? 0 : AMB_LV.hum * w.industry };
}
// ---- suoni singoli ----
function ambDest(pan) {   // uscita con la posizione a destra/sinistra
  const ctx = MUSIC.ctx;
  if (!ctx.createStereoPanner) return AMB.fx;
  const p = ctx.createStereoPanner(); p.pan.value = pan == null ? Math.random() * 1.4 - 0.7 : pan; p.connect(AMB.fx);
  return p;
}
function ambOsc(type, f0, t, dur, vol, o = {}) {
  const ctx = MUSIC.ctx, osc = ctx.createOscillator(), g = ctx.createGain();
  osc.type = type; osc.frequency.setValueAtTime(f0, t);
  for (const [dt, f] of o.glide || []) osc.frequency.linearRampToValueAtTime(f, t + dt);
  const a = o.attack || 0.01;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + a); g.gain.setValueAtTime(vol, t + Math.max(a, dur * (o.hold || 0.6))); g.gain.linearRampToValueAtTime(0, t + dur);
  let node = osc;
  if (o.band) { const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = o.band; f.Q.value = o.q || 2; node.connect(f); node = f; }
  if (o.low) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.low; node.connect(f); node = f; }
  if (o.trem) { const l = ctx.createOscillator(), lg = ctx.createGain(), tg = ctx.createGain(); l.frequency.value = o.trem; lg.gain.value = 0.5; tg.gain.value = 0.5; l.connect(lg); lg.connect(tg.gain); node.connect(tg); node = tg; l.start(t); l.stop(t + dur + 0.05); }
  node.connect(g); g.connect(o.dest || ambDest());
  osc.start(t); osc.stop(t + dur + 0.05);
  return osc;
}
function ambNoise(t, dur, vol, type, freq, q, dest, sweep) {
  const ctx = MUSIC.ctx, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = AMB.white; src.loop = true; f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q || 1;
  if (sweep) { f.frequency.linearRampToValueAtTime(sweep, t + dur / 2); f.frequency.linearRampToValueAtTime(freq, t + dur); }
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + (sweep ? dur / 2 : 0.005)); g.gain.linearRampToValueAtTime(0, t + dur);
  src.connect(f); f.connect(g); g.connect(dest || ambDest()); src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  return g;
}
const ambNow = () => MUSIC.ctx.currentTime + 0.05;
function ambBird() {   // cinguettio: 2-5 fischi brevi che salgono o scendono
  const t = ambNow(), dest = ambDest(), base = 2600 + Math.random() * 2200, n = 2 + Math.floor(Math.random() * 4), gap = 0.07 + Math.random() * 0.06;
  for (let i = 0; i < n; i++) { const f = base * (0.9 + Math.random() * 0.25), up = Math.random() < 0.6;
    ambOsc('sine', f, t + i * gap, 0.06, 0.035, { glide: [[0.05, f * (up ? 1.25 : 0.8)]], dest, hold: 0.5 }); }
}
function ambGull() {   // gabbiano: 2-3 gridi che scendono
  const t = ambNow(), dest = ambDest(), n = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < n; i++) ambOsc('sawtooth', 1500 + Math.random() * 300, t + i * 0.42, 0.34, 0.02, { glide: [[0.08, 1900], [0.34, 1050]], band: 1700, q: 3, dest, attack: 0.03 });
}
function ambCar() {   // un'auto che passa da un lato all'altro
  const ctx = MUSIC.ctx, t = ambNow(), dur = 1.3 + Math.random() * 0.9, dir = Math.random() < 0.5 ? 1 : -1;
  let dest = AMB.fx;
  if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.setValueAtTime(-0.8 * dir, t); p.pan.linearRampToValueAtTime(0.8 * dir, t + dur); p.connect(AMB.fx); dest = p; }
  ambNoise(t, dur, 0.1, 'bandpass', 260, 0.8, dest, 520 + Math.random() * 200);
  ambOsc('sawtooth', 82 + Math.random() * 20, t, dur, 0.035, { glide: [[dur / 2, 104], [dur, 76]], low: 300, dest, attack: dur / 2, hold: 0.5 });
}
function ambHorn() { const t = ambNow(), dest = ambDest(); for (const f of [392, 494]) ambOsc('square', f, t, 0.22, 0.012, { low: 1400, dest }); }
function ambDoor() {   // porta/campanello di un negozio: due note leggere
  const t = ambNow(), dest = ambDest();
  ambOsc('sine', 1318, t, 0.25, 0.018, { dest, hold: 0.1 }); ambOsc('sine', 1046, t + 0.16, 0.4, 0.018, { dest, hold: 0.1 });
}
function ambVoice() {   // voci della gente: qualche sillaba in stile retro (al posto del brusio continuo, che sembrava vento)
  const t = ambNow(), dest = ambDest(), n = 2 + Math.floor(Math.random() * 4), f0 = 130 + Math.random() * 130;
  let at = 0;
  for (let i = 0; i < n; i++) { const d = 0.07 + Math.random() * 0.08, f = f0 * (0.9 + Math.random() * 0.3);
    ambOsc('sawtooth', f, t + at, d, 0.035, { glide: [[d, f * (0.92 + Math.random() * 0.16)]], band: 650 + Math.random() * 700, q: 3, dest, attack: 0.015 }); at += d + 0.02 + Math.random() * 0.05; }
}
function ambMoo() {   // mucca
  const t = ambNow(), f = 95 + Math.random() * 20, dur = 1 + Math.random() * 0.5;
  ambOsc('sawtooth', f, t, dur, 0.11, { glide: [[dur * 0.3, f * 1.3], [dur, f * 0.9]], band: 520, q: 1.6, attack: 0.15, hold: 0.7 });
}
function ambCluck() {   // gallina: co-co-co-codè
  const t = ambNow(), dest = ambDest(), n = 3 + Math.floor(Math.random() * 4);
  for (let i = 0; i < n; i++) { const last = i === n - 1 && n > 4;
    ambOsc('square', 560 + Math.random() * 60, t + i * 0.13, last ? 0.22 : 0.06, 0.03, { glide: [[last ? 0.2 : 0.05, last ? 900 : 760]], band: 1300, q: 2.5, dest }); }
}
function ambBleat() {   // pecora: beee tremolante
  const t = ambNow(), f = 380 + Math.random() * 90;
  ambOsc('sawtooth', f, t, 0.65, 0.07, { glide: [[0.65, f * 0.92]], band: 1100, q: 2.2, trem: 9, attack: 0.05, hold: 0.7 });
}
function ambOink() {   // maiale: due grugniti
  const t = ambNow(), dest = ambDest();
  for (let i = 0; i < 2; i++) ambOsc('sawtooth', 105 + Math.random() * 20, t + i * 0.24, 0.16, 0.1, { band: 650, q: 1.2, trem: 38, dest, attack: 0.02 });
}
function ambChop() {   // ascia sul legno: tre colpi
  const t = ambNow(), dest = ambDest();
  for (let i = 0; i < 3; i++) { ambNoise(t + i * 0.55, 0.07, 0.12, 'bandpass', 950, 2, dest); ambOsc('sine', 190, t + i * 0.55, 0.09, 0.08, { glide: [[0.08, 120]], dest, hold: 0.1 }); }
}
function ambClank() {   // colpo di metallo in fabbrica
  const t = ambNow(), dest = ambDest();
  for (const [f, v] of [[1180, 0.02], [1870, 0.014], [2540, 0.008]]) ambOsc('sine', f, t, 0.3, v, { dest, hold: 0.05, attack: 0.003 });
  ambNoise(t, 0.04, 0.03, 'bandpass', 2400, 1.5, dest);
}
