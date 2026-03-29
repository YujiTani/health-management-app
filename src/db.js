import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const DATA_DIR = join(ROOT_DIR, 'data');

// .env を手動パース（外部ライブラリ不要）
export function loadEnv() {
  const envPath = join(ROOT_DIR, '.env');
  if (!existsSync(envPath)) return {};
  const env = {};
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.+)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  }
  return env;
}

export function readJSON(file) {
  const path = join(DATA_DIR, file);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function writeJSON(file, data) {
  writeFileSync(join(DATA_DIR, file), JSON.stringify(data, null, 2) + '\n');
}

export function today() {
  return new Date().toISOString().split('T')[0];
}

export function getDayLog(date = today()) {
  const log = readJSON('daily_log.json') || {};
  if (!log[date]) {
    log[date] = { meals: [], steps: 0, workouts: [] };
  }
  return { log, day: log[date] };
}

export function saveDayLog(log) {
  writeJSON('daily_log.json', log);
}
