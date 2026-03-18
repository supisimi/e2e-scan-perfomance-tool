import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const distPath = join(process.cwd(), 'dist');
const indexPath = join(distPath, 'index.html');
const notFoundPath = join(distPath, '404.html');
const noJekyllPath = join(distPath, '.nojekyll');

if (!existsSync(distPath)) {
  mkdirSync(distPath, { recursive: true });
}

if (!existsSync(indexPath)) {
  throw new Error('dist/index.html does not exist. Run Vite build before prepare-gh-pages.');
}

copyFileSync(indexPath, notFoundPath);
writeFileSync(noJekyllPath, '');

console.log('Prepared GitHub Pages artifacts: 404.html and .nojekyll');
