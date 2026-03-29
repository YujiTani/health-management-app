#!/usr/bin/env node
/**
 * scripts/generate-dashboard.js
 * 体組成・カロリー管理のHTMLダッシュボードを生成する
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA = join(ROOT, 'data');

function readJSON(file) {
  try { return JSON.parse(readFileSync(join(DATA, file), 'utf8')); }
  catch { return null; }
}

const bodyStats = readJSON('body_stats.json') || [];
const dailyLog = readJSON('daily_log.json') || {};
const profile = readJSON('profile.json') || {};
const prs = readJSON('training_prs.json') || {};

// 直近60日分のデータ
function getLast60Days() {
  const days = [];
  for (let i = 59; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
}

const last60 = getLast60Days();

// 体組成チャートデータ
const statsDates = bodyStats.map(s => s.date);
const weights = bodyStats.map(s => s.weight);
const fatPercents = bodyStats.map(s => s.fat_percent);
const muscleKgs = bodyStats.map(s => s.skeletal_muscle_kg);

// カロリーチャートデータ（直近14日）
const last14 = last60.slice(-14);
const intakes = last14.map(d => {
  const day = dailyLog[d];
  if (!day) return null;
  return day.meals.reduce((s, m) => s + m.kcal, 0);
});

// BMR×1.55 - 350
const latestBmr = bodyStats.length > 0 ? bodyStats[bodyStats.length - 1].bmr : 1387.3;
const target = Math.round(latestBmr * (profile.activity_factor || 1.55) - (profile.target_deficit_kcal || 350));

// PR一覧
const prRows = Object.entries(prs).map(([ex, data]) => {
  const pr = data.max_weight;
  const hist = data.history || [];
  const last = hist[hist.length - 1];
  const count = hist.length;
  return `<tr>
    <td>${ex}</td>
    <td>${pr ? pr.value + 'kg' : '-'}</td>
    <td>${pr ? pr.date : '-'}</td>
    <td>${last ? `${last.sets}×${last.reps}${last.weight ? ' ' + last.weight + 'kg' : ''}` : '-'}</td>
    <td>${count}回</td>
  </tr>`;
}).join('');

const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Health Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, sans-serif; background: #0f172a; color: #e2e8f0; padding: 20px; }
  h1 { text-align: center; padding: 20px 0; color: #38bdf8; font-size: 1.5rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; margin-bottom: 20px; }
  .card { background: #1e293b; border-radius: 12px; padding: 20px; }
  .card h2 { font-size: 0.9rem; color: #94a3b8; margin-bottom: 12px; }
  .stats-row { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
  .stat { background: #0f172a; border-radius: 8px; padding: 12px 16px; text-align: center; flex: 1; min-width: 100px; }
  .stat .value { font-size: 1.5rem; font-weight: 700; color: #38bdf8; }
  .stat .label { font-size: 0.75rem; color: #64748b; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  th { background: #0f172a; padding: 8px 12px; text-align: left; color: #64748b; }
  td { padding: 8px 12px; border-bottom: 1px solid #1e293b; }
  tr:hover td { background: #0f172a; }
  canvas { max-height: 220px; }
  .updated { text-align: center; color: #475569; font-size: 0.75rem; padding: 16px; }
</style>
</head>
<body>
<h1>🏋️ Health Dashboard</h1>

${bodyStats.length > 0 ? `
<div class="stats-row" style="padding: 0 0 16px;">
  <div class="stat"><div class="value">${bodyStats[bodyStats.length-1].weight}<span style="font-size:0.9rem">kg</span></div><div class="label">体重</div></div>
  <div class="stat"><div class="value">${bodyStats[bodyStats.length-1].fat_percent}<span style="font-size:0.9rem">%</span></div><div class="label">体脂肪率</div></div>
  <div class="stat"><div class="value">${bodyStats[bodyStats.length-1].skeletal_muscle_kg}<span style="font-size:0.9rem">kg</span></div><div class="label">骨格筋量</div></div>
  <div class="stat"><div class="value">${bodyStats[bodyStats.length-1].bmr}<span style="font-size:0.9rem">kcal</span></div><div class="label">基礎代謝</div></div>
  <div class="stat"><div class="value">${target}<span style="font-size:0.9rem">kcal</span></div><div class="label">目標摂取</div></div>
</div>
` : ''}

<div class="grid">
  <div class="card">
    <h2>📉 体重推移</h2>
    <canvas id="weightChart"></canvas>
  </div>
  <div class="card">
    <h2>🔥 体脂肪率 & 骨格筋量</h2>
    <canvas id="fatMuscleChart"></canvas>
  </div>
  <div class="card">
    <h2>🍽 カロリー摂取 (直近14日)</h2>
    <canvas id="calorieChart"></canvas>
  </div>
</div>

<div class="card" style="margin-bottom:16px;">
  <h2>🏆 パーソナルレコード</h2>
  ${Object.keys(prs).length > 0 ? `
  <table>
    <tr><th>種目</th><th>最大重量</th><th>達成日</th><th>最終記録</th><th>総回数</th></tr>
    ${prRows}
  </table>` : '<p style="color:#64748b;padding:12px 0;">まだ記録がありません</p>'}
</div>

<p class="updated">最終更新: ${new Date().toLocaleString('ja-JP')}</p>

<script>
const chartDefaults = {
  responsive: true,
  plugins: { legend: { labels: { color: '#94a3b8', font: { size: 11 } } } },
  scales: {
    x: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: '#1e293b' } },
    y: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: '#1e293b' } },
  }
};

// 体重チャート
new Chart(document.getElementById('weightChart'), {
  type: 'line',
  data: {
    labels: ${JSON.stringify(statsDates)},
    datasets: [{
      label: '体重 (kg)',
      data: ${JSON.stringify(weights)},
      borderColor: '#38bdf8',
      backgroundColor: 'rgba(56,189,248,0.1)',
      tension: 0.4,
      fill: true,
    }]
  },
  options: { ...chartDefaults }
});

// 脂肪・筋肉チャート
new Chart(document.getElementById('fatMuscleChart'), {
  type: 'line',
  data: {
    labels: ${JSON.stringify(statsDates)},
    datasets: [
      {
        label: '体脂肪率 (%)',
        data: ${JSON.stringify(fatPercents)},
        borderColor: '#f97316',
        backgroundColor: 'rgba(249,115,22,0.1)',
        tension: 0.4,
        yAxisID: 'y',
      },
      {
        label: '骨格筋量 (kg)',
        data: ${JSON.stringify(muscleKgs)},
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34,197,94,0.1)',
        tension: 0.4,
        yAxisID: 'y1',
      }
    ]
  },
  options: {
    ...chartDefaults,
    scales: {
      ...chartDefaults.scales,
      y: { ...chartDefaults.scales.y, position: 'left' },
      y1: { ...chartDefaults.scales.y, position: 'right', grid: { drawOnChartArea: false } },
    }
  }
});

// カロリーチャート
const targetLine = Array(${last14.length}).fill(${target});
new Chart(document.getElementById('calorieChart'), {
  type: 'bar',
  data: {
    labels: ${JSON.stringify(last14.map(d => d.slice(5)))},
    datasets: [
      {
        label: '摂取 (kcal)',
        data: ${JSON.stringify(intakes)},
        backgroundColor: intakes.map(v => v === null ? 'transparent' : v > ${target} ? 'rgba(239,68,68,0.7)' : 'rgba(56,189,248,0.7)'),
      },
      {
        label: '目標',
        data: targetLine,
        type: 'line',
        borderColor: '#f59e0b',
        borderDash: [4, 4],
        pointRadius: 0,
        fill: false,
      }
    ]
  },
  options: { ...chartDefaults }
});
</script>
</body>
</html>`;

const outPath = join(ROOT, 'web', 'dashboard.html');
writeFileSync(outPath, html);
console.log(`✅ ダッシュボード生成: ${outPath}`);

// macOSの場合自動で開く
try { execSync(`open "${outPath}"`); } catch {}
