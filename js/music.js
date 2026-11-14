// ---------- Musica (richiesta dell'utente: una bella musica nello stile del gioco) ----------
// Musica originale in stile retro (chiptune tranquillo), suonata dal codice con Web Audio: niente file da scaricare.
// Due brani che si alternano con una pausa in mezzo. Strumenti: melodia (onda quadra addolcita con eco),
// arpeggio, basso (triangolare), tappeto di accordi e una batteria leggera.
// Il volume è quello di Opzioni -> Musica; il pulsante con la nota nella barra in alto la accende/spegne
// (settings.musicOn, salvato). Il browser lascia partire l'audio solo dopo il primo clic/tocco/tasto.
const MUSIC = { ctx: null, master: null, bus: null, echo: null, timer: null, noise: null,
  song: 0, sec: 0, bar: 0, step: 0, next: 0, pauseUntil: 0, started: false };
const NOTE_IX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function noteMidi(n) {   // 'C5', 'Bb4', 'F#3'
  let i = 1, v = NOTE_IX[n[0]];
  if (n[1] === '#') { v++; i++; } else if (n[1] === 'b') { v--; i++; }
  return 12 * (+n.slice(i) + 1) + v;
}
const midiHz = m => 440 * Math.pow(2, (m - 69) / 12);
function chordNotes(name) {   // 'C', 'Am', 'Bb' -> [fondamentale, terza, quinta] attorno al Do centrale
  const minor = name.endsWith('m'), root = minor ? name.slice(0, -1) : name;
  let r = noteMidi(root + '3'); if (r < 53) r += 12;   // tra Fa3 e Mi4
  return [r, r + (minor ? 3 : 4), r + 7];
}
// Brani: per ogni sezione gli accordi (uno per battuta) e la melodia (8 crome per battuta: nota, '-' = tiene, '.' = pausa)
const SONGS = [
  { name: 'Supplyville', bpm: 100, sections: {
      A: { chords: ['C', 'Am', 'F', 'G', 'C', 'Am', 'F', 'G'], lead: [
        'G4 C5 E5 G5 E5 - C5 -', 'A4 C5 E5 A5 G5 - E5 -', 'F5 - A5 G5 F5 E5 D5 C5', 'D5 - B4 - G4 - - .',
        'G4 C5 E5 G5 E5 - C5 -', 'A4 C5 E5 A5 C6 - B5 A5', 'A5 - F5 - A5 G5 F5 D5', 'E5 - D5 - D5 - - .'] },
      B: { chords: ['F', 'G', 'Em', 'Am', 'F', 'G', 'C', 'C'], lead: [
        'A5 - - G5 F5 - C5 -', 'B5 - - A5 G5 - D5 -', 'G5 - E5 - B4 - E5 G5', 'A5 - - - E5 - C5 -',
        'A5 - - G5 F5 - A5 -', 'B5 - - A5 G5 - B5 -', 'C6 - - - G5 - E5 -', 'C5 - - - . . . .'] },
      C: { chords: ['Am', 'Em', 'F', 'C', 'Dm', 'Am', 'F', 'G'], lead: [
        'E5 - A4 - C5 - E5 -', 'D5 - G4 - B4 - D5 -', 'C5 - F4 - A4 - C5 -', 'E5 - - - G4 - C5 -',
        'F5 - D5 - A4 - D5 F5', 'E5 - C5 - A4 - C5 E5', 'F5 - G5 - A5 - C6 -', 'B5 - - - G5 - D5 .'] },
      E: { chords: ['C', 'C'], lead: ['C5 - - - - - - -', '. . . . . . . .'] } },
    // sezione, melodia sì/no, batteria sì/no, quante battute (se meno della sezione)
    order: [['A', 0, 0, 4], ['A', 1, 0], ['A', 1, 1], ['B', 1, 1], ['C', 1, 0], ['A', 1, 1], ['B', 1, 1], ['E', 1, 0]] },
  { name: 'Campi e strade', bpm: 84, sections: {
      A: { chords: ['F', 'C', 'Dm', 'Bb', 'F', 'C', 'Bb', 'C'], lead: [
        'C5 - F5 - A5 - G5 F5', 'E5 - G5 - C5 - - .', 'D5 - F5 - A5 - G5 F5', 'D5 - - - Bb4 - - .',
        'C5 - F5 - A5 - C6 -', 'Bb5 - A5 - G5 - E5 -', 'F5 - D5 - Bb4 - D5 -', 'E5 - G5 - C5 - - .'] },
      B: { chords: ['Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'C', 'F'], lead: [
        'A5 - - F5 D5 - F5 -', 'Bb5 - - A5 F5 - D5 -', 'A5 - C6 - A5 - F5 -', 'G5 - - - E5 - C5 -',
        'A5 - - F5 D5 - F5 A5', 'Bb5 - - D6 Bb5 - F5 -', 'G5 - E5 - G5 - Bb5 -', 'A5 - - - F5 - - .'] },
      E: { chords: ['F', 'F'], lead: ['F5 - - - - - - -', '. . . . . . . .'] } },
    order: [['A', 0, 0, 4], ['A', 1, 0], ['A', 1, 1], ['B', 1, 1], ['A', 1, 1], ['B', 1, 0], ['E', 1, 0]] },
  // --- altri cinque brani (richiesta dell'utente: così non si ripete sempre lo stesso) ---
  { name: 'Mattina al mercato', bpm: 112, style: { arp: 'up', drum: 'bounce' }, sections: {
      A: { chords: ['G', 'D', 'Em', 'C', 'G', 'D', 'C', 'D'], lead: [
        'D5 G5 B5 G5 D5 - B4 -', 'A4 D5 F#5 D5 A5 - F#5 -', 'G5 - B5 - E5 - G5 -', 'E5 - G5 E5 C5 - - .',
        'D5 G5 B5 G5 D6 - B5 -', 'A5 - F#5 - D5 - F#5 A5', 'G5 - E5 - C5 - E5 -', 'F#5 - A5 - D5 - - .'] },
      B: { chords: ['Em', 'C', 'G', 'D', 'Em', 'C', 'D', 'G'], lead: [
        'B5 - - G5 E5 - G5 -', 'C6 - - G5 E5 - G5 -', 'B5 - D6 - B5 - G5 -', 'A5 - - - F#5 - D5 -',
        'B5 - - G5 E5 - G5 B5', 'C6 - - E6 C6 - G5 -', 'A5 - F#5 - A5 - D6 -', 'B5 - - - G5 - - .'] },
      E: { chords: ['G', 'G'], lead: ['G5 - - - - - - -', '. . . . . . . .'] } },
    order: [['A', 0, 0, 4], ['A', 1, 1], ['B', 1, 1], ['A', 1, 1], ['B', 1, 0], ['A', 1, 1], ['E', 1, 0]] },
  { name: 'Notte sul porto', bpm: 76, style: { arp: 'slow', bass: 'long', lead: 'tri', drum: 'none' }, sections: {
      A: { chords: ['Am', 'F', 'C', 'G', 'Am', 'F', 'G', 'Am'], lead: [
        'A4 - C5 - E5 - - -', 'F5 - E5 - C5 - A4 -', 'G4 - C5 - E5 - G5 -', 'D5 - - - B4 - G4 -',
        'A4 - C5 - E5 - A5 -', 'A5 - G5 - F5 - C5 -', 'D5 - G5 - B5 - A5 G5', 'A5 - - - E5 - - .'] },
      B: { chords: ['F', 'G', 'Em', 'Am', 'F', 'G', 'C', 'E'], lead: [
        'C5 - F5 - A5 - - G5', 'B5 - - A5 G5 - D5 -', 'G5 - - E5 B4 - E5 -', 'C5 - - - A4 - - .',
        'C5 - F5 - A5 - C6 -', 'B5 - - A5 G5 - B5 -', 'C6 - G5 - E5 - G5 -', 'G#5 - - - E5 - B4 .'] },
      E: { chords: ['Am', 'Am'], lead: ['A4 - - - - - - -', '. . . . . . . .'] } },
    order: [['A', 0, 0, 4], ['A', 1, 0], ['B', 1, 0], ['A', 1, 0], ['B', 1, 0], ['A', 1, 0], ['E', 1, 0]] },
  { name: 'Fabbriche al lavoro', bpm: 118, style: { arp: 'broken', bass: 'pulse', drum: 'bounce', lead: 'soft' }, sections: {
      A: { chords: ['Dm', 'Bb', 'C', 'Dm', 'Dm', 'Bb', 'C', 'A'], lead: [
        'D5 - F5 A5 - F5 D5 -', 'D5 - F5 Bb5 - F5 D5 -', 'E5 - G5 C6 - G5 E5 -', 'F5 - A5 - D5 - - .',
        'D5 - F5 A5 - F5 D5 -', 'D5 - F5 Bb5 - A5 G5 F5', 'E5 - G5 - E5 - C5 -', 'C#5 - E5 - A5 - - .'] },
      B: { chords: ['F', 'C', 'Gm', 'Dm', 'Bb', 'C', 'Dm', 'Dm'], lead: [
        'A5 - - C6 A5 - F5 -', 'G5 - - C6 G5 - E5 -', 'Bb5 - - D6 Bb5 - G5 -', 'A5 - - - F5 - D5 -',
        'D5 - F5 - Bb5 - A5 -', 'G5 - E5 - C6 - Bb5 -', 'A5 - - - F5 - A5 -', 'D6 - - - - - - .'] },
      E: { chords: ['Dm', 'Dm'], lead: ['D5 - - - - - - -', '. . . . . . . .'] } },
    order: [['A', 0, 1, 4], ['A', 1, 1], ['B', 1, 1], ['A', 1, 1], ['B', 1, 1], ['E', 1, 0]] },
  { name: 'Domenica in città', bpm: 92, style: { arp: 'up', bass: 'root', drum: 'soft' }, sections: {
      A: { chords: ['D', 'A', 'Bm', 'G', 'D', 'A', 'G', 'A'], lead: [
        'F#5 - A5 - D6 - A5 -', 'E5 - A5 - C#6 - A5 -', 'D5 - F#5 - B5 - A5 F#5', 'G5 - - - D5 - B4 -',
        'F#5 - A5 - D6 - F#6 -', 'E6 - C#6 - A5 - E5 -', 'D5 - G5 - B5 - G5 -', 'A5 - - - E5 - - .'] },
      B: { chords: ['Bm', 'G', 'D', 'A', 'G', 'A', 'D', 'D'], lead: [
        'F#5 - - D5 B4 - D5 F#5', 'G5 - - D5 B4 - D5 G5', 'A5 - - F#5 D5 - F#5 A5', 'C#6 - - - A5 - E5 -',
        'B5 - G5 - D5 - G5 -', 'C#6 - A5 - E5 - A5 -', 'D6 - - - A5 - F#5 -', 'D5 - - - - - - .'] },
      E: { chords: ['D', 'D'], lead: ['D5 - - - - - - -', '. . . . . . . .'] } },
    order: [['A', 0, 0, 4], ['A', 1, 0], ['A', 1, 1], ['B', 1, 1], ['A', 1, 1], ['B', 1, 0], ['E', 1, 0]] },
  { name: 'Lungo il fiume', bpm: 86, style: { arp: 'updown', bass: 'long', lead: 'tri', drum: 'soft' }, sections: {
      A: { chords: ['Bb', 'F', 'Gm', 'Eb', 'Bb', 'F', 'Eb', 'F'], lead: [
        'F5 - D5 - Bb4 - D5 F5', 'A5 - F5 - C5 - F5 -', 'Bb5 - G5 - D5 - G5 Bb5', 'G5 - - - Eb5 - - .',
        'F5 - D5 - Bb4 - D5 F5', 'A5 - C6 - A5 - F5 -', 'G5 - Bb5 - G5 - Eb5 -', 'F5 - A5 - C6 - - .'] },
      B: { chords: ['Gm', 'Eb', 'Bb', 'F', 'Eb', 'F', 'Bb', 'Bb'], lead: [
        'D6 - - Bb5 G5 - Bb5 -', 'Bb5 - - G5 Eb5 - G5 -', 'F5 - Bb5 - D6 - Bb5 -', 'C6 - - - A5 - F5 -',
        'G5 - Bb5 - Eb6 - D6 -', 'C6 - A5 - F5 - A5 -', 'Bb5 - - - F5 - D5 -', 'Bb4 - - - - - - .'] },
      E: { chords: ['Bb', 'Bb'], lead: ['Bb4 - - - - - - -', '. . . . . . . .'] } },
    order: [['A', 0, 0, 4], ['A', 1, 0], ['B', 1, 1], ['A', 1, 1], ['B', 1, 1], ['A', 1, 0], ['E', 1, 0]] },
];
for (const s of SONGS) for (const k in s.sections) s.sections[k].lead = s.sections[k].lead.map(b => b.split(' '));

