import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractPropertyFromLine,
  extractSearchTokenFromLine,
  normalizePropertyCandidate,
  normalizeSearchQuery
} from '../src/services/propertyResolver';

test('normalizes a CSS property name', () => {
  assert.equal(normalizePropertyCandidate('  Grid-Template-Columns  '), 'grid-template-columns');
});

test('extracts a property from a declaration', () => {
  assert.equal(normalizePropertyCandidate('font-size: 16px;'), 'font-size');
});

test('rejects ambiguous text', () => {
  assert.equal(normalizePropertyCandidate('display position'), undefined);
});

test('extracts the property at the cursor', () => {
  const line = '  font-size: 16px;';
  assert.equal(extractPropertyFromLine(line, 7), 'font-size');
});

test('does not treat a property-like value as a declaration property', () => {
  const line = '  display: flex;';
  assert.equal(extractPropertyFromLine(line, 13), undefined);
});

test('recognizes custom property declarations', () => {
  const line = '  --brand-color: red;';
  assert.equal(extractPropertyFromLine(line, 5), '--brand-color');
});

test('keeps JavaScript member expressions as MDN search queries', () => {
  assert.equal(normalizeSearchQuery(' Array.prototype.map() '), 'Array.prototype.map()');
  assert.equal(extractSearchTokenFromLine('const mapped = Array.prototype.map.call(items);', 31), 'Array.prototype.map.call');
});

test('extracts a Web API identifier at the cursor', () => {
  assert.equal(extractSearchTokenFromLine('await fetch(url);', 8), 'fetch');
});
