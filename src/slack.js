import { loadEnv } from './db.js';

export async function sendSlack(text, blocks = null) {
  const env = loadEnv();
  const webhookUrl = env.SLACK_WEBHOOK_URL;
  const channel = env.SLACK_CHANNEL || '#health';

  if (!webhookUrl) throw new Error('.env に SLACK_WEBHOOK_URL が設定されていません');

  const body = {
    channel,
    text,
    ...(blocks ? { blocks } : {}),
  };

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Slack送信失敗: ${err}`);
  }
}


export function buildRemainingBlock(time, target, intake, exerciseKcal, remaining) {
  const emoji = remaining > 500 ? '🟢' : remaining > 200 ? '🟡' : '🔴';
  const meal = remaining > 0
    ? `昼・夕食それぞれ *${Math.round(remaining / 2)} kcal* 使えます`
    : `⚠️ 目標オーバー！ ${Math.abs(remaining)} kcal 超過中`;

  return {
    text: `${time}の残りカロリー通知`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `🍽 ${time} 残りカロリー通知` },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*目標*\n${target} kcal` },
          { type: 'mrkdwn', text: `*摂取済み*\n${intake} kcal` },
          { type: 'mrkdwn', text: `*運動消費*\n+${exerciseKcal} kcal` },
          { type: 'mrkdwn', text: `*残り*\n${emoji} ${remaining} kcal` },
        ],
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: meal },
      },
    ],
  };
}
