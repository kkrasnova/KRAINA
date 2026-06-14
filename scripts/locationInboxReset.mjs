import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const p = path.join(root, 'app/location_bundle.injected.json');
await writeFile(
  p,
  `${JSON.stringify({ _skip: true }, null, 2)}\n`,
  'utf8',
);

console.log('OK', p);
