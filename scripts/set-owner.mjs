import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const placeholder = ['YOUR', 'GITHUB', 'USERNAME'].join('_');
const username = process.argv[2]?.trim();
if (!username || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(username)) {
  console.error(`Usage: npm run configure:owner -- ${placeholder}`);
  console.error('Use a valid GitHub username containing letters, numbers, or single hyphens.');
  process.exit(1);
}

const root = process.cwd();
const excludedDirectories = new Set(['.git', 'node_modules', 'dist', 'dist-electron', 'release']);
const textExtensions = new Set([
  '.css', '.editorconfig', '.html', '.js', '.json', '.jsx', '.md', '.mjs', '.ts', '.tsx', '.txt', '.yaml', '.yml',
]);
const extensionlessTextFiles = new Set(['LICENSE', '.gitignore']);
let changed = 0;

async function visit(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await visit(fullPath);
      continue;
    }
    if (!entry.isFile()) continue;

    const extension = path.extname(entry.name).toLowerCase();
    if (!textExtensions.has(extension) && !extensionlessTextFiles.has(entry.name)) continue;

    const original = await fs.readFile(fullPath, 'utf8');
    if (!original.includes(placeholder)) continue;
    const updated = original.replaceAll(placeholder, username);
    await fs.writeFile(fullPath, updated, 'utf8');
    changed += 1;
    console.log(`Updated ${path.relative(root, fullPath)}`);
  }
}

await visit(root);

if (changed === 0) {
  console.log('No placeholders remained. The repository owner may already be configured.');
} else {
  console.log(`Configured ${changed} file${changed === 1 ? '' : 's'} for github.com/${username}/codexharbor.`);
}
