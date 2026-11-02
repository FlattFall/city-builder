# City Builder

City builder isometrico in stile retro. Per ora: terreno 128x128, strade con rampe e rotonde, case e demolizione.

## Provare l'ultima versione (il modo più veloce)

Ad ogni modifica, GitHub pubblica da solo la versione web del gioco in un paio di minuti:

**https://flattfall.github.io/city-builder/**

Basta aprire il link (o premere F5 se è già aperto). Lo stato della pubblicazione si vede in **Actions** > **Versione web**.

## Avviarlo come programma, sempre aggiornato

Una volta sola:
1. Installa **Node.js** (versione LTS) da https://nodejs.org e **Git** da https://git-scm.com
2. Apri un terminale nella cartella dove vuoi il gioco ed esegui:
   ```
   git clone https://github.com/FlattFall/city-builder.git
   ```

Da quel momento fai doppio clic su **`avvia.bat`** nella cartella `city-builder`: scarica le novità da GitHub e apre il gioco. Se il gioco è già aperto e hai aggiornato i file, premi **F5** per ricaricarlo.

## Creare l'eseguibile (.exe)

Con GitHub: **Actions** > **Build Windows** > **Run workflow**, poi scarica l'.exe dalla sezione **Artifacts**.

Sul tuo PC: `npm install` e poi `npm run dist`; l'.exe compare nella cartella `dist/`.

## Comandi nel gioco

- Esc o il pulsante **Menu**: Riprendi, Salva partita, Nuova mappa, Carica mappa, Opzioni, Esci
- 1 Mano (trascina la mappa), 2 Strada, 3 Casa, 4 Demolisci
- Con Strada e Demolisci tieni premuto il tasto sinistro e trascina per fare più tile
- Tasto destro o centrale + trascina, oppure WASD/frecce: muovi la mappa
- Rotella: zoom
- F11: schermo intero, F5: ricarica (nella versione programma)

Le partite salvate restano sul PC (versione programma) o nel browser usato (versione web).

## Strade

- Una strada che sale dritta di un livello crea una **rampa**.
- Un quadrato **2x2** di strade diventa una **rotonda quadrata**. Se è su un dislivello di 1, diventa una piazzola piana al livello più alto e le strade che arrivano dal basso salgono con una rampa, da qualsiasi lato.

Il codice è diviso in file dentro `js/`: vedi `CLAUDE.md` per la struttura.
