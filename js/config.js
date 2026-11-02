// ---------- Impostazioni generali del gioco ----------
const TW = 32, TH = 16;   // dimensioni del rombo di un tile
const STEP = 8;           // altezza in pixel di un livello di quota
const MAP_SIZES = [       // grandezze tra cui scegliere quando si crea una mappa
  { size: 128, name: 'Piccola' },
  { size: 256, name: 'Media' },
  { size: 512, name: 'Grande' },
  { size: 1024, name: 'Enorme' },
];
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

// ---------- Percorsi (si trascinano per costruirne tanti) ----------
// net = rete: le strade (asfalto e terra) si collegano tra loro, i binari solo con i binari
const PATHS = {
  road: { name: 'Strada', net: 'road', cost: 10 },
  dirt: { name: 'Strada di terra', net: 'road', cost: 4 },
  rail: { name: 'Binari', net: 'rail', cost: 15 },
};

// ---------- Edifici (w x h = tile occupati) ----------
const BUILDINGS = {
  house:     { name: 'Casa', w: 1, h: 1, cost: 100, height: 16, group: 'homes' },
  farm:      { name: 'Fattoria', w: 2, h: 2, cost: 500, height: 34, group: 'industry' },
  warehouse: { name: 'Magazzino alimenti', w: 2, h: 2, cost: 400, height: 20, group: 'industry' },
};

// ---------- Abitanti ----------
const HOUSE_CAPACITY = 4;      // abitanti per casa
const MOVE_IN_EVERY = 1.2;     // secondi tra l'arrivo di un'auto e la successiva
const MAX_CARS = 40;           // auto in giro al massimo (per le prestazioni)
const CAR_SPEED = 1.8;         // tile al secondo
const VAN_SPEED = 1.4;

// ---------- Agricoltura ----------
const CROPS = {
  wheat:  { name: 'Grano',   ripe: '#d9b44a', young: '#9cc94a' },
  carrot: { name: 'Carote',  ripe: '#f08a24', young: '#5dae3a' },
  potato: { name: 'Patate',  ripe: '#7a9a3a', young: '#5dae3a' },
};
const FARM = {
  fieldRadius: 6,     // i campi devono stare entro questa distanza (in tile) dalla fattoria
  inventoryCap: 100,  // inventario massimo della fattoria
  cycleSec: 120,      // secondi dalla semina al raccolto (con tutto il personale)
  yieldPerField: 4,   // unità raccolte per ogni campo
  vanCapacity: 25,    // quanto porta il furgone in un viaggio
  vanMinLoad: 10,     // il furgone parte quando c'è almeno questo
};
const WAREHOUSE_CAPACITY = 1000;

// ---------- Lavoro ----------
// Persone che servono per far funzionare un'attività; lavorano lì gli abitanti delle case
// entro JOB_RADIUS tile
const JOBS = { farm: 4, warehouse: 2 };
const JOB_RADIUS = 12;

// ---------- Modellare il terreno ----------
const MAX_ELEV = 14;

// ---------- Economia (valori provvisori) ----------
const START_MONEY = 50000;
const COSTS = {
  field: 5,
  demolishPath: 5,
  demolishBuilding: 20,
  demolishField: 1,
  clearForest: 2,
  terrain: 15,        // per ogni livello alzato o abbassato
};
