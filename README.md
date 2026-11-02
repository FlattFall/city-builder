# City Builder

City builder isometrico in stile retro. Per ora: generazione del terreno (mappa 128x128).

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

- Trascina o WASD/frecce: muovi la mappa
- Rotella: zoom
- R: nuovo terreno
- F11: schermo intero
