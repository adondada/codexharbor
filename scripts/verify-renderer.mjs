import { readFile } from 'node:fs/promises';
import path from 'node:path';

const indexPath = path.resolve('dist/index.html');
const html = await readFile(indexPath, 'utf8');
const rootRelativeAsset = /(?:src|href)=["']\/(?!\/)/i.exec(html);

if (rootRelativeAsset) {
  throw new Error(
    `Renderer build contains a root-relative asset URL (${rootRelativeAsset[0]}). ` +
      'Electron production builds load over file:// and require relative asset URLs.',
  );
}

const requiredRelativeAsset = /(?:src|href)=["']\.\/assets\//i.test(html);
if (!requiredRelativeAsset) {
  throw new Error('Renderer build does not contain the expected ./assets/ URLs.');
}

console.log('Renderer asset paths are file:// compatible.');
