import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  registerSchema,
  loginSchema,
  resetPasswordSchema,
  appPasswordResetConfirmSchema,
} from '../src/schemas/auth.schemas.js';

test('registerSchema: accepts a valid registration', () => {
  const r = registerSchema.safeParse({
    email: 'user@example.com',
    password: 'hunter2x',
    username: 'good_user',
  });
  assert.equal(r.success, true);
});

test('registerSchema: rejects an invalid email', () => {
  const r = registerSchema.safeParse({ email: 'not-an-email', password: 'hunter2x' });
  assert.equal(r.success, false);
});

test('registerSchema: rejects a password with no digit', () => {
  const r = registerSchema.safeParse({ email: 'u@e.com', password: 'abcdefgh' });
  assert.equal(r.success, false);
});

test('registerSchema: rejects a password shorter than 8', () => {
  const r = registerSchema.safeParse({ email: 'u@e.com', password: 'a1b2c3' });
  assert.equal(r.success, false);
});

test('registerSchema: rejects a username with illegal characters', () => {
  const r = registerSchema.safeParse({
    email: 'u@e.com',
    password: 'hunter2x',
    username: 'bad user!',
  });
  assert.equal(r.success, false);
});

test('loginSchema: requires a non-empty password', () => {
  assert.equal(loginSchema.safeParse({ email: 'u@e.com', password: '' }).success, false);
  assert.equal(loginSchema.safeParse({ email: 'u@e.com', password: 'x' }).success, true);
});

test('resetPasswordSchema: enforces password strength on the new password', () => {
  assert.equal(
    resetPasswordSchema.safeParse({ token: 't', new_password: 'weak' }).success,
    false,
  );
  assert.equal(
    resetPasswordSchema.safeParse({ token: 't', new_password: 'strong1pass' }).success,
    true,
  );
});

test('appPasswordResetConfirmSchema: requires a 6-digit code', () => {
  assert.equal(
    appPasswordResetConfirmSchema.safeParse({
      email: 'u@e.com',
      code: '12345',
      new_password: 'strong1pass',
    }).success,
    false,
  );
  assert.equal(
    appPasswordResetConfirmSchema.safeParse({
      email: 'u@e.com',
      code: '123456',
      new_password: 'strong1pass',
    }).success,
    true,
  );
});
