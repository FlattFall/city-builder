// ---------- Segnala un bug (menu) ----------
// Il giocatore scrive cosa è successo; il gioco aggiunge da solo alcune informazioni utili
// (versione, lingua, mappa, browser, ultimi errori). "Invia" la manda direttamente all'email del gioco
// (supplyville.game@gmail.com; richiesta dell'utente: niente GitHub, niente app della posta del giocatore)
// con FormSubmit (https://formsubmit.co, gratis, nessun account): alla prima segnalazione FormSubmit manda
// all'email un messaggio di attivazione; dopo averla attivata le segnalazioni arrivano tutte lì.
// (Dopo l'attivazione FormSubmit dà anche un codice da mettere al posto dell'indirizzo, per non mostrarlo.)
const GAME_VERSION = '2026-11-13';
let BUG_FORM_URL = 'https://formsubmit.co/ajax/supplyville.game@gmail.com';
const recentErrors = [];   // ultimi errori della pagina (si allegano alla segnalazione)
addEventListener('error', e => { recentErrors.push(String(e.message || e.error || e).slice(0, 200)); if (recentErrors.length > 8) recentErrors.shift(); });
addEventListener('unhandledrejection', e => { recentErrors.push(String(e.reason).slice(0, 200)); if (recentErrors.length > 8) recentErrors.shift(); });

function bugInfo() {
  const lines = [
    'Versione: ' + GAME_VERSION,
    'Lingua: ' + LANG,
    'Browser: ' + navigator.userAgent,
    'Schermo: ' + innerWidth + 'x' + innerHeight,
  ];
  if (game.started) {
    lines.push('Mappa: ' + game.size + 'x' + game.size + ' (seed ' + game.seed + ')',
      'Fondi: ' + Math.floor(game.money) + ' - abitanti: ' + game.population + ' - edifici: ' + game.buildings.size,
      'Strumento: ' + game.tool + ' - zoom: ' + zoomLevel());
  }
  if (recentErrors.length) lines.push('Errori:', ...recentErrors.map(e => '  ' + e));
  return lines.join('\n');
}

function bugReportBody() {
  const what = document.getElementById('bug-text').value.trim();
  const who = document.getElementById('bug-name').value.trim();
  let body = '### ' + TR('Cosa è successo') + '\n' + (what || '-') + '\n\n';
  if (who) body += '### ' + TR('Nome') + '\n' + who + '\n\n';
  if (document.getElementById('bug-info').checked) body += '### ' + TR('Informazioni del gioco') + '\n```\n' + bugInfo() + '\n```\n';
  return body;
}
function bugReportTitle() {
  const what = document.getElementById('bug-text').value.trim().split('\n')[0];
  return '[Bug] ' + (what.length > 70 ? what.slice(0, 70) + '…' : what || TR('Segnalazione'));
}

let bugSending = false;
async function sendBugReport() {
  if (bugSending) return;
  if (!document.getElementById('bug-text').value.trim()) { menuMessage(TR('Scrivi prima cosa è successo.')); return; }
  const btn = document.getElementById('bug-send');
  bugSending = true; btn.disabled = true;
  menuMessage(TR('Invio in corso...'));
  try {
    const who = document.getElementById('bug-name').value.trim();
    const r = await fetch(BUG_FORM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ _subject: 'Supplyville - ' + bugReportTitle(), _template: 'box', _captcha: 'false',
        name: who || '-', message: bugReportBody().slice(0, 8000), version: GAME_VERSION, _honey: '' }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.success === false || j.success === 'false') throw new Error(j.message || r.status);
    document.getElementById('bug-text').value = '';
    menuMessage(TR('Segnalazione inviata. Grazie!'));
  } catch (e) {
    menuMessage(TR('Invio non riuscito (sei connesso a internet?). Puoi riprovare o copiare il testo.'));
  } finally { bugSending = false; btn.disabled = false; }
}

function copyBugReport() {
  const text = bugReportTitle() + '\n\n' + bugReportBody();
  const done = () => menuMessage(TR('Testo copiato: puoi incollarlo dove vuoi.'));
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
  else fallbackCopy(text, done);
}
function fallbackCopy(text, done) {
  const ta = document.createElement('textarea');
  ta.value = text; document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); done(); } catch (e) { menuMessage(TR('Non riesco a copiare il testo.')); }
  ta.remove();
}

function initBugReport() {
  document.getElementById('m-bug').addEventListener('click', () => showMenuPage('bug'));
  document.getElementById('bug-send').addEventListener('click', sendBugReport);
  document.getElementById('bug-copy').addEventListener('click', copyBugReport);
  // mentre si scrive i tasti del gioco non devono fare niente (anche Esc chiude solo la pagina)
  for (const id of ['bug-text', 'bug-name']) document.getElementById(id).addEventListener('keydown', e => e.stopPropagation());
}
