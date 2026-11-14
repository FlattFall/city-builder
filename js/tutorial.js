// ---------- Tutorial (richiesta dell'utente) ----------
// All'inizio di una mappa nuova una scheda chiede se leggere il tutorial o giocare subito.
// Il tutorial è una scheda piccola in alto a sinistra (si gioca mentre si legge): case, acqua, scarico,
// corrente, fattoria, supermercato, poi lavoratori e progressi. Ogni passo dice se è già fatto (✓),
// "Prendi lo strumento" lo mette in mano. Si chiude quando si vuole; si riapre dal menu (Tutorial).
// "Non mostrarlo più" si ricorda in localStorage (citybuilder.tutorial = 'off').
const TUT_KEY = 'citybuilder.tutorial';
const countKind = (k, f) => [...game.buildings.values()].filter(b => b.kind === k && (!f || f(b))).length;
const TUT_STEPS = [
  { title: 'Benvenuto a Supplyville!', icon: 'house', anim: 'intro',
    text: 'In pochi passi costruisci una città che funziona: le prime <b>case</b>, l\'<b>acqua</b>, la <b>corrente</b> e la prima <b>fattoria</b>.<br><br>Puoi leggere il tutorial passo per passo mentre giochi, oppure chiuderlo e giocare subito.' },
  { title: 'Le prime case', icon: 'house', tool: 'house',
    text: 'Le famiglie arrivano in auto dalla <b>strada principale</b> (l\'autostrada che attraversa la mappa). Costruisci qualche <b>casa</b> (gruppo 3, Città) accanto alla strada principale o a strade collegate a lei.',
    goal: 'Costruisci 4 case', done: () => countKind('house') >= 4 },
  { title: "L'acqua: il pozzo", icon: 'waterWell', tool: 'waterWell',
    text: 'Senza acqua ogni casa ospita solo metà famiglia e le aziende vanno piano. Prendi il <b>pozzo</b>: le zone azzurre sono le falde. Mettilo lì, accanto a una strada: sotto ogni strada passa un tubo dell\'acqua.',
    goal: 'Costruisci un pozzo collegato', done: () => countKind('waterWell', b => b.wnet != null) >= 1 },
  { title: "L'acqua: lo scarico", icon: 'sewage', tool: 'sewage',
    text: 'L\'acqua usata deve andare via: costruisci uno <b>scarico</b> in riva al mare, con il retro sull\'acqua. Se non ha una strada accanto, collegalo con il <b>tubo</b> fino a una strada. Con il tasto <b>Sottosuolo</b> vedi tutti i tubi.',
    goal: 'Costruisci uno scarico collegato', done: () => countKind('sewage', b => b.wnet != null) >= 1 },
  { title: 'La corrente', icon: 'pylon', tool: 'pylon',
    text: 'Case e aziende vogliono la corrente. Il modo più semplice: un <b>traliccio</b> vicino al bordo della mappa (compra la corrente da fuori), altri tralicci fino alla città e una <b>sottostazione</b> accanto a una strada asfaltata: sotto le strade asfaltate passano i cavi. Più avanti potrai costruire le tue centrali.',
    goal: 'Una sottostazione collegata al traliccio', done: () => countKind('substation', b => b.works) >= 1 },
  { title: 'La prima fattoria', icon: 'farm', tool: 'farm',
    text: 'Ora il cibo. Costruisci una <b>fattoria</b> (gruppo 4) sull\'erba, non troppo lontano dalle case: i lavoratori vengono da lì. Dopo averla piazzata tocca i <b>campi</b> intorno e premi <b>Fatto</b>. Nel pannello della fattoria (clic con la Mano) scegli cosa coltivare.',
    goal: 'Una fattoria con almeno un campo', done: () => countKind('farm', b => (b.fields || 0) > 0) >= 1 },
  { title: 'Vendere il raccolto', icon: 'supermarket', tool: 'supermarket',
    text: 'Costruisci un <b>supermercato</b> vicino alle case. Poi apri il pannello della fattoria e scegli il supermercato come <b>destinazione</b>: i furgoni portano la verdura, gli abitanti la comprano e tu incassi le <b>tasse</b>.',
    goal: 'La fattoria manda la merce al supermercato',
    done: () => [...game.buildings.values()].some(f => f.kind === 'farm' && (f.dests || []).some(id => { const s = game.buildings.get(id); return s && s.kind === 'supermarket'; })) },
  { title: 'E adesso?', icon: 'warehouse', anim: 'end',
    text: 'Ogni azienda vuole <b>lavoratori</b>: servono case vicine. Le <b>icone</b> sopra gli edifici dicono cosa manca (strada, lavoratori, acqua, corrente). Con i soldi sblocca nuovi settori in <b>Progressi</b>, e nel <b>Manuale</b> trovi spiegato ogni settore.<br><br>Buon divertimento!' },
];

