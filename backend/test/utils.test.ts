import { test } from 'node:test';
import assert from 'node:assert/strict';

import { haversineKm, travelMinutes } from '../src/utils/geoHaversine.js';
import { computeExplorerLevel } from '../src/utils/level.js';
import { currentPeriodMonth } from '../src/utils/period.js';

test('haversineKm: zero distance for identical points', () => {
  const p = { lat: 50.45, lng: 30.5233 };
  assert.equal(haversineKm(p, p), 0);
});

test('haversineKm: Kyiv→Lviv is ~468 km (±15)', () => {
  const kyiv = { lat: 50.4501, lng: 30.5234 };
  const lviv = { lat: 49.8397, lng: 24.0297 };
  const d = haversineKm(kyiv, lviv);
  assert.ok(d > 453 && d < 483, `expected ~468, got ${d}`);
});

test('haversineKm: symmetric (a→b == b→a)', () => {
  const a = { lat: 50.45, lng: 30.52 };
  const b = { lat: 46.48, lng: 30.73 };
  assert.ok(Math.abs(haversineKm(a, b) - haversineKm(b, a)) < 1e-9);
});

test('travelMinutes: walking is slower than driving for same leg', () => {
  const a = { lat: 50.45, lng: 30.52 };
  const b = { lat: 50.5, lng: 30.6 };
  assert.ok(travelMinutes(a, b, 'walk') > travelMinutes(a, b, 'car'));
});

test('travelMinutes: unknown transport falls back to walk speed', () => {
  const a = { lat: 50.45, lng: 30.52 };
  const b = { lat: 50.5, lng: 30.6 };
  assert.equal(travelMinutes(a, b, 'teleport'), travelMinutes(a, b, 'walk'));
});

test('computeExplorerLevel: new user is level 1', () => {
  assert.equal(
    computeExplorerLevel({ locations_visited: 0, routes_created: 0, followers_count: 0 }),
    1,
  );
});

test('computeExplorerLevel: 5 visits → level 2', () => {
  assert.equal(
    computeExplorerLevel({ locations_visited: 5, routes_created: 0, followers_count: 0 }),
    2,
  );
});

test('computeExplorerLevel: 20 visits + 1 route → level 3', () => {
  assert.equal(
    computeExplorerLevel({ locations_visited: 20, routes_created: 1, followers_count: 0 }),
    3,
  );
});

test('computeExplorerLevel: 50 visits + 3 routes → level 4', () => {
  assert.equal(
    computeExplorerLevel({ locations_visited: 50, routes_created: 3, followers_count: 0 }),
    4,
  );
});

test('computeExplorerLevel: top tier needs visits AND followers', () => {
  assert.equal(
    computeExplorerLevel({ locations_visited: 100, routes_created: 0, followers_count: 500 }),
    5,
  );
  // 100 visits but too few followers must NOT reach level 5
  assert.notEqual(
    computeExplorerLevel({ locations_visited: 100, routes_created: 5, followers_count: 10 }),
    5,
  );
});

test('currentPeriodMonth: matches YYYY-MM and current month', () => {
  const v = currentPeriodMonth();
  assert.match(v, /^\d{4}-\d{2}$/);
  const now = new Date();
  assert.equal(v, `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
});
