// Checks what the production build must carry and the dev server never shows: the mode markup
// written into index.html by the Vite plugin (guide §13.3) and the shell's Lucide/Feather licence
// comment in the bundle (THIRD_PARTY_NOTICES of @miragon/modeler-shell).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const scripts = readdirSync(join(dist, 'assets'))
  .filter((name) => name.endsWith('.js'))
  .map((name) => readFileSync(join(dist, 'assets', name), 'utf8'));

const problems = [];
if (html.includes('<!-- miragon-mode -->')) {
  problems.push('index.html still has the mode placeholder');
}
if (!/<meta name="theme-color" content="#[0-9A-Fa-f]{6}"/.test(html)) {
  problems.push('index.html has no theme-color with a colour from the tokens');
}
if (!html.includes('prefers-contrast')) problems.push('index.html has no contrast line');
if (!html.includes('class="cd-shell-document"')) {
  problems.push('<html> lacks class="cd-shell-document"');
}
if (!scripts.some((source) => /@license[\s\S]{0,400}Lucide/.test(source))) {
  problems.push('no bundle keeps the shell’s @license comment naming Lucide');
}

if (problems.length > 0) {
  console.error(`apps/webapp build check failed:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log('apps/webapp build check: mode markup and licence comment present');