function musicVolume() { return settings.musicOn === false ? 0 : Math.pow((settings.volume.music || 0) / 100, 1.5) * 0.75; }
function musicStart() {
  if (MUSIC.ctx) { if (MUSIC.ctx.state === 'suspended' && !document.hidden) MUSIC.ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try {
    const ctx = MUSIC.ctx = new AC();
    MUSIC.master = ctx.createGain(); MUSIC.master.gain.value = musicVolume();
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4;
    MUSIC.master.connect(comp); comp.connect(ctx.destination);
    MUSIC.bus = ctx.createGain(); MUSIC.bus.connect(MUSIC.master);
    // eco leggera per melodia e arpeggio
    const d = ctx.createDelay(1), fb = ctx.createGain(), wet = ctx.createGain(), lp = ctx.createBiquadFilter();
    d.delayTime.value = 0.3; fb.gain.value = 0.28; wet.gain.value = 0.3; lp.type = 'lowpass'; lp.frequency.value = 2200;
    MUSIC.echo = ctx.createGain(); MUSIC.echo.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(wet); wet.connect(MUSIC.master);
    const nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), data = nb.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    MUSIC.noise = nb;
    MUSIC.next = ctx.currentTime + 0.3; MUSIC.song = 0; MUSIC.sec = 0; MUSIC.bar = 0; MUSIC.step = 0;
    MUSIC.timer = setInterval(musicSchedule, 60);
    MUSIC.started = true;
  } catch (e) { MUSIC.ctx = null; }
}
// una nota: oscillatore -> filtro -> inviluppo
function musicTone(type, hz, t, dur, vol, o = {}) {
  const ctx = MUSIC.ctx, osc = ctx.createOscillator(), g = ctx.createGain();
  osc.type = type; osc.frequency.setValueAtTime(hz, t);
  if (o.detune) osc.detune.value = o.detune;
  if (o.vib && dur > 0.35) {   // vibrato sulle note lunghe
    const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 5.5; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(hz * 0.008, t + 0.3);
    l.connect(lg); lg.connect(osc.frequency); l.start(t); l.stop(t + dur + 0.2);
  }
  const a = o.attack || 0.008, rel = o.release || 0.08, sus = o.sustain == null ? 0.7 : o.sustain;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + a);
  g.gain.linearRampToValueAtTime(vol * sus, t + a + Math.min(0.12, dur * 0.5));
  g.gain.setValueAtTime(vol * sus, t + Math.max(a + 0.02, dur - 0.01)); g.gain.linearRampToValueAtTime(0, t + dur + rel);
  let out = osc;
  if (o.cut) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.cut; f.Q.value = o.q || 0.7; osc.connect(f); out = f; }
  out.connect(g); g.connect(MUSIC.bus); if (o.echo) g.connect(MUSIC.echo);
  osc.start(t); osc.stop(t + dur + rel + 0.05);
}
function musicNoise(t, dur, vol, type, freq) {
  const ctx = MUSIC.ctx, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = MUSIC.noise; f.type = type; f.frequency.value = freq;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  src.connect(f); f.connect(g); g.connect(MUSIC.bus); src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
}
function musicKick(t, vol) {
  const ctx = MUSIC.ctx, osc = ctx.createOscillator(), g = ctx.createGain();
  osc.type = 'sine'; osc.frequency.setValueAtTime(130, t); osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  osc.connect(g); g.connect(MUSIC.bus); osc.start(t); osc.stop(t + 0.25);
}
// Il prossimo brano: a caso tra quelli non sentiti di recente (si ricordano gli ultimi 3)
function musicNextSong() {
  MUSIC.recent = (MUSIC.recent || [0]).slice(-3);
  const free = SONGS.map((s, i) => i).filter(i => !MUSIC.recent.includes(i));
  const n = free[Math.floor(Math.random() * free.length)];
  MUSIC.recent.push(n);
  return n;
}
// Prepara le note un po' in anticipo (passo = semicroma)
function musicSchedule() {
  const ctx = MUSIC.ctx;
  if (!ctx || ctx.state !== 'running') return;
  if (!musicIsOn()) { MUSIC.next = 0; return; }   // musica spenta (ma l'audio serve ai suoni d'ambiente)
  if (MUSIC.next < ctx.currentTime - 0.5) MUSIC.next = ctx.currentTime + 0.1;   // dopo una pausa della scheda: riparte da adesso
  while (MUSIC.next < ctx.currentTime + 0.3) {
    const song = SONGS[MUSIC.song], st = 60 / song.bpm / 4;
    if (MUSIC.pauseUntil) {   // silenzio tra un brano e l'altro
      if (MUSIC.next < MUSIC.pauseUntil) { MUSIC.next += st; continue; }
      MUSIC.pauseUntil = 0;
    }
    const [key, lead, drums, len] = song.order[MUSIC.sec], S = song.sections[key], bars = len || S.chords.length;
    musicStep(song, S, MUSIC.bar, MUSIC.step, MUSIC.next, st, lead, drums, MUSIC.sec === song.order.length - 1);
    MUSIC.next += st;
    if (++MUSIC.step >= 16) { MUSIC.step = 0;
      if (++MUSIC.bar >= bars) { MUSIC.bar = 0;
        if (++MUSIC.sec >= song.order.length) { MUSIC.sec = 0; MUSIC.song = musicNextSong(); MUSIC.pauseUntil = MUSIC.next + 5; } } }
  }
}
const ARP_PAT = { updown: [0, 1, 2, 3, 2, 1, 2, 1], up: [0, 1, 2, 3, 0, 1, 2, 3], broken: [0, 2, 1, 2, 0, 2, 1, 3], slow: [0, -1, 1, -1, 2, -1, 1, -1] };
function musicStep(song, S, bar, step, t, st, lead, drums, ending) {
  const ch = chordNotes(S.chords[bar]), beat = st * 4, sty = song.style || {};
  if (step === 0) {   // tappeto: l'accordo tenuto per tutta la battuta (due onde a dente di sega un po' stonate fra loro)
    for (const m of ch) for (const det of [-7, 7]) musicTone('sawtooth', midiHz(m), t, beat * 4 - 0.05, 0.022, { attack: 0.25, release: 0.4, sustain: 1, cut: 900, detune: det });
  }
  if (ending) { if (step === 0 && bar === 0) musicTone('triangle', midiHz(ch[0] - 12), t, beat * 6, 0.2, { release: 0.6, sustain: 0.9 }); }
  else {
    // basso: 'root' fondamentale sul primo e terzo tempo con la quinta di passaggio, 'pulse' crome che spingono, 'long' una nota per battuta
    const bass = sty.bass || 'root';
    if (bass === 'long') { if (step === 0) musicTone('triangle', midiHz(ch[0] - 12), t, beat * 3.6, 0.2, { sustain: 0.9, release: 0.3 }); }
    else if (bass === 'pulse') { if (step % 2 === 0) musicTone('triangle', midiHz(ch[0] - 12 + (step % 8 === 6 ? 7 : step % 4 === 2 ? 12 : 0)), t, st * 1.5, step % 4 === 0 ? 0.2 : 0.13, { sustain: 0.7 }); }
    else if (step === 0 || step === 8) musicTone('triangle', midiHz(ch[0] - 12), t, beat * 1.4, 0.2, { sustain: 0.85 });
    else if (step === 6 || step === 14) musicTone('triangle', midiHz(ch[2] - 12), t, beat * 0.45, 0.14, { sustain: 0.8 });
    // arpeggio in crome sulle note dell'accordo
    if (step % 2 === 0) { const pat = (ARP_PAT[sty.arp] || ARP_PAT.updown)[step / 2];
      if (pat >= 0) { const m = pat === 3 ? ch[0] + 12 : ch[pat];
        musicTone('square', midiHz(m + 12), t, st * (sty.arp === 'slow' ? 3 : 1.5), 0.028, { cut: 1500, sustain: 0.35, release: sty.arp === 'slow' ? 0.3 : 0.12, echo: true }); } }
  }
  // melodia
  if (lead && step % 2 === 0) {
    const L = S.lead[bar], i = step / 2, n = L[i];
    if (n !== '-' && n !== '.') {
      let len = 1; while (i + len < 8 && L[i + len] === '-') len++;
      if (i + len === 8 && bar + 1 < S.lead.length) { const N = S.lead[bar + 1]; let k = 0; while (k < 8 && N[k] === '-') { len++; k++; } }   // nota legata oltre la battuta
      const hz = midiHz(noteMidi(n)), dur = len * st * 2 - 0.03;
      if (sty.lead === 'tri') {   // flauto morbido: triangolare + un filo di sinusoide un'ottava sopra
        musicTone('triangle', hz, t, dur, 0.13, { sustain: 0.8, release: 0.2, attack: 0.02, vib: true, echo: true });
        musicTone('sine', hz * 2, t, dur, 0.02, { sustain: 0.6, release: 0.2, attack: 0.02 });
      } else {
        musicTone('square', hz, t, dur, sty.lead === 'soft' ? 0.06 : 0.075, { cut: sty.lead === 'soft' ? 1500 : 2100, sustain: 0.6, release: 0.12, vib: true, echo: true });
        musicTone('triangle', hz, t, dur, 0.06, { sustain: 0.8, release: 0.12 });   // corpo più morbido sotto la quadra
      }
    }
  }
  if (drums && sty.drum !== 'none') {
    if (sty.drum === 'bounce') {
      if (step === 0 || step === 6 || step === 8) musicKick(t, step === 6 ? 0.2 : 0.32);
      if (step === 4 || step === 12) musicNoise(t, 0.12, 0.09, 'bandpass', 1800);
      musicNoise(t, 0.03, step % 4 === 2 ? 0.035 : step % 2 ? 0.01 : 0.02, 'highpass', 7000);
    } else {
      if (step === 0 || step === 8 || step === 11) musicKick(t, step === 11 ? 0.2 : 0.32);
      if (step === 4 || step === 12) musicNoise(t, 0.12, 0.09, 'bandpass', 1800);
      if (step % 2 === 0) musicNoise(t, 0.035, step % 4 === 2 ? 0.035 : 0.02, 'highpass', 7000);
    }
  }
}
function musicVolumeChanged() {
  if (MUSIC.master) MUSIC.master.gain.setTargetAtTime(musicVolume(), MUSIC.ctx.currentTime, 0.05);
  if (MUSIC.ctx) { if (!audioWanted()) setTimeout(() => { if (!audioWanted()) MUSIC.ctx.suspend(); }, 300); else if (!document.hidden) MUSIC.ctx.resume(); }
  else if (audioWanted() && MUSIC.gesture) musicStart();
  refreshMusicBtn();
}
// l'audio serve se la musica è accesa o se ci sono gli effetti (suoni d'ambiente, ambience.js)
function audioWanted() { return musicIsOn() || (settings.volume.sfx || 0) > 0; }
function musicIsOn() { return settings.musicOn !== false && (settings.volume.music || 0) > 0; }
function toggleMusic() {
  if (settings.musicOn !== false && !(settings.volume.music > 0)) settings.volume.music = 70;   // era a zero: si riaccende
  else settings.musicOn = settings.musicOn === false;
  saveSettings(); musicStart(); musicVolumeChanged();
  const r = document.getElementById('vol-music'); if (r) { r.value = settings.volume.music; if (r.nextSibling) r.nextSibling.textContent = settings.volume.music + '%'; }
}
function refreshMusicBtn() {
  const b = document.getElementById('music-btn'); if (!b) return;
  const img = b.querySelector('img.ticon'); if (img) img.src = TOP_ICONS[musicIsOn() ? 'music' : 'musicOff'];
  b.title = TR(musicIsOn() ? 'Musica: accesa' : 'Musica: spenta');
  b.classList.toggle('off', !musicIsOn());
}
function initMusic() {
  const b = document.getElementById('music-btn');
  if (b) b.addEventListener('click', e => { e.stopPropagation(); b.blur(); toggleMusic(); });
  refreshMusicBtn();
  // l'audio può partire solo dopo un gesto del giocatore
  const kick = () => { MUSIC.gesture = true; if (audioWanted()) musicStart(); if (MUSIC.ctx) for (const ev of ['pointerdown', 'keydown', 'touchend']) window.removeEventListener(ev, kick, true); };
  for (const ev of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(ev, kick, true);
  document.addEventListener('visibilitychange', () => {   // scheda nascosta: la musica si ferma
    if (!MUSIC.ctx) return;
    if (document.hidden) MUSIC.ctx.suspend(); else if (audioWanted()) MUSIC.ctx.resume();
  });
}
