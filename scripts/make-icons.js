'use strict';
// Regenerates assets/icon.png and assets/icon.ico from the Councilwise mark.
// Needs "sharp" (npm i -D sharp). The generated files are committed, so normal
// builds do not need to run this.
const fs = require('fs');
const path = require('path');
let sharp;
try { sharp = require('sharp'); } catch { sharp = require(path.join(process.env.NPM_GLOBAL || '', 'sharp')); }

const svg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 160 160">
<rect width="160" height="160" rx="36" fill="#111113"/>
<g transform="translate(20 20)">
<path d="M93.71 31.72 A44 44 0 1 0 93.71 88.28" fill="none" stroke="#FFFFFF" stroke-width="9" stroke-linecap="round"/>
<g fill="#FFFFFF"><circle cx="62.56" cy="16.07" r="8"/><circle cx="29.81" cy="28" r="8"/><circle cx="16" cy="60" r="8"/><circle cx="29.81" cy="92" r="8"/><circle cx="62.56" cy="103.93" r="8"/><circle cx="93.71" cy="88.28" r="8"/></g>
<circle cx="93.71" cy="31.72" r="9" fill="#EF233C"/><circle cx="60" cy="60" r="15" fill="#EF233C"/></g></svg>`;

function ico(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4);
  const entries = [], datas = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, buf } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2); e.writeUInt8(0, 3); e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(buf.length, 8); e.writeUInt32LE(offset, 12);
    offset += buf.length; entries.push(e); datas.push(buf);
  }
  return Buffer.concat([header, ...entries, ...datas]);
}

(async () => {
  const out = path.join(__dirname, '..', 'assets');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'icon.svg'), svg(512));
  await sharp(Buffer.from(svg(512))).png().toFile(path.join(out, 'icon.png'));
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngs = [];
  for (const size of sizes) pngs.push({ size, buf: await sharp(Buffer.from(svg(size))).resize(size, size).png().toBuffer() });
  fs.writeFileSync(path.join(out, 'icon.ico'), ico(pngs));
  console.log('icons written');
})();
