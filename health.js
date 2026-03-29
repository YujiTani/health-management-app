#!/usr/bin/env node
/**
 * health.js - カロリー・体組成・筋トレ管理CLI
 *
 * Usage:
 *   node health.js status
 *   node health.js meal add <名前> <kcal>
 *   node health.js meal list
 *   node health.js steps <歩数>
 *   node health.js workout add <種目> <セット数> <レップ数> [重量kg] [時間min]
 *   node health.js workout list
 *   node health.js workout prs
 *   node health.js body update --weight=63 --fat=19.3 --muscle=25.3 --bmr=1387.3 [--visceral=9]
 *   node health.js body history
 *   node health.js notify noon|evening
 *   node health.js report
 */

import { readJSON, writeJSON, getDayLog, saveDayLog, today } from './src/db.js';
import {
  calcDailyTarget, calcRemaining, getTodayIntake,
  getTodayExerciseKcal, stepsToKcal, workoutToKcal, getLatestBodyStats
} from './src/calorie.js';
import { sendSlack, buildRemainingBlock } from './src/slack.js';
import { buildWeeklyReport } from './src/report.js';

const args = process.argv.slice(2);
const cmd = args[0];
const sub = args[1];

// ── helpers ──────────────────────────────────────────────────────────────────

function parseFlags(args) {
  const flags = {};
  for (const arg of args) {
    const m = arg.match(/^--(\w+)=(.+)$/);
    if (m) flags[m[1]] = isNaN(m[2]) ? m[2] : parseFloat(m[2]);
  }
  return flags;
}

function printLine() { console.log('─'.repeat(44)); }

function printStatus(day) {
  const target = calcDailyTarget();
  const intake = getTodayIntake(day);
  const exerciseKcal = getTodayExerciseKcal(day);
  const remaining = target - intake + exerciseKcal;
  const bar = Math.round((intake / target) * 20);
  const filled = '█'.repeat(Math.min(bar, 20));
  const empty = '░'.repeat(Math.max(0, 20 - bar));

  printLine();
  console.log(`📅 ${today()} のサマリー`);
  printLine();
  console.log(`目標カロリー : ${target} kcal`);
  console.log(`摂取済み     : ${intake} kcal`);
  console.log(`運動消費     : +${exerciseKcal} kcal`);
  console.log(`残り         : ${remaining} kcal`);
  console.log(`進捗         : [${filled}${empty}] ${Math.round((intake / target) * 100)}%`);
  printLine();

  if (day.meals.length > 0) {
    console.log('🍽 食事記録:');
    day.meals.forEach(m => console.log(`  ${m.time} ${m.name} ${m.kcal} kcal`));
  }
  if (day.steps > 0) {
    console.log(`🚶 歩数: ${day.steps.toLocaleString()}歩 (-${day.stepsKcal || 0} kcal)`);
  }
  if (day.workouts.length > 0) {
    console.log('💪 筋トレ:');
    day.workouts.forEach(w => {
      const wt = w.weight ? ` ${w.weight}kg` : '';
      console.log(`  ${w.exercise}${wt} ${w.sets}×${w.reps} (-${w.kcal_burned || 0} kcal)`);
    });
  }
}

// ── commands ──────────────────────────────────────────────────────────────────

async function cmdMeal() {
  const { log, day } = getDayLog();
  const stats = getLatestBodyStats();

  if (sub === 'add') {
    const name = args[2];
    const kcal = parseInt(args[3]);
    if (!name || isNaN(kcal)) {
      console.error('Usage: meal add <名前> <kcal>');
      process.exit(1);
    }
    const now = new Date().toTimeString().slice(0, 5);
    day.meals.push({ name, kcal, time: now });
    saveDayLog(log);

    const target = calcDailyTarget();
    const intake = getTodayIntake(day);
    const remaining = target - intake + getTodayExerciseKcal(day);
    console.log(`✅ 追加: ${name} ${kcal} kcal`);
    console.log(`残り: ${remaining} kcal / 目標 ${target} kcal`);

  } else if (sub === 'list') {
    if (day.meals.length === 0) {
      console.log('今日の食事記録はまだありません');
    } else {
      printLine();
      day.meals.forEach(m => console.log(`${m.time}  ${m.name}  ${m.kcal} kcal`));
      printLine();
      console.log(`合計: ${getTodayIntake(day)} kcal`);
    }
  } else {
    console.error('Usage: meal add|list');
  }
}