let tutStep = 0, tutTimer = null;
function tutorialEnabled() { try { return localStorage.getItem(TUT_KEY) !== 'off'; } catch (e) { return true; } }
function setTutorialEnabled(on) { try { localStorage.setItem(TUT_KEY, on ? 'on' : 'off'); } catch (e) { /* niente */ } }
function tutorialIsOpen() { const el = document.getElementById('tutorial'); return !!el && !el.hidden; }
let tutStopAnim = null;
function stopTutAnim() { if (tutStopAnim) tutStopAnim(); tutStopAnim = null; tutHighlight(null); }
// evidenzia nella barra il gruppo dello strumento del passo (e la voce nel sottomenu, se aperto)
function tutHighlight(tool) {
  document.querySelectorAll('.tut-pulse').forEach(e => e.classList.remove('tut-pulse'));
  if (!tool || typeof groupOf !== 'function') return;
  const g = groupOf(tool), gb = g && document.getElementById('group-' + g.id);
  if (gb && game.tool !== tool) gb.classList.add('tut-pulse');
  const sb = document.querySelector('#submenu [data-tool="' + tool + '"]');
  if (sb && game.tool !== tool) sb.classList.add('tut-pulse');
}
function closeTutorial() {
  const el = document.getElementById('tutorial');
  stopTutAnim();
  if (el) el.hidden = true;
  document.body.classList.remove('tut-open');
  clearInterval(tutTimer); tutTimer = null;
}
// all'inizio di una mappa nuova (menu.js)
function maybeStartTutorial() { if (tutorialEnabled()) openTutorial(0); }
function openTutorial(step = 0) {
  let el = document.getElementById('tutorial');
  if (!el) {
    el = document.createElement('div');
    el.id = 'tutorial';
    document.body.appendChild(el);
  }
  tutStep = Math.max(0, Math.min(TUT_STEPS.length - 1, step));
  el.hidden = false;
  document.body.classList.add('tut-open');   // l'aiuto dei tasti sta nello stesso angolo: si nasconde
  renderTutorial();
  clearInterval(tutTimer);
  tutTimer = setInterval(() => { if (tutorialIsOpen()) refreshTutorialStatus(); }, 1000);
}
function refreshTutorialStatus() {
  const s = TUT_STEPS[tutStep], st = document.getElementById('tut-status');
  if (s) tutHighlight(s.tool);
  if (!s || !s.done || !st) return;
  const ok = !!s.done();
  st.className = 'tut-status' + (ok ? ' ok' : '');
  st.textContent = (ok ? '✓ ' : '○ ') + TR(s.goal);
  const next = document.getElementById('tut-next');
  if (next) next.classList.toggle('pulse', ok);
}
function renderTutorial() {
  const el = document.getElementById('tutorial'), s = TUT_STEPS[tutStep], last = tutStep === TUT_STEPS.length - 1;
  const kind = s.anim || s.tool || 'intro', caps = (typeof TA_SCENES !== 'undefined' && TA_SCENES[kind] && TA_SCENES[kind].caps) || [];
  const btn = (id, label, cls = '') => `<button id="${id}" class="${cls}">${label}</button>`;
  let foot;
  if (tutStep === 0) {
    foot = btn('tut-start', TR('Leggi il tutorial'), 'main') + btn('tut-skip', TR('Gioca subito')) +
      `<label class="tut-never"><input type="checkbox" id="tut-never"${tutorialEnabled() ? '' : ' checked'}> ${TR('Non mostrarlo più')}</label>`;
  } else {
    foot = btn('tut-prev', '◀') + (s.tool ? btn('tut-tool', TR('Prendi lo strumento')) : '') +
      btn('tut-next', last ? TR('Gioca!') : TR('Avanti') + ' ▶', 'main');
  }
  el.innerHTML = `<div class="tut-head"><img src="${ICONS[s.icon] || ''}" alt=""><div><small>${tutStep ? TR('Tutorial {a}/{b}', { a: tutStep, b: TUT_STEPS.length - 1 }) : TR('Tutorial')}</small>
    <b>${TR(s.title)}</b></div><button id="tut-close" class="tut-x" title="${TR('Chiudi')}">✕</button></div>
    <div class="tut-vis"><canvas id="tut-anim" class="tut-anim"></canvas>${caps.length ? '<ol class="tut-caps">' + caps.map((k, i) => `<li data-i="${i}"><i>${i + 1}</i><span>${TR(k)}</span></li>`).join('') + '</ol>' : ''}</div><div class="tut-text">${TR(s.text)}</div>${s.goal ? '<div id="tut-status" class="tut-status"></div>' : ''}<div class="tut-foot">${foot}</div>`;
  el.classList.toggle('has-caps', caps.length > 0);
  stopTutAnim();
  const cv = document.getElementById('tut-anim');
  if (cv && typeof startTutAnim === 'function') tutStopAnim = startTutAnim(cv, kind, ph => {
    el.querySelectorAll('.tut-caps li').forEach(li => { const i = +li.dataset.i; li.className = i === ph ? 'on' : i < ph ? 'done' : ''; });
  });
  const on = (id, f) => { const b = document.getElementById(id); if (b) b.addEventListener('click', e => { e.stopPropagation(); f(); }); };
  on('tut-close', closeTutorial);
  on('tut-start', () => { tutStep = 1; renderTutorial(); });
  on('tut-skip', closeTutorial);
  on('tut-prev', () => { tutStep--; renderTutorial(); });
  on('tut-next', () => { if (last) closeTutorial(); else { tutStep++; renderTutorial(); } });
  on('tut-tool', () => { if (typeof toolLocked === 'function' && toolLocked(s.tool)) { openProgress(unlockFor(s.tool).id); return; } setTool(s.tool); });
  const never = document.getElementById('tut-never');
  if (never) never.addEventListener('change', () => setTutorialEnabled(!never.checked));
  refreshTutorialStatus();
}
