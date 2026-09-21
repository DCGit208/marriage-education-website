/**
 * Shop topical search regression checks.
 * Usage: node scripts/test-shop-search.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

const shopJs = read('public/js/shop.js');
const catalog = JSON.parse(read('public/data/shop-catalog.json'));

const sandbox = {
  console,
  URLSearchParams,
  localStorage: { getItem: function () { return null; } },
  document: { getElementById: function () { return null; }, createElement: function () { return { textContent: '', innerHTML: '' }; } },
  firebase: { auth: function () { return { onAuthStateChanged: function () {} }; } },
};
sandbox.window = sandbox;
sandbox.global = sandbox;
vm.createContext(sandbox);
vm.runInContext(shopJs, sandbox, { filename: 'shop.js' });

const api = sandbox.SBDShopSearch;
const products = catalog.products.filter(function (p) { return p.status !== 'inactive'; });

let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log('  ok  ' + name);
  } catch (err) {
    failed += 1;
    console.error('  FAIL  ' + name);
    console.error('       ' + (err && err.stack ? err.stack.split('\n')[0] : err));
  }
}

function ranked(query) {
  const intent = api.parseIntent(query);
  return products
    .map(function (product) {
      return { product, score: api.score(product, intent) };
    })
    .filter(function (entry) { return entry.score > 0; })
    .sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return (a.product.sortOrder || 999) - (b.product.sortOrder || 999);
    })
    .map(function (entry) { return entry.product; });
}

console.log('\nShop topical search\n');

test('parses type and topic intent from natural queries', function () {
  const bookIntent = api.parseIntent('books about communication');
  assert.strictEqual(bookIntent.type, 'book');
  assert.ok(bookIntent.topics.includes('communication'));
  assert.ok(bookIntent.tokens.includes('communication'));

  const courseIntent = api.parseIntent('course about leadership');
  assert.strictEqual(courseIntent.type, 'course');
  assert.ok(courseIntent.topics.includes('leadership'));
  assert.ok(courseIntent.tokens.includes('leadership'));
});

test('books query returns book-type products instead of random text matches', function () {
  const results = ranked('books');
  assert.ok(results.length > 10, 'expected many book results');
  assert.ok(results.slice(0, 8).every(function (p) { return api.productTypeForSearch(p) === 'book'; }));
});

test('courses query returns academy/course products', function () {
  const results = ranked('courses');
  assert.ok(results.length > 20, 'expected many course results');
  assert.ok(results.slice(0, 8).every(function (p) { return api.productTypeForSearch(p) === 'course'; }));
});

test('book topic query ranks a relevant book companion first', function () {
  const results = ranked('books about communication');
  assert.ok(results.length, 'expected communication book results');
  assert.strictEqual(results[0].id, 'sbd-the-heart-of-relationship');
});

test('course topic queries rank relevant course families', function () {
  const leadership = ranked('course about leadership');
  assert.ok(leadership.length, 'expected leadership course results');
  assert.strictEqual(api.productTypeForSearch(leadership[0]), 'course');
  assert.ok(api.productTopicsForSearch(leadership[0]).includes('leadership'));

  const sexuality = ranked('course about sex');
  assert.ok(sexuality.length, 'expected sexuality course results');
  assert.strictEqual(api.productTypeForSearch(sexuality[0]), 'course');
  assert.ok(api.productTopicsForSearch(sexuality[0]).includes('sexuality'));
});

test('search helper is exposed for regression coverage only', function () {
  assert.ok(shopJs.includes('root.SBDShopSearch'));
  assert.ok(shopJs.includes('parseShopSearchIntent'));
  assert.ok(shopJs.includes('shopSearchScore'));
});

if (failed) {
  console.error('\n' + failed + ' test(s) failed');
  process.exit(1);
}

console.log('\n✅ Shop topical search tests passed\n');
