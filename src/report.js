import { readJSON, today } from './db.js';
import { calcDailyTarget, stepsToKcal } from './calorie.js';

const PRAISES = [
  '今週も最高の1週間だった！その努力、絶対に報われる💪',
  'ストイックすぎて惚れそう！来週もこの調子でいこう🔥',
  '着実に積み上げてるね。小さな変化が大きな結果に繋がってるよ✨',
  '諦めなかった君が一番かっこいい。来週もよろしく！🏆',
  '体は正直だ。続けた分だけ必ず変わる。信じて進め！💯',
  '今週のがんばり、データが全部証明してる。すごいぞ！🎯',
  '食事も運動も、完璧じゃなくていい。続けることが最強💎',
];

function randomPraise() {
  const week = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
  return PRAISES[week % PRAISES.length];
}

function getLast7Days() {
  const dates = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

export function buildWeeklyReport() {
  const log = readJSON('daily_log.json') || {};
  const stats = readJSON('body_stats.json') || [];
  const target = calcDailyTarget();
  const dates = getLast7Days();

  // 体重変化
  const weekStats = stats.filter(s => dates.includes(s.date));
  const firstStat = weekStats[0];
  const lastStat = weekStats[weekStats.length - 1];

  // 平均摂取カロリー
  let totalIntake = 0;
  let trainDays = 0;
  let totalSteps = 0;
  let loggedDays = 0;

  for (const date of dates) {
    const day = log[date];
    if (!day) continue;
    loggedDays++;
    totalIntake += day.meals.reduce((s, m) => s + m.kcal, 0);
    if (day.workouts && day.workouts.length > 0) trainDays++;
    totalSteps += day.steps || 0;
  }

  const avgIntake = loggedDays > 0 ? Math.round(totalIntake / loggedDays) : 0;
  const avgSteps = loggedDays > 0 ? Math.round(totalSteps / loggedDays) : 0;
  const achievement = target > 0 ? Math.min(100, Math.round((avgIntake / target) * 100)) : 0;

  const weightChange = (firstStat && lastStat && firstStat !== lastStat)
    ? (lastStat.weight - firstStat.weight).toFixed(1)
    : null;
  const fatChange = (firstStat && lastStat && firstStat !== lastStat)
    ? (lastStat.fat_percent - firstStat.fat_percent).toFixed(1)
    : null;

  const lines = [
    `📊 *今週のヘルスレポート*`,
    `━━━━━━━━━━━━━━`,
  ];

  if (lastStat) {
    lines.push(`*【体組成】*`);
    lines.push(`体重: ${lastStat.weight} kg${weightChange !== null ? ` (${weightChange > 0 ? '+' : ''}${weightChange} kg)` : ''}`);
    lines.push(`体脂肪率: ${lastStat.fat_percent}%${fatChange !== null ? ` (${fatChange > 0 ? '+' : ''}${fatChange}%)` : ''}`);
    lines.push(`骨格筋量: ${lastStat.skeletal_muscle_kg} kg`);
    lines.push('');
  }

  lines.push(`*【カロリー管理】*`);
  lines.push(`平均摂取: ${avgIntake} kcal/日（目標 ${target} kcal）`);
  lines.push(`カロリー達成率: ${achievement}%`);
  lines.push('');

  lines.push(`*【運動】*`);
  lines.push(`筋トレ: ${trainDays}日`);
  lines.push(`平均歩数: ${avgSteps.toLocaleString()}歩/日`);
  lines.push('');

  lines.push(`━━━━━━━━━━━━━━`);
  lines.push(`🎉 ${randomPraise()}`);

  return lines.join('\n');
}
