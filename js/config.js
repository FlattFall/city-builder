// ---------- Impostazioni generali del gioco ----------
const TW = 32, TH = 16;   // dimensioni del rombo di un tile
const STEP = 8;           // altezza in pixel di un livello di quota
const MAP_SIZE = 128;     // dimensione mappa (N x N). Prova 96, 128, 192, 256
const ZOOMS = [0.5, 1, 2, 3, 4];

// ---------- Terreno ----------
const T = { WATER: 0, SAND: 1, GRASS: 2, FOREST: 3, ROCK: 4, SNOW: 5 };
const TERRAIN_NAMES = ['Acqua', 'Sabbia', 'Erba', 'Foresta', 'Roccia', 'Neve'];
const COLORS = {
  [T.WATER]:  ['#2f6fb3', '#265b96', '#1f4a7c'],
  [T.SAND]:   ['#e8d28a', '#c9b06b', '#a8904f'],
  [T.GRASS]:  ['#5aa845', '#478a38', '#386f2d'],
  [T.FOREST]: ['#3f8f3a', '#327530', '#265c26'],
  [T.ROCK]:   ['#8a8478', '#6f695f', '#58534b'],
  [T.SNOW]:   ['#f2f5f8', '#c9d2dc', '#a5b0bd'],
};
// [superficie, parete sinistra, parete destra]

// ---------- Economia (valori provvisori) ----------
const START_MONEY = 50000;
const COSTS = {
  road: 10,
  house: 100,
  demolishRoad: 5,
  demolishHouse: 20,
  clearForest: 2,
};
