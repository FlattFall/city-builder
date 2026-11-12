// ---------- Segnala un bug (menu) ----------
// Il giocatore scrive cosa è successo; il gioco aggiunge da solo alcune informazioni utili
// (versione, lingua, mappa, browser, ultimi errori). "Invia" apre su GitHub una nuova segnalazione
// (issue) già compilata nel repository del gioco: lì arrivano tutte, e GitHub avvisa lo sviluppatore.
const GAME_VERSION = '2026-11-12';
const BUG_REPO = 'FlattFall/city-builder';
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

function sendBugReport() {
  if (!document.getElementById('bug-text').value.trim()) { menuMessage(TR('Scrivi prima cosa è successo.')); return; }
  let body = bugReportBody();
  if (body.length > 6000) body = body.slice(0, 6000) + '\n…';   // gli indirizzi troppo lunghi non si aprono
  const url = 'https://github.com/' + BUG_REPO + '/issues/new?labels=bug&title=' + encodeURIComponent(bugReportTitle()) + '&body=' + encodeURIComponent(body);
  window.open(url, '_blank', 'noopener');
  menuMessage(TR('Si è aperta la pagina della segnalazione: premi "Create" per inviarla. Grazie!'));
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
