// Renders assets/icon.svg → assets/icon.png at 128x128.
// Run with: node scripts/render-icon.mjs
// (sharp is installed on demand; it's not a regular dev dependency.)
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const svgPath = join(root, 'assets', 'icon.svg');
const pngPath = join(root, 'assets', 'icon.png');

const svg = readFileSync(svgPath);
const png = await sharp(svg, { density: 384 }).resize(128, 128).png().toBuffer();
writeFileSync(pngPath, png);

console.log(`Wrote ${pngPath} (${png.length} bytes)`);
