import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  signAccessToken,
  verifyAccessToken,
  hashRefreshToken,
  randomOpaqueToken,
} from '../src/utils/tokens.js';

test('access token: sign → verify roundtrip preserves claims', () => {
  const token = signAccessToken('user-123', 'a@b.com', 'user');
  const payload = verifyAccessToken(token);
  assert.equal(payload.sub, 'user-123');
  assert.equal(payload.email, 'a@b.com');
  assert.equal(payload.role, 'user');
});

test('access token: a tampered token is rejected', () => {
  const token = signAccessToken('user-123', 'a@b.com', 'user');
  const tampered = token.slice(0, -2) + (token.endsWith('a') ? 'bb' : 'aa');
  assert.throws(() => verifyAccessToken(tampered));
});

test('access token: a garbage string is rejected', () => {
  assert.throws(() => verifyAccessToken('not.a.jwt'));
});

test('hashRefreshToken: deterministic and not equal to the raw token', () => {
  const raw = randomOpaqueToken();
  const h1 = hashRefreshToken(raw);
  const h2 = hashRefreshToken(raw);
  assert.equal(h1, h2);
  assert.notEqual(h1, raw);
  assert.match(h1, /^[a-f0-9]{64}$/); // sha256 hex
});

test('randomOpaqueToken: unique and high-entropy', () => {
  const a = randomOpaqueToken();
  const b = randomOpaqueToken();
  assert.notEqual(a, b);
  assert.equal(a.length, 96); // 48 bytes hex
});
