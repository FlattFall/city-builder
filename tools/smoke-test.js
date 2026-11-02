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
      // un tile può essere nascosto da un tile disegnato dopo (davanti e più alto): è normale
      else if (p && (p.y > y || (p.y === y && p.x > x))) hidden++;
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
    for (let seed = 1; seed <= 60 && !best; seed++) {
    newGame(seed); centerCamera(); requestDraw();
    for (let y = 8; y < N - 14; y++)
      for (let x = 8; x < N - 14; x++) {
        let good = true;
        for (let j = 0; j < 6 && good; j++) for (let i = 0; i < 6 && good; i++) {
          if (!buildable(game.map[y + j][x + i]) || !onScreen(x + i, y + j)) good = false;
          if (good && game.map[y + j][x + i].elev !== game.map[y][x].elev) good = false; // blocco piatto
        }
        const d = Math.abs(x + 2 - N / 2) + Math.abs(y + 2 - N / 2);
        if (good && d < bestD) { best = { x, y }; bestD = d; }
      }
    }
    updateHud();
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

  // 11. rampe: cerca A (livello e), B davanti ad A in una direzione (livello e+1), C dietro ad A (livello e)
  const ramp = await page.evaluate(() => {
    const ok = t => t.type === T.SAND || t.type === T.GRASS || t.type === T.FOREST;
    const N = game.size;
    for (let y = 3; y < N - 3; y++) for (let x = 3; x < N - 3; x++) for (let d = 0; d < 4; d++) {
      const A = game.map[y][x], D = DIRS[d];
      const B = game.map[y + D.dy][x + D.dx], C = game.map[y - D.dy][x - D.dx];
      const s1 = DIRS[(d + 1) % 4], s2 = DIRS[(d + 3) % 4];
      const S1 = game.map[y + s1.dy][x + s1.dx], S2 = game.map[y + s2.dy][x + s2.dx];
      if (ok(A) && ok(B) && ok(C) && ok(S1) && ok(S2) && B.elev === A.elev + 1 && C.elev === A.elev && S1.elev === A.elev) {
        // costruisce C, A, B (strada che sale dritta)
        for (const [px, py] of [[x - D.dx, y - D.dy], [x, y], [x + D.dx, y + D.dy]]) buildRoad(px, py);
        const res = {
          x, y, d,
          rampDir: rampDir(x, y),
          upLinked: roadLinked(x, y, d) && roadLinked(x + D.dx, y + D.dy, (d + 2) % 4),
          downLinked: roadLinked(x, y, (d + 2) % 4),
          corners: cornerHeights(x, y), elev: A.elev,
        };
        // strada laterale allo stesso livello: la rampa deve sparire (strade parallele sotto un dislivello)
        buildRoad(x + s1.dx, y + s1.dy);
        res.flatWithSide = rampDir(x, y) === -1 && !roadLinked(x, y, d);
        demolish(x + s1.dx, y + s1.dy);
        res.rampBack = rampDir(x, y) === d;
        return res;
      }
    }
    return null;
  });
  check(!!ramp, 'trovato un punto con dislivello di 1 per provare la rampa');
  if (ramp) {
    check(ramp.rampDir === ramp.d, `la strada in basso diventa rampa (direzione ${ramp.rampDir}, attesa ${ramp.d})`);
    check(ramp.upLinked && ramp.downLinked, 'la rampa è collegata sopra e sotto');
    check(Math.max(...ramp.corners) === ramp.elev + 1 && Math.min(...ramp.corners) === ramp.elev, 'angoli della rampa: ' + ramp.corners.join(','));
    check(ramp.flatWithSide, 'con una strada di lato allo stesso livello resta piatta e non si collega');
    check(ramp.rampBack, 'demolita la strada di lato, torna rampa');

    // screenshot ravvicinato della rampa (zoom 4)
    await page.evaluate(([x, y]) => {
      cam.zi = ZOOMS.length - 1;
      const z = zoomLevel(), t = game.map[y][x];
      cam.x = view.w / 2 - (x - y) * TW / 2 * z;
      cam.y = view.h / 2 - ((x + y) * TH / 2 - t.elev * STEP) * z;
      game.hover = null; requestDraw();
    }, [ramp.x, ramp.y]);
    await page.waitForTimeout(100);
    await page.screenshot({ path: process.env.SHOTS + '/4-ramp.png' });
  }

  // 12. picking sulle pareti: un punto su una parete deve dare il tile a cui appartiene la parete
  const wall = await page.evaluate(() => {
    const z = zoomLevel();
    let ok = 0, tot = 0;
    for (let y = 1; y < game.size - 1 && tot < 300; y++) for (let x = 1; x < game.size - 1 && tot < 300; x++) {
      const t = game.map[y][x];
      const f = game.map[y + 1][x]; // vicino davanti a sinistra
      // (se il tile davanti-davanti è alto quanto noi copre davvero la parete: lo saltiamo)
      if (t.elev - f.elev < 2 || game.map[y + 1][x + 1].elev >= t.elev || t.building || f.building) continue;
      // punto a metà della parete sinistra (sotto il bordo S-W)
      const wxp = (x - y) * TW / 2 - TW / 4;
      const wyp = (x + y) * TH / 2 + TH * 3 / 4 - t.elev * STEP + STEP * 0.75;
      const p = pickTile(cam.x + wxp * z, cam.y + wyp * z);
      tot++;
      if (p && p.x === x && p.y === y) ok++;
    }
    return { ok, tot };
  });
  check(wall.tot > 0 && wall.ok === wall.tot, `picking sulle pareti: ${wall.ok}/${wall.tot}`);

  // 13. anteprima casa su un tile parzialmente coperto da un blocco davanti (screenshot)
  await page.keyboard.press('3');
  const covered = await page.evaluate(() => {
    const ok = t => t.type === T.SAND || t.type === T.GRASS || t.type === T.FOREST;
    for (let y = 30; y < game.size - 30; y++) for (let x = 30; x < game.size - 30; x++) {
      const t = game.map[y][x], front = game.map[y + 1][x + 1];
      // blocco davanti più alto di 1: copre la metà bassa del tile, la metà alta resta visibile
      if (ok(t) && !t.road && !t.building && front.elev === t.elev + 1 &&
          game.map[y][x + 1].elev <= t.elev && game.map[y + 1][x].elev <= t.elev) return { x, y, elev: t.elev };
    }
    return null;
  });
  if (covered) {
    const pos = await page.evaluate(([x, y]) => {
      cam.zi = ZOOMS.length - 1;
      const z = zoomLevel(), t = game.map[y][x];
      cam.x = view.w / 2 - (x - y) * TW / 2 * z;
      cam.y = view.h / 2 - ((x + y) * TH / 2 - t.elev * STEP) * z;
      // punto vicino all'angolo in alto del tile (la parte visibile)
      return { x: cam.x + (x - y) * TW / 2 * z, y: cam.y + ((x + y) * TH / 2 - t.elev * STEP + 3) * z };
    }, [covered.x, covered.y]);
    await page.mouse.move(pos.x, pos.y);
    const hov = await page.evaluate(() => game.hover);
    check(hov && hov.x === covered.x && hov.y === covered.y, 'il tile parzialmente coperto si seleziona dalla parte visibile');
    await page.screenshot({ path: process.env.SHOTS + '/5-preview-covered.png' });
  }

  check(errors.length === 0, 'nessun errore in console' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
})();
