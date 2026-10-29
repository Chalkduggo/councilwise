'use strict';
// Usage: npm run set-repo -- your-github-username
// Replaces the YOUR-GITHUB-USERNAME placeholder in package.json, README and docs.
const fs = require('fs');
const path = require('path');
const user = (process.argv[2] || '').trim();
if (!/^[A-Za-z0-9-]{1,39}$/.test(user)) { console.error('Give your GitHub username, e.g.  npm run set-repo -- sumanmondal'); process.exit(1); }
const root = path.join(__dirname, '..');
const files = ['package.json', 'README.md', 'docs/PUBLISHING.md', 'docs/LINKEDIN.md', 'docs/RELEASE_NOTES.md', 'SECURITY.md', 'CONTRIBUTING.md'];
for (const f of files) {
  const p = path.join(root, f);
  if (!fs.existsSync(p)) continue;
  const s = fs.readFileSync(p, 'utf8');
  const n = s.split('YOUR-GITHUB-USERNAME').join(user);
  if (n !== s) { fs.writeFileSync(p, n); console.log('updated', f); }
}
