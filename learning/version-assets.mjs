// Refresh content hashes after editing learning assets. No network or bundling.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => readFileSync(path.join(root, name), 'utf8');
const hash = name => createHash('sha256').update(read(name)).digest('hex').slice(0, 12);
function rewrite(name, update) {
  const before = read(name);
  const after = update(before);
  if (before !== after) writeFileSync(path.join(root, name), after);
}
function versionImports(name, targets) {
  rewrite(name, source => {
    for (const [relative, target] of targets) {
      const escaped = relative.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      source = source.replace(new RegExp(`(['"])${escaped}(?:\\?v=[a-f0-9]+)?\\1`, 'g'), `'${relative}?v=${hash(target)}'`);
    }
    return source;
  });
}
versionImports('learning/catalog.js', [['./courses/ja.js', 'learning/courses/ja.js'], ['./courses/ko.js', 'learning/courses/ko.js']]);
versionImports('learning/app.js', [['./catalog.js', 'learning/catalog.js'], ['./store.js', 'learning/store.js'], ['./speech.js', 'learning/speech.js']]);
versionImports('learning/home.js', [['./store.js', 'learning/store.js']]);
for (const folder of ['japanese', 'korean', 'vocabulary', 'progress']) {
  rewrite(`${folder}/index.html`, source => source
    .replace(/\.\.\/learning\/app\.js(?:\?v=[a-f0-9]+)?/g, `../learning/app.js?v=${hash('learning/app.js')}`)
    .replace(/\.\.\/learning\/learning\.css(?:\?v=[a-f0-9]+)?/g, `../learning/learning.css?v=${hash('learning/learning.css')}`));
}
rewrite('index.html', source => source
  .replace(/learning\/home\.js(?:\?v=[a-f0-9]+)?/g, `learning/home.js?v=${hash('learning/home.js')}`)
  .replace(/href="style\.css(?:\?v=[a-f0-9]+)?"/g, `href="style.css?v=${hash('style.css')}"`));
console.log('Learning asset versions updated.');
