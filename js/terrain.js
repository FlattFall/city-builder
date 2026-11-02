// ---------- Generazione del terreno ----------
// Restituisce una matrice N x N di tile:
// { type, elev, path (null/'road'/'dirt'/'rail'), field, building, rb (rotonda) }
function generateTerrain(seed, N) {
  const scale = 0.045 * (64 / N) + 0.02; // le caratteristiche restano grandi anche con mappe grandi
  const map = [];
  for (let y = 0; y < N; y++) {
    const row = [];
    for (let x = 0; x < N; x++) {
      const dx = (x - N / 2) / (N / 2), dy = (y - N / 2) / (N / 2);
      const d = Math.sqrt(dx * dx + dy * dy);
      const v = fbm(x * scale * 1.6, y * scale * 1.6, seed) * 1.15 - d * d * 0.5;
      let type, elev;
      if (v < 0.32) { type = T.WATER; elev = 0; }
      else {
        elev = 1 + Math.floor((v - 0.32) / 0.09);
        if (v < 0.37) type = T.SAND;
        else if (v < 0.62) type = fbm(x * 0.12, y * 0.12, seed + 777) > 0.55 ? T.FOREST : T.GRASS;
        else if (v < 0.75) type = T.ROCK;
        else type = T.SNOW;
      }
      row.push({ type, elev, path: null, main: false, field: false, farm: null, building: null, rb: null });
    }
    map.push(row);
  }
  return map;
}
