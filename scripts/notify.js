#!/usr/bin/env node
/**
 * scripts/notify.js
 * cronから呼ばれる通知スクリプト
 * Usage: node scripts/notify.js noon|evening|weekly
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const type = process.argv[2];

if (!['noon', 'evening', 'weekly'].includes(type)) {
  console.error('Usage: node scripts/notify.js noon|evening|weekly');
  process.exit(1);
}

if (type === 'weekly') {
  execSync(`node ${join(ROOT, 'health.js')} report`, { stdio: 'inherit' });
} else {
  execSync(`node ${join(ROOT, 'health.js')} notify ${type}`, { stdio: 'inherit' });
}
