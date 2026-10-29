'use strict';
// Renderers for the report blocks: HTML (used for PDF), Word (.docx), text and Markdown.

const { R } = require('./model');

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const RATING_CLASS = { pass: 'r-pass', weak: 'r-weak', at_risk: 'r-risk', unproven: 'r-unp' };

const MARK = `<svg viewBox="0 0 120 120" width="44" height="44" aria-hidden="true"><path d="M93.71 31.72 A44 44 0 1 0 93.71 88.28" fill="none" stroke="#111113" stroke-width="8" stroke-linecap="round"/><g fill="#111113"><circle cx="62.56" cy="16.07" r="7.5"/><circle cx="29.81" cy="28" r="7.5"/><circle cx="16" cy="60" r="7.5"/><circle cx="29.81" cy="92" r="7.5"/><circle cx="62.56" cy="103.93" r="7.5"/><circle cx="93.71" cy="88.28" r="7.5"/></g><circle cx="93.71" cy="31.72" r="8.5" fill="#D7192F"/><circle cx="60" cy="60" r="13" fill="#D7192F"/></svg>`;

function html(blocks, brand = {}) {
  const body = blocks.map(b => blockHtml(b, brand)).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(blocks[0] && blocks[0].title)}</title><style>${CSS}</style></head><body>${body}</body></html>`;
}

function blockHtml(b, brand) {
  switch (b.t) {
    case 'cover': return `<header class="cover">
      <div class="brandrow">${brand.logoDataUrl ? `<img class="logo" src="${esc(brand.logoDataUrl)}" alt="">` : MARK}<div class="wordmark">Council<span>wise</span></div>${b.demo ? '<span class="demo">DEMO DATA</span>' : ''}</div>
      <h1>${esc(b.title)}</h1>
      <div class="meta">${esc(b.sessionTitle)} · ${esc(b.docName)} · ${esc(b.date)}${brand.byline ? ` · ${esc(brand.byline)}` : ''}</div></header>`;
    case 'verdict': return `<section class="verdict v-${esc(b.verdictId)}">
      <div class="vleft"><div class="k">Council verdict</div><div class="vv">${esc(b.verdict)}</div><div class="hl">${esc(b.headline)}</div></div>
      <div class="vright"><div class="k">Confidence score</div><div class="score">${b.score}<small>/100</small></div><div class="lbl">${esc(b.label)} · moderator said ${esc(b.stated)}</div>
      <div class="bar"><i style="width:${Math.max(2, Math.min(100, b.score))}%"></i></div></div></section>`;
    case 'h1': return `<h1>${esc(b.text)}</h1>`;
    case 'h2': return `<h2>${esc(b.text)}</h2>`;
    case 'p': return `<p>${esc(b.text)}</p>`;
    case 'pre': return `<pre>${esc(b.text)}</pre>`;
    case 'list': return `<ul>${b.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`;
    case 'table': return `<table><colgroup>${(b.widths || []).map(w => `<col style="width:${w}%">`).join('')}</colgroup><thead><tr>${b.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${b.rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    case 'grid': {
      const n = b.head.length - 1, w = Math.max(5, Math.floor(70 / n));
      return `<table class="grid"><colgroup><col style="width:${100 - w * n}%">${b.head.slice(1).map(() => `<col style="width:${w}%">`).join('')}</colgroup>
      <thead><tr>${b.head.map((h, i) => `<th${i > 0 ? ' class="c"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${b.rows.map(r => `<tr><td>${esc(r[0])}</td>${r.slice(1).map((c, i) => `<td class="hc ${RATING_CLASS[c] || ''}${i === 0 ? ' council' : ''}">${esc(R[c] || c)}</td>`).join('')}</tr>`).join('')}</tbody></table>
      <div class="legend"><span class="chip r-pass">Pass</span><span class="chip r-weak">Weak</span><span class="chip r-unp">Unproven</span><span class="chip r-risk">At risk</span><span class="small">Outlined column = council rating</span></div>`;
    }
    case 'tally': return `<div class="tally">${b.items.map(i => `<div class="t t-${esc(i.id)}"><b>${i.n}</b><span>${esc(i.label)}</span></div>`).join('')}</div>`;
    case 'finding': return `<div class="finding"><div class="fh"><span class="n">${b.n}</span><span class="sev s-${esc(b.severity)}">${esc(b.severity)}</span><b>${esc(b.title)}</b></div>
      <p>${esc(b.detail)}</p>${b.recommendation ? `<p class="rec"><b>Recommendation:</b> ${esc(b.recommendation)}</p>` : ''}${b.raisedBy ? `<p class="by">Raised by ${esc(b.raisedBy)}</p>` : ''}</div>`;
    case 'stats': return `<div class="stats">${b.items.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>`;
    default: return '';
  }
}

const CSS = `
@page { size: A4; margin: 16mm 15mm 18mm 15mm; }
* { box-sizing: border-box; }
body { font-family: "Segoe UI", Inter, Arial, sans-serif; color: #111113; font-size: 10.5pt; line-height: 1.5; margin: 0; }
.cover { border-bottom: 3px solid #111113; padding-bottom: 12px; margin-bottom: 16px; }
.brandrow { display: flex; align-items: center; gap: 10px; }
.logo { height: 40px; }
.wordmark { font-weight: 800; font-size: 18pt; letter-spacing: -0.5px; } .wordmark span { color: #D7192F; }
.demo { margin-left: auto; background: #D7192F; color: #fff; font-weight: 700; font-size: 8pt; padding: 3px 8px; border-radius: 6px; letter-spacing: 1px; }
h1 { font-size: 24pt; margin: 14px 0 2px; letter-spacing: -0.5px; }
.meta { color: #52525B; font-size: 9pt; }
h2 { font-size: 13.5pt; margin: 22px 0 8px; padding-top: 6px; border-top: 1px solid #E4E4E7; break-after: avoid; }
p { margin: 0 0 8px; }
ul { margin: 0 0 8px 18px; padding: 0; } li { margin-bottom: 3px; }
.verdict { display: flex; gap: 16px; background: #111113; color: #fff; border-radius: 12px; padding: 18px 20px; break-inside: avoid; }
.vleft { flex: 1.5; } .vright { flex: 1; border-left: 1px solid #3F3F46; padding-left: 16px; }
.k { font-size: 8pt; letter-spacing: 1.2px; text-transform: uppercase; color: #A1A1AA; }
.vv { font-size: 22pt; font-weight: 800; margin: 2px 0 6px; } .v-no_go .vv, .v-revise .vv { color: #FF6B7A; }
.hl { color: #E4E4E7; font-size: 10.5pt; }
.score { font-size: 30pt; font-weight: 800; line-height: 1.1; color: #EF233C; } .score small { font-size: 12pt; color: #A1A1AA; }
.lbl { font-size: 9pt; color: #D4D4D8; margin: 2px 0 8px; }
.bar { height: 6px; background: #3F3F46; border-radius: 3px; overflow: hidden; } .bar i { display: block; height: 100%; background: #EF233C; }
table { width: 100%; border-collapse: collapse; margin: 6px 0 10px; font-size: 9pt; table-layout: fixed; }
th { text-align: left; background: #F4F4F5; color: #52525B; font-weight: 600; padding: 6px 7px; border-bottom: 1px solid #D4D4D8; }
td { padding: 6px 7px; border-bottom: 1px solid #E4E4E7; vertical-align: top; word-wrap: break-word; }
tr { break-inside: avoid; }
.grid th.c { text-align: center; font-size: 8pt; }
.grid { border-collapse: separate; border-spacing: 2px; }
.grid td { border-bottom: 0; }
.grid td.hc { text-align: center; font-size: 6.8pt; font-weight: 600; border-radius: 4px; padding: 5px 1px; white-space: nowrap; overflow: hidden; }
.grid td.council { outline: 1.5px solid #111113; outline-offset: 1px; }
.small { font-size: 8pt; color: #71717A; align-self: center; }
.chip { display: inline-block; padding: 1px 7px; border-radius: 999px; font-size: 8pt; font-weight: 600; border: 1px solid transparent; white-space: nowrap; }
.chip.big { font-size: 8.5pt; padding: 2px 9px; }
.r-pass { background: #111113; color: #fff; } .r-weak { background: #E4E4E7; color: #3F3F46; }
.r-risk { background: #D7192F; color: #fff; } .r-unp { background: #fff; color: #A30F21; border-color: #D7192F; }
td.r-unp { box-shadow: inset 0 0 0 1px #D7192F; }
.legend { display: flex; gap: 6px; margin-bottom: 8px; }
.tally { display: flex; gap: 8px; margin: 8px 0; } .tally .t { flex: 1; border: 1px solid #E4E4E7; border-radius: 10px; padding: 8px 10px; }
.tally b { display: block; font-size: 16pt; } .tally span { color: #52525B; font-size: 8.5pt; }
.t-go_with_conditions { border-color: #111113 !important; } .t-no_go b, .t-revise b { color: #D7192F; }
.finding { border: 1px solid #E4E4E7; border-left: 4px solid #111113; border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; break-inside: avoid; }
.fh { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.fh .n { width: 20px; height: 20px; border-radius: 50%; background: #111113; color: #fff; font-size: 8pt; display: inline-flex; align-items: center; justify-content: center; }
.sev { font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.8px; padding: 1px 6px; border-radius: 4px; background: #E4E4E7; }
.s-critical { background: #D7192F; color: #fff; } .s-major { background: #111113; color: #fff; }
.rec { color: #27272A; } .by { color: #71717A; font-size: 8.5pt; margin: 0; }
.stats { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
.stats div { border: 1px solid #E4E4E7; border-radius: 8px; padding: 7px 9px; } .stats span { display: block; color: #71717A; font-size: 8pt; } .stats b { font-size: 11pt; }
pre { white-space: pre-wrap; font-family: Consolas, "JetBrains Mono", monospace; font-size: 8.5pt; background: #F4F4F5; padding: 10px; border-radius: 8px; }
`;

// ---------- text and markdown ----------
function text(blocks) {
  const out = [];
  const line = (s = '') => out.push(s);
  for (const b of blocks) {
    switch (b.t) {
      case 'cover': line('COUNCILWISE · ' + b.title.toUpperCase()); line(`${b.sessionTitle} · ${b.docName} · ${b.date}${b.demo ? ' · DEMO DATA' : ''}`); line('='.repeat(72)); break;
      case 'verdict': line(`VERDICT: ${b.verdict}`); line(`CONFIDENCE SCORE: ${b.score}/100 (${b.label}) · moderator said ${b.stated}`); if (b.headline) line(b.headline); line(); break;
      case 'h2': line(); line(b.text.toUpperCase()); line('-'.repeat(Math.min(72, b.text.length))); break;
      case 'p': line(b.text); break;
      case 'pre': line(b.text); break;
      case 'list': b.items.forEach(i => line('  • ' + i)); break;
      case 'table': case 'grid': {
        const rows = b.t === 'grid' ? b.rows.map(r => [r[0], ...r.slice(1).map(c => R[c] || c)]) : b.rows;
        line(b.head.join(' | '));
        rows.forEach(r => line(r.join(' | ')));
        break;
      }
      case 'tally': line(b.items.map(i => `${i.label}: ${i.n}`).join('   ')); break;
      case 'finding': line(`${b.n}. [${b.severity.toUpperCase()}] ${b.title}`); line('   ' + b.detail); if (b.recommendation) line('   Recommendation: ' + b.recommendation); if (b.raisedBy) line('   Raised by: ' + b.raisedBy); line(); break;
      case 'stats': b.items.forEach(([k, v]) => line(`${k}: ${v}`)); break;
      default: break;
    }
  }
  return out.join('\n') + '\n';
}

function md(blocks) {
  const out = [];
  const cell = s => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  for (const b of blocks) {
    switch (b.t) {
      case 'cover': out.push(`# ${b.title}`, '', `*${b.sessionTitle} · ${b.docName} · ${b.date}*${b.demo ? ' · **DEMO DATA**' : ''}`, ''); break;
      case 'verdict': out.push(`> **Verdict: ${b.verdict}** · **Confidence ${b.score}/100 (${b.label})** · moderator said ${b.stated}`, `> ${b.headline || ''}`, ''); break;
      case 'h2': out.push(`## ${b.text}`, ''); break;
      case 'p': out.push(b.text, ''); break;
      case 'pre': out.push('```text', b.text, '```', ''); break;
      case 'list': out.push(...b.items.map(i => `- ${i}`), ''); break;
      case 'table': case 'grid': {
        const rows = b.t === 'grid' ? b.rows.map(r => [r[0], ...r.slice(1).map(c => R[c] || c)]) : b.rows;
        out.push(`| ${b.head.map(cell).join(' | ')} |`, `|${b.head.map(() => '---').join('|')}|`, ...rows.map(r => `| ${r.map(cell).join(' | ')} |`), '');
        break;
      }
      case 'tally': out.push(b.items.map(i => `**${i.label}:** ${i.n}`).join(' · '), ''); break;
      case 'finding': out.push(`**${b.n}. ${b.title}** · *${b.severity}*`, '', b.detail, '', ...(b.recommendation ? [`*Recommendation:* ${b.recommendation}`, ''] : []), ...(b.raisedBy ? [`<sub>Raised by ${b.raisedBy}</sub>`, ''] : [])); break;
      case 'stats': out.push(`| ${b.items.map(i => cell(i[0])).join(' | ')} |`, `|${b.items.map(() => '---').join('|')}|`, `| ${b.items.map(i => cell(i[1])).join(' | ')} |`, ''); break;
      default: break;
    }
  }
  return out.join('\n');
}

// ---------- Word ----------
async function docx(blocks, brand = {}) {
  const D = require('docx');
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle, AlignmentType, Footer, PageNumber, ImageRun } = D;
  const RED = 'D7192F', INK = '111113', GREY = '52525B';
  const kids = [];
  const P = (runs, opts = {}) => new Paragraph({ children: Array.isArray(runs) ? runs : [runs], spacing: { after: 120 }, ...opts });
  const T = (s, o = {}) => new TextRun({ text: String(s == null ? '' : s), font: 'Segoe UI', size: 20, ...o });
  const cellBorder = { top: { style: BorderStyle.SINGLE, size: 4, color: 'E4E4E7' }, bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E4E4E7' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } };
  const fill = { pass: INK, weak: 'E4E4E7', at_risk: RED, unproven: 'FFFFFF' };
  const fcol = { pass: 'FFFFFF', weak: '3F3F46', at_risk: 'FFFFFF', unproven: 'A30F21' };
  const table = (head, rows, widths, gridMode) => new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: head.map((h, i) => new TableCell({ borders: cellBorder, shading: { type: ShadingType.CLEAR, fill: 'F4F4F5', color: 'auto' }, width: widths ? { size: widths[i], type: WidthType.PERCENTAGE } : undefined, children: [P(T(h, { bold: true, size: 17, color: GREY }), { spacing: { after: 0 } })] })) }),
      ...rows.map(r => new TableRow({ children: r.map((c, i) => {
        const g = gridMode && i > 0;
        return new TableCell({ borders: cellBorder, width: widths ? { size: widths[i], type: WidthType.PERCENTAGE } : undefined,
          shading: g ? { type: ShadingType.CLEAR, fill: fill[c] || 'FFFFFF', color: 'auto' } : undefined,
          children: [P(T(g ? (R[c] || c) : c, { size: 17, color: g ? fcol[c] : INK, bold: g }), { spacing: { after: 0 }, alignment: g ? AlignmentType.CENTER : undefined })] });
      }) }))
    ]
  });

  let logo = null;
  const m = /^data:image\/(png|jpe?g);base64,(.+)$/.exec(brand.logoDataUrl || '');
  if (m) logo = Buffer.from(m[2], 'base64');

  for (const b of blocks) {
    switch (b.t) {
      case 'cover':
        if (logo) kids.push(P(new ImageRun({ data: logo, type: m[1].startsWith('jp') ? 'jpg' : 'png', transformation: { width: 120, height: 40 } })));
        kids.push(P([T('Council', { bold: true, size: 32 }), T('wise', { bold: true, size: 32, color: RED }), ...(b.demo ? [T('   DEMO DATA', { bold: true, size: 16, color: RED })] : [])]));
        kids.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [T(b.title, { bold: true, size: 48 })], spacing: { after: 60 } }));
        kids.push(P(T(`${b.sessionTitle} · ${b.docName} · ${b.date}${brand.byline ? ' · ' + brand.byline : ''}`, { color: GREY, size: 18 }), { border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: INK, space: 8 } }, spacing: { after: 240 } }));
        break;
      case 'verdict':
        kids.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: [
          new TableCell({ shading: { type: ShadingType.CLEAR, fill: INK, color: 'auto' }, width: { size: 62, type: WidthType.PERCENTAGE }, margins: { top: 160, bottom: 160, left: 200, right: 200 }, children: [
            P(T('COUNCIL VERDICT', { size: 15, color: 'A1A1AA' }), { spacing: { after: 40 } }),
            P(T(b.verdict, { bold: true, size: 40, color: 'FFFFFF' }), { spacing: { after: 80 } }),
            P(T(b.headline || '', { size: 19, color: 'E4E4E7' }), { spacing: { after: 0 } })] }),
          new TableCell({ shading: { type: ShadingType.CLEAR, fill: INK, color: 'auto' }, width: { size: 38, type: WidthType.PERCENTAGE }, margins: { top: 160, bottom: 160, left: 200, right: 200 }, children: [
            P(T('CONFIDENCE SCORE', { size: 15, color: 'A1A1AA' }), { spacing: { after: 40 } }),
            P([T(String(b.score), { bold: true, size: 52, color: 'EF233C' }), T(' /100', { size: 22, color: 'A1A1AA' })], { spacing: { after: 40 } }),
            P(T(`${b.label} · moderator said ${b.stated}`, { size: 17, color: 'D4D4D8' }), { spacing: { after: 0 } })] })
        ] })] }));
        kids.push(P(T('')));
        break;
      case 'h1': kids.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [T(b.text, { bold: true, size: 32 })] })); break;
      case 'h2': kids.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 100 }, children: [T(b.text, { bold: true, size: 26, color: INK })] })); break;
      case 'p': kids.push(P(T(b.text))); break;
      case 'pre': for (const ln of String(b.text).split('\n')) kids.push(P(T(ln, { font: 'Consolas', size: 16 }), { spacing: { after: 0 } })); kids.push(P(T(''))); break;
      case 'list': for (const i of b.items) kids.push(new Paragraph({ bullet: { level: 0 }, children: [T(i)], spacing: { after: 60 } })); break;
      case 'table': kids.push(table(b.head, b.rows, b.widths)); kids.push(P(T(''))); break;
      case 'grid': kids.push(table(b.head, b.rows, null, true)); kids.push(P(T(''))); break;
      case 'tally': kids.push(P(b.items.flatMap(i => [T(`${i.n} `, { bold: true, size: 24, color: ['revise', 'no_go'].includes(i.id) ? RED : INK }), T(`${i.label}     `, { color: GREY })]))); break;
      case 'finding':
        kids.push(P([T(`${b.n}. `, { bold: true }), T(b.severity.toUpperCase() + '  ', { bold: true, size: 16, color: b.severity === 'critical' ? RED : GREY }), T(b.title, { bold: true })], { spacing: { after: 40 }, border: { left: { style: BorderStyle.SINGLE, size: 18, color: b.severity === 'critical' ? RED : INK, space: 6 } } }));
        kids.push(P(T(b.detail), { spacing: { after: 40 } }));
        if (b.recommendation) kids.push(P([T('Recommendation: ', { bold: true }), T(b.recommendation)], { spacing: { after: 40 } }));
        if (b.raisedBy) kids.push(P(T('Raised by ' + b.raisedBy, { size: 16, color: '71717A' })));
        break;
      case 'stats': kids.push(table(b.items.map(i => i[0]), [b.items.map(i => i[1])])); break;
      default: break;
    }
  }
  const doc = new Document({
    creator: brand.byline || 'Councilwise', title: blocks[0] && blocks[0].title, description: 'Councilwise council report',
    styles: { default: { document: { run: { font: 'Segoe UI', size: 20 } } } },
    sections: [{
      properties: { page: { margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [T('Councilwise · page ', { size: 16, color: '71717A' }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '71717A' })] })] }) },
      children: kids
    }]
  });
  return Packer.toBuffer(doc);
}

module.exports = { html, text, md, docx, CSS, MARK };
