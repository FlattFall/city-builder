// Foto da vicino di un edificio nelle 4 rotazioni, con le strade intorno su tutti i lati.
// Uso: node tools/dev/bld-shot.js <strumento> <nome> [zoomIndex]   -> /home/claude/shots/<nome>.png (4 riquadri)
const path = require('path');
const { chromium } = require('playwright');
const [tool, name, zi = '5'] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 620, height: 500 } });
  await page.addInitScript(() => { localStorage.setItem('citybuilder.lang', 'it'); localStorage.setItem('citybuilder.tutorial', 'off'); });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', '..', 'index.html'));
  await page.waitForTimeout(300);
  await page.evaluate(() => { newGame(12345, 128); unlockAll(); game.started = true; document.getElementById('menu').hidden = true; game.money = 1e9; const st = document.createElement('style'); st.textContent = 'body > *:not(canvas){display:none!important}'; document.head.appendChild(st); drawWorkerIcons = () => {}; ACCIDENT.maxChance = 0; CRIME.minPop = 1e9; });
  const shots = [];
  for (let r = 0; r < 4; r++) {
    await page.evaluate(([tool, r, zi]) => {
      // spiano un pezzo di prato, strada tutta intorno e l'edificio in mezzo
      const x0 = 40, y0 = 40;
      for (let y = y0 - 4; y < y0 + 6; y++) for (let x = x0 - 4; x < x0 + 6; x++) {
        const t = game.map[y][x]; if (t.building) game.buildings.delete(t.building.id);
        t.building = null; if (t.path) setPath(x, y, null); t.field = null; t.tree = false; t.type = T.GRASS; t.elev = 3;
      }
      const w = BUILDINGS[tool].w;
      for (let i = -1; i <= w; i++) { useTool('road', x0 + i, y0 - 1); useTool('road', x0 + i, y0 + w); useTool('road', x0 - 1, y0 + i); useTool('road', x0 + w, y0 + i); }
      game.rotation = r;
      const res = useTool(tool, x0, y0);
      if (!res.ok) throw new Error('non piazzato: ' + JSON.stringify(res));
      const b = game.map[y0][x0].building; b.workers = JOBS[b.kind] || 0;
      vehicles.length = 0; peds.length = 0;
      cam.zi = zi; const z = zoomLevel();
      cam.x = view.w / 2 - (x0 + w / 2 - (y0 + w / 2)) * TW / 2 * z;
      cam.y = view.h / 2 - ((x0 + w / 2 + y0 + w / 2) * TH / 2 - 3 * STEP - 14 - (w - 2) * 8) * z;
      game.hover = null; game.tool = 'hand'; game.selected = null;
      requestDraw(); drawFrame();
    }, [tool, r, +zi]);
    await page.waitForTimeout(150);
    shots.push((await page.screenshot()).toString('base64'));
  }
  // un'immagine sola con le 4 rotazioni
  const html = '<body style="margin:0;background:#222;display:grid;grid-template-columns:620px 620px;gap:4px">' +
    shots.map((s, i) => `<div style="position:relative"><img src="data:image/png;base64,${s}"><span style="position:absolute;left:8px;top:6px;color:#fff;font:bold 16px sans-serif;background:#0008;padding:2px 6px">Rotazione ${i + 1}</span></div>`).join('') + '</body>';
  const p2 = await browser.newPage({ viewport: { width: 1244, height: 1004 } });
  await p2.setContent(html);
  require('fs').mkdirSync('/home/claude/shots', { recursive: true });
  await p2.screenshot({ path: `/home/claude/shots/${name}.png` });
  if (errs.length) console.log('ERRORI:', errs);
  console.log('/home/claude/shots/' + name + '.png');
  await browser.close();
})();
