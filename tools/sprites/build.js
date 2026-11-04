// Incorpora gli sprite PNG di assets/sprites in js/sprites.js (come data URI).
// Così le immagini funzionano anche aprendo il gioco da file e nell'app, e le icone
// della barra (create con toDataURL) non danno errori di sicurezza.
//
// Uso:  node tools/sprites/build.js
// Per cambiare una casa basta ridisegnare assets/sprites/house.png (stessa griglia) e rilanciare.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
// cell = grandezza di una cella del foglio; anchor = punto della cella dove sta l'angolo in alto del tile
// cols = rotazioni (0..3), rows = varianti di colore
const SHEETS = {
  house: { file: 'house.png', cell: [64, 84], anchor: [32, 52], cols: 4, rows: 3 },
  // veicoli: colonne = direzione di marcia (0..3), righe = berlina, utilitaria, furgone; anchor = centro a terra
  vehicles: { file: 'vehicles.png', cell: [40, 32], anchor: [20, 22], cols: 4, rows: 3 },
};

let out = '// ---------- Sprite in pixel art (file generato da tools/sprites/build.js: non modificare a mano) ----------\n';
out += 'const SPRITE_DATA = {\n';
for (const [name, s] of Object.entries(SHEETS)) {
  const b64 = fs.readFileSync(path.join(root, 'assets', 'sprites', s.file)).toString('base64');
  out += `  ${name}: { cell: ${JSON.stringify(s.cell)}, anchor: ${JSON.stringify(s.anchor)}, cols: ${s.cols}, rows: ${s.rows},\n`;
  out += `    src: 'data:image/png;base64,${b64}' },\n`;
}
out += '};\n';
fs.writeFileSync(path.join(root, 'js', 'sprite-data.js'), out);
console.log('scritto js/sprite-data.js');
