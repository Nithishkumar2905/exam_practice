import test from 'node:test';
import assert from 'node:assert/strict';
import { APPROVED_SCREENS, SCREEN_REGISTRY, validateScreenRegistry } from '../types/screens.ts';

test('Screen Registry must enforce strictly 17 approved screens (16 core + Pilot Demo Diagnostic)', () => {
  const result = validateScreenRegistry();
  assert.equal(result.isValid, true, result.error);
  assert.equal(result.totalScreens, 17, 'Must contain exactly 17 screens');
  assert.equal(APPROVED_SCREENS.length, 17, 'APPROVED_SCREENS must have exactly 17 items');
  assert.equal(Object.keys(SCREEN_REGISTRY).length, 17, 'SCREEN_REGISTRY must have exactly 17 items');
});

test('All 17 approved screens have complete and valid metadata', () => {
  APPROVED_SCREENS.forEach((id, index) => {
    const meta = SCREEN_REGISTRY[id];
    assert.ok(meta, `Metadata missing for screen: ${id}`);
    assert.equal(meta.id, id);
    assert.equal(meta.screenNumber, index + 1);
    assert.ok(meta.title.length > 0, `Title missing for ${id}`);
    assert.ok(meta.description.length > 0, `Description missing for ${id}`);
  });
});
