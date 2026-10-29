'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseNaturalQuery, matchesExactModel, isValidPhoneHandset, extractAsin, parsePrice, parseCsv,
} = require('../amazonScraper');

test('extractAsin handles urls and raw ASINs', () => {
  assert.equal(extractAsin('https://www.amazon.in/dp/B0CHX1W1XY?ref=x'), 'B0CHX1W1XY');
  assert.equal(extractAsin('b0chx1w1xy'), 'B0CHX1W1XY');
  assert.equal(extractAsin('nope'), null);
});

test('parsePrice', () => {
  assert.equal(parsePrice('₹24,999.00'), 24999);
  assert.equal(parsePrice('$19.99'), 19.99);
  assert.equal(parsePrice(''), null);
});

test('budget parsing', () => {
  assert.equal(parseNaturalQuery('phones under 25k').max_price, 25000);
  assert.equal(parseNaturalQuery('laptops below 50000').max_price, 50000);
  const b = parseNaturalQuery('earbuds between 1k and 3k');
  assert.deepEqual([b.min_price, b.max_price], [1000, 3000]);
  assert.equal(parseNaturalQuery('phones under 2 lakh').max_price, 200000);
  assert.equal(parseNaturalQuery('phones under ₹25,000').max_price, 25000);
  assert.equal(parseNaturalQuery('earbuds between ₹1,000 and ₹3,000').max_price, 3000);
  assert.equal(parseNaturalQuery('phones under 2 lakhs').max_price, 200000);
});

test('brand + model detection', () => {
  const p = parseNaturalQuery('poco m6');
  assert.equal(p.target_brand, 'Poco');
  assert.equal(p.target_model, 'm6');
  assert.equal(p.search_keyword, 'Poco m6');
});

test('exact model matching rejects adjacent sub-models', () => {
  assert.equal(matchesExactModel('Redmi 12 5G', '12'), true);
  assert.equal(matchesExactModel('Redmi 12R 5G', '12'), false);
  assert.equal(matchesExactModel('iPhone 15 Pro Max', '15'), false);
  assert.equal(matchesExactModel('Apple iPhone 15 (128 GB)', '15'), true);
});

test('accessory filter', () => {
  assert.equal(isValidPhoneHandset('Poco M6 5G 6GB RAM 128GB', 9999, 'Poco'), true);
  assert.equal(isValidPhoneHandset('Back cover for Poco M6', 299, 'Poco'), false);
});

test('csv round-trip parser', () => {
  const rows = parseCsv('a,b\r\n1,"x, ""y"""\r\n2,z\r\n');
  assert.deepEqual(rows, [{ a: '1', b: 'x, "y"' }, { a: '2', b: 'z' }]);
});
