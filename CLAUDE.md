# City Builder - note per Claude

Gioco city builder isometrico in stile retro, in JavaScript + Canvas 2D, impacchettato con Electron per Windows. L'utente parla italiano: testi del gioco e risposte in italiano.

## Struttura
- `index.html` + `style.css`: pagina e interfaccia (barra in alto, barra strumenti, info tile, toast).
- `js/`: script classici (niente moduli ES, così funziona anche aprendo il file con doppio clic). L'ordine in `index.html` conta: config, noise, terrain, game, camera, render, ui, input, app.
  - `config.js` costanti, tipi di terreno, colori, costi
  - `game.js` stato (`game`) e regole: `canUseTool`, `useTool`, `buildRoad`, `buildHouse`, `demolish`
  - `render.js` disegno (ordine del pittore, solo tile visibili); `requestDraw()` per ridisegnare
  - `camera.js` camera, zoom, `pickTile` (tiene conto delle quote)
  - `input.js` mouse e tastiera; `ui.js` barra strumenti e HUD
- `main.js` finestra Electron; `.github/workflows/build.yml` crea l'.exe su GitHub Actions.

## Aggiungere uno strumento
1. Voce in `TOOLS` (`js/ui.js`), con tasto e etichetta.
2. Regola in `canUseTool` e azione in `useTool` (`js/game.js`); ogni azione restituisce `{ ok, msg?, silent? }`.
3. Costi in `COSTS` (`js/config.js`). L'anteprima verde/rossa usa `canUseTool`.

## Test
`node tools/smoke-test.js` (serve `playwright`; imposta `SHOTS=cartella` per salvare gli screenshot). Prova picking, strade, case, demolizione, Mano e nuovo terreno in Chromium.

## Da fare (ordine previsto)
Edifici di città e aziende, agricoltura, binari e treni, sprite PNG al posto dei colori disegnati, salvataggio partita.
