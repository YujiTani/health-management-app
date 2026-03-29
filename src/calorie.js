import { readJSON, today } from './db.js';

// 最新の体組成データを取得
export function getLatestBodyStats() {
  const stats = readJSON('body_stats.json') || [];
  return stats[stats.length - 1] || null;
}

// TDEE計算（基礎代謝 × 活動係数）
export function calcTDEE(bmr, activityFactor) {
  return Math.round(bmr * activityFactor);
}

// 一日の目標カロリー
export function calcDailyTarget() {
  const profile = readJSON('profile.json');
  const stats = getLatestBodyStats();
  if (!stats) return 1750;
  const tdee = calcTDEE(stats.bmr, profile.activity_factor);
  return tdee - profile.target_deficit_kcal;
}

// 歩数 → 消費カロリー
export function stepsToKcal(steps, weightKg) {
  // MET ≈ 3.5 (普通歩行), kcal = MET × weight × time(h)
  // 歩幅 ≈ 身長(cm) × 0.45 / 100 km
  // 63kgの場合: ~0.042 kcal/step
  return Math.round(steps * (weightKg / 60) * 0.042);
}

// 筋トレ → 消費カロリー (MET=5.5)
export function workoutToKcal(durationMin, weightKg) {
  return Math.round(5.5 * weightKg * (durationMin / 60));
}

// 今日の摂取カロリー合計
export function getTodayIntake(day) {
  return day.meals.reduce((sum, m) => sum + m.kcal, 0);
}

// 今日の消費カロリー（運動分のみ、BMR除く）
export function getTodayExerciseKcal(day) {
  const stepsKcal = day.stepsKcal || 0;
  const workoutKcal = day.workouts.reduce((sum, w) => sum + (w.kcal_burned || 0), 0);
  return stepsKcal + workoutKcal;
}

// 残りカロリー計算
export function calcRemaining(day) {
  const target = calcDailyTarget();
  const intake = getTodayIntake(day);
  const exerciseKcal = getTodayExerciseKcal(day);
  const remaining = target - intake + exerciseKcal;
  return { target, intake, exerciseKcal, remaining };
}
