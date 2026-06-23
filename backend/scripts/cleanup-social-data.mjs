/**
 * Wipe Firestore social data (profiles, follows, follow requests) for a clean Discover start.
 *
 * Usage:
 *   node scripts/cleanup-social-data.mjs --dry-run
 *   node scripts/cleanup-social-data.mjs --confirm
 */
import 'dotenv/config';
import fs from 'node:fs';
import admin from 'firebase-admin';

const COLLECTIONS = ['profiles', 'socialFollows', 'socialFollowRequests'];

function parseServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (raw?.trim()) return JSON.parse(raw);
  if (path?.trim()) return JSON.parse(fs.readFileSync(path, 'utf8'));
  throw new Error('Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH');
}

async function deleteCollection(db, name, dryRun) {
  const col = db.collection(name);
  const countSnap = await col.count().get();
  const total = countSnap.data().count;
  if (total === 0) {
    console.log(`[skip] ${name}: empty`);
    return 0;
  }
  if (dryRun) {
    const preview = await col.limit(20).get();
    console.log(`[dry-run] ${name}: would delete ${total}`);
    preview.docs.forEach((d) => {
      const data = d.data();
      const label = data.username || data.displayName || data.display_name || data.email || '';
      console.log(`  - ${d.id}${label ? ` | ${label}` : ''}`);
    });
    if (total > preview.size) console.log(`  ... and ${total - preview.size} more`);
    return total;
  }

  let deleted = 0;
  while (true) {
    const snap = await col.limit(400).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += snap.size;
    process.stdout.write(`\r[delete] ${name}: ${deleted}/${total}`);
  }
  process.stdout.write('\n');
  return deleted;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const confirm = process.argv.includes('--confirm');
  if (!dryRun && !confirm) {
    console.error('Pass --dry-run to preview or --confirm to delete.');
    process.exit(1);
  }

  const serviceAccount = parseServiceAccount();
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });
  }
  const db = admin.firestore();

  console.log(`Project: ${serviceAccount.project_id}`);
  console.log(dryRun ? 'Mode: dry-run' : 'Mode: DELETE');

  let grandTotal = 0;
  for (const name of COLLECTIONS) {
    grandTotal += await deleteCollection(db, name, dryRun);
  }

  console.log(dryRun ? `Would delete ${grandTotal} documents.` : `Deleted ${grandTotal} documents.`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
