// Copies the existing static frontend into the directory embedded by Tauri.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'dist-tauri');

fs.mkdirSync(outDir, { recursive: true });

for (const file of ['index.html', 'reader.html']) {
  fs.copyFileSync(path.join(root, file), path.join(outDir, file));
}

for (const dir of ['src']) {
  fs.cpSync(path.join(root, dir), path.join(outDir, dir), { recursive: true });
}

console.log(`Tauri assets copied to ${outDir}`);
