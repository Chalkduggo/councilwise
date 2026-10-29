'use strict';
// Turn the uploaded file into plain text, and split long text into parts that fit
// each model's message limit.
const fs = require('fs');
const path = require('path');

const SUPPORTED = ['.docx', '.pdf', '.txt', '.md', '.markdown', '.csv', '.json', '.html', '.htm', '.rtf'];

async function extract(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (!SUPPORTED.includes(ext)) throw new Error(`Unsupported file type ${ext}. Use Word, PDF, text or Markdown.`);
  let text = '';
  if (ext === '.docx') {
    const mammoth = require('mammoth');
    const res = await mammoth.extractRawText({ path: filePath });
    text = res.value;
  } else if (ext === '.pdf') {
    // Import the library file directly: the package's index runs a self-test on load.
    const pdf = require('pdf-parse/lib/pdf-parse.js');
    const res = await pdf(fs.readFileSync(filePath));
    text = res.text;
  } else if (ext === '.html' || ext === '.htm') {
    text = fs.readFileSync(filePath, 'utf8')
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '')
      .replace(/<br\s*\/?>|<\/(p|div|h\d|li|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  } else if (ext === '.rtf') {
    text = fs.readFileSync(filePath, 'utf8').replace(/\\par[d]?/g, '\n').replace(/\{\*?\\[^{}]+}|[{}]|\\\S+\s?/g, '');
  } else {
    text = fs.readFileSync(filePath, 'utf8');
  }
  text = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) throw new Error('No readable text was found in this file. If it is a scanned PDF, export it with text first.');
  return { text, chars: text.length, words: countWords(text), ext };
}

function countWords(t) { const m = String(t || '').match(/\S+/g); return m ? m.length : 0; }

// Split on paragraph boundaries; hard-split very long paragraphs.
function split(text, max) {
  if (text.length <= max) return [text];
  const parts = [];
  let cur = '';
  for (const para of text.split(/\n\n/)) {
    const chunk = para + '\n\n';
    if (chunk.length > max) {
      if (cur) { parts.push(cur.trim()); cur = ''; }
      for (let i = 0; i < chunk.length; i += max) parts.push(chunk.slice(i, i + max).trim());
      continue;
    }
    if (cur.length + chunk.length > max) { parts.push(cur.trim()); cur = ''; }
    cur += chunk;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

module.exports = { extract, split, countWords, SUPPORTED };
