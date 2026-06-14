import 'dotenv/config';
import pg from 'pg';
import admin from 'firebase-admin';
import fs from 'node:fs';

const { Pool } = pg;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

function parseServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

  if (raw && raw.trim()) {
    try {
      return JSON.parse(raw);
    } catch (e) {
      throw new Error(
        `Invalid FIREBASE_SERVICE_ACCOUNT_JSON: ${e.message}. ` +
          'Pass full JSON string or set FIREBASE_SERVICE_ACCOUNT_PATH=/absolute/path/to/service-account.json',
      );
    }
  }

  if (path && path.trim()) {
    const content = fs.readFileSync(path, 'utf8');
    try {
      return JSON.parse(content);
    } catch (e) {
      throw new Error(`Invalid JSON in FIREBASE_SERVICE_ACCOUNT_PATH (${path}): ${e.message}`);
    }
  }

  throw new Error(
    'Missing Firebase credentials: set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH',
  );
}

async function main() {
  const databaseUrl = requireEnv('DATABASE_URL');
  const serviceAccount = parseServiceAccount();
  const projectId =
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    serviceAccount.project_id;
  const firestoreDatabaseId = process.env.FIRESTORE_DATABASE_ID || '(default)';
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId,
    });
  }
  const db = admin.firestore(admin.app(), firestoreDatabaseId);
  db.settings({ ignoreUndefinedProperties: true });
  const pool = new Pool({ connectionString: databaseUrl, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
  const client = await pool.connect();

  try {
    
    await db.collection('__migration_healthcheck').limit(1).get();
    console.log(
      `[migrate] Firestore connection OK (project=${projectId}, database=${firestoreDatabaseId})`,
    );

    async function tableExists(tableName) {
      const q = await client.query(
        `
        select exists (
          select 1
          from information_schema.tables
          where table_schema = 'public' and table_name = $1
        ) as ok
        `,
        [tableName],
      );
      return q.rows?.[0]?.ok === true;
    }

    async function queryTable(tableName, sql) {
      const ok = await tableExists(tableName);
      if (!ok) {
        console.warn(`[migrate] table not found, skipping: ${tableName}`);
        return { rows: [] };
      }
      return client.query(sql);
    }

    const usersRes = await queryTable('users', 'select * from users');
    const profilesRes = await queryTable('profiles', 'select * from profiles');
    const postsRes = await queryTable('feed_posts', 'select * from feed_posts');
    const commentsRes = await queryTable('feed_post_comments', 'select * from feed_post_comments');
    const followsRes = await queryTable('social_follows', 'select * from social_follows');
    const threadsRes = await queryTable('message_threads', 'select * from message_threads');
    const messagesRes = await queryTable('message_items', 'select * from message_items');
    const subscriptionsRes = await queryTable('subscriptions', 'select * from subscriptions');

    const batch = db.batch();
    let writes = 0;

    function asId(...vals) {
      for (const v of vals) {
        if (v != null && String(v).trim() !== '') return String(v);
      }
      return null;
    }

    usersRes.rows.forEach((row) => {
      const id = asId(row.id, row.user_id, row.uid);
      if (!id) return;
      batch.set(db.collection('users').doc(id), row, { merge: true });
      writes += 1;
    });
    profilesRes.rows.forEach((row) => {
      const id = asId(row.user_id, row.id, row.uid);
      if (!id) return;
      batch.set(db.collection('profiles').doc(id), row, { merge: true });
      writes += 1;
    });
    postsRes.rows.forEach((row) => {
      const id = asId(row.id, row.post_id);
      if (!id) return;
      batch.set(db.collection('feedPosts').doc(id), row, { merge: true });
      writes += 1;
    });
    commentsRes.rows.forEach((row) => {
      const postId = asId(row.post_id, row.feed_post_id);
      const id = asId(row.id, row.comment_id);
      if (!postId || !id) return;
      batch.set(db.collection('feedPosts').doc(postId).collection('comments').doc(id), row, { merge: true });
      writes += 1;
    });
    followsRes.rows.forEach((row) => {
      const follower = asId(row.follower_user_id, row.follower_id, row.user_id);
      const following = asId(row.following_user_id, row.following_id, row.target_user_id);
      if (!follower || !following) return;
      const id = `${follower}__${following}`;
      batch.set(db.collection('socialFollows').doc(id), { ...row, followerId: follower, followingId: following }, { merge: true });
      writes += 1;
    });
    threadsRes.rows.forEach((row) => {
      const id = asId(row.id, row.thread_id);
      const initiator = asId(row.initiator_user_id, row.creator_user_id, row.user_a_id);
      const target = asId(row.target_user_id, row.peer_user_id, row.user_b_id);
      if (!id) return;
      const memberIds = [initiator, target].filter(Boolean);
      batch.set(db.collection('messageThreads').doc(id), {
        ...row,
        ...(memberIds.length ? { memberIds } : {}),
      }, { merge: true });
      writes += 1;
    });
    messagesRes.rows.forEach((row) => {
      const threadId = asId(row.thread_id, row.message_thread_id);
      const id = asId(row.id, row.message_id);
      if (!threadId || !id) return;
      batch.set(db.collection('messageThreads').doc(threadId).collection('messages').doc(id), row, { merge: true });
      writes += 1;
    });
    subscriptionsRes.rows.forEach((row) => {
      const id = asId(row.user_id, row.uid, row.id);
      if (!id) return;
      batch.set(db.collection('subscriptions').doc(id), row, { merge: true });
      writes += 1;
    });
    if (writes === 0) {
      console.warn('[migrate] no rows to write, nothing committed');
    } else {
      await batch.commit();
      console.log(`[migrate] committed ${writes} writes to Firestore`);
    }

    console.log('Firestore migration completed');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
