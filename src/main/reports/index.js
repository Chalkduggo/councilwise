'use strict';
const fs = require('fs');
const path = require('path');
const model = require('./model');
const render = require('./render');
const store = require('../store');

let BrowserWindow = null;
function init(electron) { BrowserWindow = electron.BrowserWindow; }

const NAMES = { full: 'Council-Report', summary: 'Executive-Summary', changes: 'Change-List', raw: 'Raw-Answers' };
const EXT = { pdf: 'pdf', docx: 'docx', txt: 'txt', md: 'md' };

function brand() {
  const st = store.getSettings();
  const byline = [st.authorName, st.authorTitle, st.organisation].filter(Boolean).join(', ');
  return { byline, logoDataUrl: st.logoDataUrl };
}

function safeName(s) { return String(s || 'session').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 50) || 'session'; }

async function toPdf(htmlStr, outPath) {
  const tmp = outPath + '.html';
  fs.writeFileSync(tmp, htmlStr);
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
  try {
    await win.loadFile(tmp);
    const data = await win.webContents.printToPDF({
      pageSize: 'A4', printBackground: true, preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: '<div style="font-family:Segoe UI,Arial;font-size:8px;color:#71717A;width:100%;padding:0 15mm;display:flex;justify-content:space-between"><span>Councilwise</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>'
    });
    fs.writeFileSync(outPath, data);
  } finally {
    win.destroy();
    fs.rmSync(tmp, { force: true });
  }
}

async function generate(session, kind, format) {
  const fmt = EXT[format] ? format : 'pdf';
  const blocks = model.build(session, kind);
  const dir = path.join(store.sessionDir(session.id), 'outputs');
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${safeName(session.title)}-${NAMES[kind] || kind}.${EXT[fmt]}`);
  const b = brand();
  if (fmt === 'pdf') await toPdf(render.html(blocks, b), out);
  else if (fmt === 'docx') fs.writeFileSync(out, await render.docx(blocks, b));
  else if (fmt === 'md') fs.writeFileSync(out, render.md(blocks));
  else fs.writeFileSync(out, render.text(blocks));
  return out;
}

function previewHtml(session, kind) { return render.html(model.build(session, kind || 'full'), brand()); }

module.exports = { init, generate, previewHtml, NAMES };