async function cmdSteps() {
  const count = parseInt(sub);
  if (isNaN(count)) {
    console.error('Usage: steps <歩数>');
    process.exit(1);
  }
  const stats = getLatestBodyStats();
  const weight = stats ? stats.weight : 63;
  const kcal = stepsToKcal(count, weight);

  const { log, day } = getDayLog();
  day.steps = count;
  day.stepsKcal = kcal;
  saveDayLog(log);

  console.log(`✅ 歩数: ${count.toLocaleString()}歩 → 消費 ${kcal} kcal`);
}

async function cmdWorkout() {
  if (sub === 'add') {
    const exercise = args[2];
    const sets = parseInt(args[3]);
    const reps = parseInt(args[4]);
    const weight = args[5] ? parseFloat(args[5]) : null;
    const duration = args[6] ? parseInt(args[6]) : 60;

    if (!exercise || isNaN(sets) || isNaN(reps)) {
      console.error('Usage: workout add <種目> <セット> <レップ> [重量kg] [時間min]');
      process.exit(1);
    }

    const stats = getLatestBodyStats();
    const bodyWeight = stats ? stats.weight : 63;
    const kcalBurned = workoutToKcal(duration, bodyWeight);
    const now = new Date().toTimeString().slice(0, 5);

    const { log, day } = getDayLog();
    day.workouts.push({ exercise, sets, reps, weight, duration_min: duration, kcal_burned: kcalBurned, time: now });
    saveDayLog(log);

    // PR更新チェック
    const prs = readJSON('training_prs.json') || {};
    let isPR = false;
    let prMessage = '';

    if (!prs[exercise]) {
      prs[exercise] = { max_weight: null, history: [] };
    }

    if (weight !== null) {
      const prev = prs[exercise].max_weight;
      if (!prev || weight > prev.value) {
        prs[exercise].max_weight = { value: weight, date: today() };
        isPR = true;
        prMessage = `🏆 重量PR！ ${prev ? prev.value + 'kg → ' : ''}${weight}kg`;
      }
    }
    prs[exercise].history = prs[exercise].history || [];
    prs[exercise].history.push({ date: today(), sets, reps, weight, duration });
    writeJSON('training_prs.json', prs);

    console.log(`✅ ${exercise}${weight ? ` ${weight}kg` : ''} ${sets}×${reps} 記録`);
    if (isPR) console.log(prMessage);
    console.log(`消費カロリー: ${kcalBurned} kcal (${duration}分)`);

  } else if (sub === 'list') {
    const { day } = getDayLog();
    if (day.workouts.length === 0) {
      console.log('今日のワークアウト記録はありません');
    } else {
      printLine();
      day.workouts.forEach(w => {
        const wt = w.weight ? ` ${w.weight}kg` : '';
        console.log(`${w.time}  ${w.exercise}${wt}  ${w.sets}セット×${w.reps}レップ  -${w.kcal_burned}kcal`);
      });
    }

  } else if (sub === 'prs') {
    const prs = readJSON('training_prs.json') || {};
    if (Object.keys(prs).length === 0) {
      console.log('まだPR記録がありません');
    } else {
      printLine();
      console.log('🏆 パーソナルレコード');
      printLine();
      for (const [ex, data] of Object.entries(prs)) {
        const pr = data.max_weight;
        const last = data.history[data.history.length - 1];
        if (pr) {
          console.log(`${ex}: 最大 ${pr.value}kg (${pr.date})`);
        }
        if (last) {
          const wt = last.weight ? ` ${last.weight}kg` : '';
          console.log(`  └ 最終: ${last.sets}×${last.reps}${wt} (${last.date})`);
        }
      }
    }
  } else {
    console.error('Usage: workout add|list|prs');
  }
}

