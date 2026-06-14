

import { randomBytes } from 'node:crypto';
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const SUB = 'landmark-content';
const BUNDLE_FILE = 'landmark_bundle.json';
const MEDIA = 'media';
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const DEFAULT_WORKSPACE = path.resolve(process.cwd(), 'landmark-content.workspace.json');
const MAX_BUNDLE_BYTES = Number(process.env.MAX_LANDMARK_BUNDLE_BYTES ?? 15 * 1024 * 1024);
const MAX_MEDIA_BYTES = Number(process.env.MAX_LANDMARK_MEDIA_BYTES ?? 12 * 1024 * 1024);

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (const a of argv) {
    if (a.startsWith('
      const eq = a.indexOf('=');
      if (eq > 0) flags[a.slice(2, eq)] = a.slice(eq + 1);
      else flags[a.slice(2)] = true;
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

function resolveUploadDir(flags) {
  const raw = flags['upload-dir'] || process.env.UPLOAD_DIR || './uploads';
  return path.resolve(process.cwd(), raw);
}

function bundleDir(uploadDir) {
  return path.join(uploadDir, SUB);
}

function bundlePath(uploadDir) {
  return path.join(bundleDir(uploadDir), BUNDLE_FILE);
}

function mediaDir(uploadDir) {
  return path.join(bundleDir(uploadDir), MEDIA);
}

async function ensureDirs(uploadDir) {
  await mkdir(bundleDir(uploadDir), { recursive: true });
  await mkdir(mediaDir(uploadDir), { recursive: true });
}

async function fileExists(p) {
  try {
    const st = await stat(p);
    return st.isFile();
  } catch {
    return false;
  }
}

async function readBundle(uploadDir) {
  const p = bundlePath(uploadDir);
  if (!(await fileExists(p))) return null;
  const raw = await readFile(p, 'utf8');
  return JSON.parse(raw);
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(target, source) {
  if (!isPlainObject(target) || !isPlainObject(source)) return source;
  const out = { ...target };
  for (const [k, v] of Object.entries(source)) {
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k], v) : v;
  }
  return out;
}

function validateBundle(data) {
  if (!isPlainObject(data)) {
    throw new Error('bundle must be a JSON object (not array, not null)');
  }
  const s = JSON.stringify(data);
  const bytes = Buffer.byteLength(s, 'utf8');
  if (bytes > MAX_BUNDLE_BYTES) {
    throw new Error(`bundle too large: ${bytes} > ${MAX_BUNDLE_BYTES} bytes`);
  }
  return s;
}

async function writeBundle(uploadDir, data, pretty) {
  validateBundle(data);
  await ensureDirs(uploadDir);
  const json = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  await writeFile(bundlePath(uploadDir), json, 'utf8');
}

async function cmdPull(workspaceFile, uploadDir) {
  const data = await readBundle(uploadDir);
  if (data === null) {
    console.error(`No bundle yet at ${bundlePath(uploadDir)} — nothing to pull.`);
    process.exit(2);
  }
  await writeFile(workspaceFile, JSON.stringify(data, null, 2), 'utf8');
  console.log(`Pulled bundle → ${workspaceFile}`);
}

async function cmdPush(workspaceFile, uploadDir, pretty) {
  if (!(await fileExists(workspaceFile))) {
    throw new Error(`workspace file not found: ${workspaceFile}`);
  }
  const raw = await readFile(workspaceFile, 'utf8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new Error(`workspace file is not valid JSON: ${e.message}`);
  }
  await writeBundle(uploadDir, data, pretty);
  console.log(`Pushed ${workspaceFile} → ${bundlePath(uploadDir)}`);
}

async function cmdUpdate(workspaceFile, uploadDir, pretty) {
  if (!(await fileExists(workspaceFile))) {
    throw new Error(`workspace file not found: ${workspaceFile}`);
  }
  const patch = JSON.parse(await readFile(workspaceFile, 'utf8'));
  if (!isPlainObject(patch)) throw new Error('patch must be a JSON object');
  const current = (await readBundle(uploadDir)) ?? {};
  const merged = deepMerge(current, patch);
  await writeBundle(uploadDir, merged, pretty);
  console.log(`Merged ${workspaceFile} into ${bundlePath(uploadDir)}`);
}

async function cmdDelete(uploadDir) {
  const p = bundlePath(uploadDir);
  if (!(await fileExists(p))) {
    console.error(`No bundle to delete at ${p}`);
    process.exit(2);
  }
  await unlink(p);
  console.log(`Deleted ${p}`);
}

async function cmdShow(uploadDir) {
  const data = await readBundle(uploadDir);
  if (data === null) {
    console.error(`No bundle at ${bundlePath(uploadDir)}`);
    process.exit(2);
  }
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

async function cmdMediaList(uploadDir) {
  await ensureDirs(uploadDir);
  const dir = mediaDir(uploadDir);
  const names = await readdir(dir);
  const items = [];
  for (const f of names) {
    if (f.startsWith('.')) continue;
    const fp = path.join(dir, f);
    const st = await stat(fp);
    if (!st.isFile()) continue;
    items.push({ fileName: f, size: st.size, mtimeMs: st.mtimeMs });
  }
  items.sort((a, b) => b.mtimeMs - a.mtimeMs);
  for (const it of items) {
    console.log(`${it.fileName}\t${it.size} bytes\t${new Date(it.mtimeMs).toISOString()}`);
  }
  if (items.length === 0) console.log('(empty)');
}

async function cmdMediaAdd(uploadDir, src) {
  if (!src) throw new Error('media add: source path required');
  const abs = path.resolve(process.cwd(), src);
  if (!(await fileExists(abs))) throw new Error(`source not found: ${abs}`);
  const st = await stat(abs);
  if (st.size < 8) throw new Error('source file is empty');
  if (st.size > MAX_MEDIA_BYTES) {
    throw new Error(`source too large: ${st.size} > ${MAX_MEDIA_BYTES} bytes`);
  }
  const ext = path.extname(abs).toLowerCase();
  const safeExt = ALLOWED_EXT.has(ext) ? ext : '.jpg';
  const name = `${Date.now()}_${randomBytes(5).toString('hex')}${safeExt}`;
  await ensureDirs(uploadDir);
  const dest = path.join(mediaDir(uploadDir), name);
  await copyFile(abs, dest);
  console.log(`Added media: ${name}`);
}

async function cmdMediaRemove(uploadDir, name) {
  if (!name) throw new Error('media remove: file name required');
  const base = path.basename(name);
  if (base !== name || !base) throw new Error(`invalid name: ${name}`);
  const fp = path.join(mediaDir(uploadDir), base);
  if (!(await fileExists(fp))) {
    console.error(`Not found: ${fp}`);
    process.exit(2);
  }
  await unlink(fp);
  console.log(`Removed media: ${base}`);
}

function printHelp() {
  console.log(
    [
      'landmark-content CLI — read/write the landmark stories bundle directly from a JSON file.',
      '',
      'Commands:',
      '  pull                       copy server bundle → workspace JSON',
      '  push                       overwrite server bundle ← workspace JSON',
      '  update                     deep-merge workspace JSON into server bundle',
      '  delete                     delete server bundle file',
      '  show                       print server bundle to stdout',
      '  media list                 list media files',
      '  media add <path>           copy local file into media dir',
      '  media remove <name>        remove a media file by name',
      '',
      'Flags:',
      '  
      '  
      '  
    ].join('\n'),
  );
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  if (flags.help || flags.h || positional.length === 0) {
    printHelp();
    return;
  }
  const workspaceFile = flags.file
    ? path.resolve(process.cwd(), String(flags.file))
    : DEFAULT_WORKSPACE;
  const uploadDir = resolveUploadDir(flags);
  const pretty = Boolean(flags.pretty);
  const [cmd, sub, arg] = positional;

  switch (cmd) {
    case 'pull':
      await cmdPull(workspaceFile, uploadDir);
      return;
    case 'push':
      await cmdPush(workspaceFile, uploadDir, pretty);
      return;
    case 'update':
      await cmdUpdate(workspaceFile, uploadDir, pretty);
      return;
    case 'delete':
      await cmdDelete(uploadDir);
      return;
    case 'show':
      await cmdShow(uploadDir);
      return;
    case 'media':
      if (sub === 'list') return cmdMediaList(uploadDir);
      if (sub === 'add') return cmdMediaAdd(uploadDir, arg);
      if (sub === 'remove') return cmdMediaRemove(uploadDir, arg);
      throw new Error(`unknown media subcommand: ${sub ?? ''}`);
    default:
      throw new Error(`unknown command: ${cmd}`);
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
