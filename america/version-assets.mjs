// Refresh the America page's local asset URLs after an edit. No network or bundling.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('./', import.meta.url);
const read = name => readFileSync(new URL(name, root), 'utf8');
const hash = name => createHash('sha256').update(readFileSync(new URL(name, root))).digest('hex').slice(0, 12);
function rewrite(name, update) {
  const before = read(name);
  const after = update(before);
  if (before !== after) writeFileSync(new URL(name, root), after);
}

rewrite('app.js', source => source
  .replace(/\.\/data\.js(?:\?v=[a-f0-9]+)?/g, `./data.js?v=${hash('data.js')}`)
  .replace(/\.\/tools\.js(?:\?v=[a-f0-9]+)?/g, `./tools.js?v=${hash('tools.js')}`));
rewrite('index.html', source => source
  .replace(/href="america\.css(?:\?v=[a-f0-9]+)?"/g, `href="america.css?v=${hash('america.css')}"`)
  .replace(/src="app\.js(?:\?v=[a-f0-9]+)?"/g, `src="app.js?v=${hash('app.js')}"`)
  .replace(/src="assets\/hero\.webp(?:\?v=[a-f0-9]+)?"/g, `src="assets/hero.webp?v=${hash('assets/hero.webp')}"`));
console.log('America asset versions updated.');
