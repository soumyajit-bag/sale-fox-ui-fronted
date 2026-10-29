'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { autoCommitScrapedData } = require('../autoCommitScrapedData');

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
}

test('auto-commits only scraper outputs and preserves other staged changes', (t) => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'scraper-auto-commit-'));
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));

  git(['init', '-q'], repoRoot);
  git(['config', 'user.name', 'Test User'], repoRoot);
  git(['config', 'user.email', 'test@example.com'], repoRoot);

  const csvPath = path.join(repoRoot, 'src', 'backend', 'scraped_data', 'amazon_products.csv');
  const jsonPath = path.join(repoRoot, 'src', 'backend', 'scraped_data', 'amazon_products.json');
  fs.mkdirSync(path.dirname(csvPath), { recursive: true });
  fs.writeFileSync(csvPath, 'title\nOriginal\n');
  fs.writeFileSync(jsonPath, '[]\n');
  fs.writeFileSync(path.join(repoRoot, 'README.md'), 'Original\n');
  git(['add', '-A'], repoRoot);
  git(['commit', '-m', 'Initial data'], repoRoot);

  fs.writeFileSync(csvPath, 'title\nUpdated\n');
  fs.writeFileSync(path.join(repoRoot, 'README.md'), 'Unrelated staged change\n');
  git(['add', '--', 'README.md'], repoRoot);

  assert.equal(autoCommitScrapedData(csvPath, jsonPath, repoRoot), true);
  assert.deepEqual(
    git(['show', '--format=', '--name-only', 'HEAD'], repoRoot).split(/\r?\n/).filter(Boolean).sort(),
    ['src/backend/scraped_data/amazon_products.csv'],
  );
  assert.deepEqual(
    git(['diff', '--cached', '--name-only'], repoRoot).split(/\r?\n/).filter(Boolean),
    ['README.md'],
  );
  assert.equal(autoCommitScrapedData(csvPath, jsonPath, repoRoot), false);
});

test('does not commit custom scraper output paths', (t) => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'scraper-auto-commit-custom-'));
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));

  git(['init', '-q'], repoRoot);
  const csvPath = path.join(repoRoot, 'custom.csv');
  const jsonPath = path.join(repoRoot, 'custom.json');
  fs.writeFileSync(csvPath, 'data');
  fs.writeFileSync(jsonPath, '[]');

  assert.equal(autoCommitScrapedData(csvPath, jsonPath, repoRoot), false);
  assert.equal(git(['status', '--porcelain'], repoRoot), '?? custom.csv\n?? custom.json');
});
