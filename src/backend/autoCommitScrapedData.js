'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRAPED_DATA_PATHS = [
  'src/backend/scraped_data/amazon_products.csv',
  'src/backend/scraped_data/amazon_products.json',
];

function runGit(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function autoCommitScrapedData(csvPath, jsonPath, repoRoot = REPO_ROOT) {
  const expectedPaths = SCRAPED_DATA_PATHS.map((file) => path.join(repoRoot, file));
  if (
    path.resolve(csvPath) !== expectedPaths[0]
    || path.resolve(jsonPath) !== expectedPaths[1]
  ) {
    console.log('[INFO] Skipping scraper auto-commit for non-default output paths.');
    return false;
  }

  try {
    const topLevel = runGit(['rev-parse', '--show-toplevel'], repoRoot).trim();
    if (path.resolve(topLevel) !== path.resolve(repoRoot)) {
      console.log('[INFO] Skipping scraper auto-commit outside the repository root.');
      return false;
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error('Git is required to auto-commit scraper output.', { cause: error });
    }
    if (error.status === 128 && /not a git repository/i.test(String(error.stderr))) {
      console.log('[INFO] Skipping scraper auto-commit outside a Git checkout.');
      return false;
    }
    throw error;
  }

  runGit(['add', '-f', '--', ...SCRAPED_DATA_PATHS], repoRoot);
  const changes = runGit(['status', '--porcelain', '--', ...SCRAPED_DATA_PATHS], repoRoot);
  if (!changes.trim()) return false;

  const timestamp = new Date().toLocaleString('en-US');
  const message = `Auto-commit: ${SCRAPED_DATA_PATHS.join(', ')} at ${timestamp}`;
  runGit(['commit', '--only', '-m', message, '--', ...SCRAPED_DATA_PATHS], repoRoot);
  console.log(`[INFO] Committed scraper output: ${SCRAPED_DATA_PATHS.join(', ')}`);
  return true;
}

module.exports = { autoCommitScrapedData };
