// Refresh the America and nursing pages' local asset URLs after an edit. No network or bundling.
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
// Update module dependencies before hashing the app entry points in each HTML page.
rewrite('nursing/app.js', source => source
  .replace(/\.\/data\.js(?:\?v=[a-f0-9]+)?/g, `./data.js?v=${hash('nursing/data.js')}`)
  .replace(/\.\/calculators\.js(?:\?v=[a-f0-9]+)?/g, `./calculators.js?v=${hash('nursing/calculators.js')}`));
rewrite('index.html', source => source
  .replace(/href="america\.css(?:\?v=[a-f0-9]+)?"/g, `href="america.css?v=${hash('america.css')}"`)
  .replace(/src="app\.js(?:\?v=[a-f0-9]+)?"/g, `src="app.js?v=${hash('app.js')}"`)
  .replace(/src="assets\/hero\.webp(?:\?v=[a-f0-9]+)?"/g, `src="assets/hero.webp?v=${hash('assets/hero.webp')}"`));
rewrite('nursing/index.html', source => source
  .replace(/href="\.\.\/america\.css(?:\?v=[a-f0-9]+)?"/g, `href="../america.css?v=${hash('america.css')}"`)
  .replace(/href="nursing\.css(?:\?v=[a-f0-9]+)?"/g, `href="nursing.css?v=${hash('nursing/nursing.css')}"`)
  .replace(/src="app\.js(?:\?v=[a-f0-9]+)?"/g, `src="app.js?v=${hash('nursing/app.js')}"`));
console.log('America and nursing asset versions updated.');