async function cmdBody() {
  if (sub === 'update') {
    const flags = parseFlags(args.slice(2));
    const stats = readJSON('body_stats.json') || [];
    const prev = getLatestBodyStats();

    const height = (prev && prev.height_cm) || 167;
    const weight = flags.weight || (prev && prev.weight) || 63;
    const bmi = parseFloat((weight / ((height / 100) ** 2)).toFixed(1));

    const entry = {
      date: today(),
      weight,
      bmi,
      fat_percent: flags.fat ?? (prev && prev.fat_percent),
      fat_kg: flags.fat_kg ?? (prev && prev.fat_kg),
      skeletal_muscle_percent: flags.muscle_percent ?? (prev && prev.skeletal_muscle_percent),
      skeletal_muscle_kg: flags.muscle ?? (prev && prev.skeletal_muscle_kg),
      muscle_kg: flags.muscle_kg ?? (prev && prev.muscle_kg),
      water_percent: flags.water ?? (prev && prev.water_percent),
      water_kg: flags.water_kg ?? (prev && prev.water_kg),
      visceral_fat: flags.visceral ?? (prev && prev.visceral_fat),
      bmr: flags.bmr ?? (prev && prev.bmr),
    };

    // 同日なら上書き
    const idx = stats.findIndex(s => s.date === today());
    if (idx >= 0) {
      stats[idx] = entry;
    } else {
      stats.push(entry);
    }
    writeJSON('body_stats.json', stats);

    console.log(`✅ 体組成データを更新 (${today()})`);
    if (prev) {
      const dw = (entry.weight - prev.weight).toFixed(1);
      const df = entry.fat_percent && prev.fat_percent
        ? (entry.fat_percent - prev.fat_percent).toFixed(1) : null;
      console.log(`体重: ${prev.weight}kg → ${entry.weight}kg (${dw > 0 ? '+' : ''}${dw}kg)`);
      if (df !== null) console.log(`脂肪率: ${prev.fat_percent}% → ${entry.fat_percent}% (${df > 0 ? '+' : ''}${df}%)`);
    }

  } else if (sub === 'history') {
    const stats = readJSON('body_stats.json') || [];
    printLine();
    console.log('📈 体組成履歴');
    printLine();
    stats.slice(-8).forEach(s => {
      console.log(`${s.date}  ${s.weight}kg  脂肪${s.fat_percent}%  骨格筋${s.skeletal_muscle_kg}kg`);
    });
  } else {
    console.error('Usage: body update --weight=X --fat=X --muscle=X --bmr=X [--visceral=X]');
  }
}

async function cmdNotify(time) {
  const label = time === 'noon' ? '12:00' : '18:00';
  const { day } = getDayLog();
  const { target, intake, exerciseKcal, remaining } = calcRemaining(day);
  const block = buildRemainingBlock(label, target, intake, exerciseKcal, remaining);
  await sendSlack(block.text, block.blocks);
  console.log(`✅ Slack通知送信 (${label})`);
  console.log(`残り ${remaining} kcal`);
}

async function cmdReport() {
  const text = buildWeeklyReport();
  console.log(text);
  await sendSlack(text);
  console.log('\n✅ 週次レポートをSlackに送信');
}

async function cmdStatus() {
  const { day } = getDayLog();
  printStatus(day);
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  try {
    if (!cmd || cmd === 'status') {
      await cmdStatus();
    } else if (cmd === 'meal') {
      await cmdMeal();
    } else if (cmd === 'steps') {
      await cmdSteps();
    } else if (cmd === 'workout') {
      await cmdWorkout();
    } else if (cmd === 'body') {
      await cmdBody();
    } else if (cmd === 'notify') {
      await cmdNotify(sub);
    } else if (cmd === 'report') {
      await cmdReport();
    } else {
      console.log(`コマンド一覧:
  status                            今日のサマリー
  meal add <名前> <kcal>            食事を記録
  meal list                         今日の食事一覧
  steps <歩数>                      歩数を記録
  workout add <種目> <S> <R> [kg] [min]  筋トレを記録
  workout list                      今日の筋トレ一覧
  workout prs                       パーソナルレコード
  body update --weight=X --fat=X    体組成を更新
  body history                      体組成履歴
  notify noon|evening               Slack通知（残りカロリー）
  report                            週次レポートをSlack送信`);
    }
  } catch (err) {
    console.error('エラー:', err.message);
    process.exit(1);
  }
}

main();
