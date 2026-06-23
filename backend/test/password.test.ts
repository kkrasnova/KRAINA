import { test } from 'node:test';
import assert from 'node:assert/strict';

import { hashPassword, verifyPassword } from '../src/utils/password.js';

test('hashPassword: produces a bcrypt hash, not plaintext', async () => {
  const hash = await hashPassword('Secret123');
  assert.notEqual(hash, 'Secret123');
  assert.match(hash, /^\$2[aby]\$/); // bcrypt prefix
});

test('verifyPassword: accepts the correct password', async () => {
  const hash = await hashPassword('Secret123');
  assert.equal(await verifyPassword('Secret123', hash), true);
});

test('verifyPassword: rejects a wrong password', async () => {
  const hash = await hashPassword('Secret123');
  assert.equal(await verifyPassword('wrong-password', hash), false);
});

test('hashPassword: salts — two hashes of same input differ', async () => {
  const a = await hashPassword('Secret123');
  const b = await hashPassword('Secret123');
  assert.notEqual(a, b);
});
