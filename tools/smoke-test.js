// Test automatico: apre il gioco in Chromium e prova strade, demolizione, zoom e click.
// Uso:  node tools/smoke-test.js   (serve il pacchetto "playwright" installato)
const path = require('path');
const { chromium } = require('playwright');

function check(cond, msg) {
  console.log((cond ? 'OK   ' : 'FAIL ') + msg);
  if (!cond) process.exitCode = 1;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', d => d.accept());

  const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
  await page.goto(url);
  await page.waitForTimeout(300);
  await page.screenshot({ path: process.env.SHOTS + '/1-start.png' });

  // 1. il picking deve restituire il tile giusto (per i tile non coperti da altri)
  const pick = await page.evaluate(() => {
    let ok = 0, tot = 0, hidden = 0;
    for (let i = 0; i < 600; i++) {
      const x = Math.floor(hash(i, 1, 7) * game.size), y = Math.floor(hash(i, 2, 7) * game.size);
      const t = game.map[y][x];
      if (t.type === T.WATER) continue;
      // centro della faccia superiore, in coordinate schermo
      const z = zoomLevel();
      const sx = cam.x + (x - y) * TW / 2 * z;
      const sy = cam.y + ((x + y) * TH / 2 - t.elev * STEP + TH / 2) * z;
      const p = pickTile(sx, sy);
      tot++;
      if (p && p.x === x && p.y === y) ok++;
      // un tile può essere nascosto da un tile più avanti (più alto): è normale
      else if (p && p.x + p.y > x + y) hidden++;
    }
    return { ok, hidden, tot };
  });
  check(pick.ok + pick.hidden === pick.tot, `picking: ${pick.ok} giusti, ${pick.hidden} nascosti da colline, ${pick.tot - pick.ok - pick.hidden} sbagliati`);

  // 2. trova un blocco 6x6 di terra edificabile, visibile sullo schermo, il più vicino al centro
  const run = await page.evaluate(() => {
    const N = game.size, z = zoomLevel();
    const buildable = t => t.type === T.SAND || t.type === T.GRASS || t.type === T.FOREST;
    const onScreen = (x, y) => {
      const t = game.map[y][x];
      const sx = cam.x + (x - y) * TW / 2 * z, sy = cam.y + ((x + y) * TH / 2 - t.elev * STEP + TH / 2) * z;
      return sx > 80 && sx < view.w - 80 && sy > 120 && sy < view.h - 140;
    };
    let best = null, bestD = Infinity;
    for (let y = 8; y < N - 14; y++)
      for (let x = 8; x < N - 14; x++) {
        let good = true;
        for (let j = 0; j < 6 && good; j++) for (let i = 0; i < 6 && good; i++) {
          if (!buildable(game.map[y + j][x + i]) || !onScreen(x + i, y + j)) good = false;
          if (good && i > 0 && Math.abs(game.map[y + j][x + i].elev - game.map[y + j][x + i - 1].elev) > 1) good = false;
        }
        const d = Math.abs(x + 2 - N / 2) + Math.abs(y + 2 - N / 2);
        if (good && d < bestD) { best = { x, y }; bestD = d; }
      }
    return best;
  });
  check(!!run, 'trovato un blocco 6x6 edificabile e visibile');

  const screenOf = (x, y) => page.evaluate(([x, y]) => {
    const t = game.map[y][x], z = zoomLevel();
    return { x: cam.x + (x - y) * TW / 2 * z, y: cam.y + ((x + y) * TH / 2 - t.elev * STEP + TH / 2) * z };
  }, [x, y]);

  const money0 = await page.evaluate(() => game.money);

  // 3. strumento strada (tasto 2): trascina lungo la fila
  await page.keyboard.press('2');
  const a = await screenOf(run.x, run.y), b = await screenOf(run.x + 5, run.y);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.mouse.up();
  const roads = await page.evaluate(() => game.roads);
  check(roads === 6, `strade costruite trascinando: ${roads} (attese 6)`);

  // 4. una strada diagonale trascinata deve restare collegata (percorso a 4 direzioni)
  const c = await screenOf(run.x, run.y), d = await screenOf(run.x + 3, run.y + 3);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(d.x, d.y, { steps: 12 });
  await page.mouse.up();
  const roads2 = await page.evaluate(() => game.roads);
  check(roads2 > roads, `strada diagonale: ora ${roads2} strade`);

  // 5. soldi scalati
  const money1 = await page.evaluate(() => game.money);
  check(money1 < money0, `soldi scalati: ${money0} -> ${money1}`);

  // 6. casa (tasto 3) su un tile libero accanto alla fila
  await page.keyboard.press('3');
  const houseSpot = { x: run.x + 4, y: run.y + 5 }; // angolo del blocco, lontano dalle strade
  const h = await screenOf(houseSpot.x, houseSpot.y);
  await page.mouse.click(h.x, h.y);
  const houses = await page.evaluate(() => game.houses);
  check(houses === 1, `casa costruita: ${houses}`);

  await page.mouse.move(5, 5);
  await page.mouse.move(a.x, a.y + 90);
  await page.screenshot({ path: process.env.SHOTS + '/2-built.png' });

  // 7. zoom con la rotella e screenshot ravvicinato
  await page.mouse.move(a.x + 40, a.y);
  await page.mouse.wheel(0, -100);
  await page.waitForTimeout(150);
  await page.screenshot({ path: process.env.SHOTS + '/3-zoom.png' });

  // 8. demolizione (tasto 4): casa e strade
  await page.keyboard.press('4');
  const roadsBefore = await page.evaluate(() => game.roads);
  const a2 = await screenOf(run.x, run.y), b2 = await screenOf(run.x + 5, run.y);
  await page.mouse.move(a2.x, a2.y);
  await page.mouse.down();
  await page.mouse.move(b2.x, b2.y, { steps: 12 });
  await page.mouse.up();
  const h2 = await screenOf(houseSpot.x, houseSpot.y);
  await page.mouse.click(h2.x, h2.y);
  const after = await page.evaluate(() => ({ roads: game.roads, houses: game.houses }));
  check(after.roads < roadsBefore, `demolizione strade: ${roadsBefore} -> ${after.roads}`);
  check(after.houses === 0, `demolizione casa: ${after.houses} rimaste`);

  // 9. "Mano": trascinare sposta la mappa; tasto destro sposta la mappa
  await page.keyboard.press('1');
  const cam0 = await page.evaluate(() => ({ x: cam.x, y: cam.y }));
  await page.mouse.move(600, 400);
  await page.mouse.down();
  await page.mouse.move(500, 350, { steps: 5 });
  await page.mouse.up();
  const cam1 = await page.evaluate(() => ({ x: cam.x, y: cam.y }));
  check(cam1.x !== cam0.x, 'strumento Mano: la mappa si sposta');

  // 10. nuovo terreno azzera la città
  await page.keyboard.press('r');
  const reset = await page.evaluate(() => ({ r: game.roads, h: game.houses, m: game.money }));
  check(reset.r === 0 && reset.h === 0, `nuovo terreno: strade ${reset.r}, case ${reset.h}, fondi ${reset.m}`);

  check(errors.length === 0, 'nessun errore in console' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
})();
