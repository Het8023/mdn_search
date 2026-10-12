import assert from 'node:assert/strict';
import test from 'node:test';
import { suggestionScore } from '../src/services/localDataService';

test('prefix suggestions rank ahead of fuzzy matches', () => {
  assert.ok(suggestionScore('grid', 'grid-area') < suggestionScore('grid', 'font-grid'));
});

test('close misspellings receive a finite score', () => {
  assert.ok(Number.isFinite(suggestionScore('dispaly', 'display')));
});

test('unrelated properties are excluded', () => {
  assert.equal(suggestionScore('display', 'animation-timing-function'), Number.POSITIVE_INFINITY);
});
