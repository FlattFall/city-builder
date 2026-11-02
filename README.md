# City Builder

City builder isometrico in stile retro. Per ora: terreno 128x128, strade, case e demolizione.

## Provarlo sul tuo PC

1. Installa Node.js (versione LTS) da https://nodejs.org
2. Apri un terminale nella cartella del progetto ed esegui:

```
npm install
npm start
```

Si apre la finestra del gioco.

## Creare l'eseguibile (.exe)

```
npm run dist
```

Il file `.exe` compare nella cartella `dist/`. E' portatile: basta un doppio clic.

## Creare l'.exe con GitHub (senza installare nulla)

1. Crea un repository su GitHub e carica tutti i file di questa cartella (compresa `.github`).
2. Vai su **Actions** > **Build Windows** > **Run workflow**.
3. Al termine, scarica l'.exe dalla sezione **Artifacts**.

## Comandi nel gioco

- 1 Mano (trascina la mappa), 2 Strada, 3 Casa, 4 Demolisci; Esc torna alla Mano
- Con Strada e Demolisci tieni premuto il tasto sinistro e trascina per fare più tile
- Tasto destro o centrale + trascina, oppure WASD/frecce: muovi la mappa
- Rotella: zoom
- R: nuovo terreno (chiede conferma se hai costruito qualcosa)
- F11: schermo intero

Il codice è diviso in file dentro `js/`: vedi `CLAUDE.md` per la struttura.
