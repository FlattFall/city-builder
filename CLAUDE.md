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

## Rampe, collegamenti, anteprima e picking
- Ogni tile ha 4 angoli (N, E, S, W) con un'altezza: `cornerHeights(x, y)`. Piatto = tutti uguali.
- Una strada diventa rampa (`rampDir`) se un solo vicino è strada a +1 livello e ai lati non ci sono strade allo stesso livello (la rampa sale dritta; strade parallele sotto un gradino restano piatte).
- Due strade sono collegate (`roadLinked`) se il bordo in comune ha la stessa altezza. Pareti e strade si disegnano dagli angoli, quindi funzionano anche sulle rampe.
- Anteprima: `withPreview` costruisce per finta, disegna e annulla. Anteprima e contorno della selezione si disegnano in ordine, subito dopo il loro tile, così i blocchi davanti li coprono (scelta dell'utente). Il contorno è rientrato di 0.1 per non essere coperto dai vicini allo stesso livello.
- `pickTile` tratta ogni tile come una colonna dal suolo al punto più alto (edifici compresi) e prende quella disegnata per ultima: funziona su pareti e case.

## Rotonde
- Rotonde quadrate (scelta dell'utente: non circolari). `updateRoundabouts()` (va chiamata dopo ogni modifica alle strade) assegna `t.rb = { ax, ay, level }` ai blocchi 2x2 di strade con dislivello <= 1, in modo greedy. La rotonda è sempre piatta a `level` (= quota più alta): `cornerHeights` e `roadLevel` lo usano, così le strade più basse attorno diventano rampe normali da qualsiasi lato.
- `drawRoundabout` disegna isola e corsia quadrate per quarti, ritagliati sul rombo del tile (allargato di poco per non lasciare righe).

## Menu e salvataggi
- `menu.js`: menu principale/pausa (Riprendi e Salva solo se `game.started`), Carica, Opzioni ("ci stiamo lavorando"), Esci (`window.close()` in Electron). All'avvio una mappa casuale fa da sfondo e `game.started` è false. Esc apre/chiude il menu; con il menu aperto `input.js` ignora tastiera e mouse.
- `save.js`: salvataggi in localStorage (`citybuilder.saves.v1`), mappa serializzata come stringhe (tipo, quota in base 36, strade) + lista edifici. `game.dirty` = modifiche non salvate (chiede conferma prima di perderle).

## Pubblicazione e prove
- `.github/workflows/pages.yml` pubblica index.html, style.css e js/ su GitHub Pages ad ogni push su main (https://flattfall.github.io/city-builder/). Pages va attivato a mano: Settings > Pages > Source: GitHub Actions.
- `avvia.bat` (CRLF): git pull + npm start. In Electron F5 ricarica.

## Aggiungere uno strumento
1. Voce in `TOOLS` (`js/ui.js`), con tasto e etichetta.
2. Regola in `canUseTool` e azione in `useTool` (`js/game.js`); ogni azione restituisce `{ ok, msg?, silent? }`.
3. Costi in `COSTS` (`js/config.js`). L'anteprima verde/rossa usa `canUseTool`.

## Test
`node tools/smoke-test.js` (serve `playwright`; imposta `SHOTS=cartella` per salvare gli screenshot). Prova picking, strade, case, demolizione, Mano e nuovo terreno in Chromium.

## Da fare (ordine previsto)
Edifici di città e aziende, agricoltura, binari e treni, sprite PNG al posto dei colori disegnati, salvataggio partita.
