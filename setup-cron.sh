#!/bin/bash
# health-app cron セットアップ
# Usage: bash setup-cron.sh

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
NODE_PATH="$(which node)"

echo "=== Health App Cron セットアップ ==="
echo "アプリディレクトリ: $APP_DIR"
echo "Node.js: $NODE_PATH"

# 既存のcronを取得して health-app エントリを除外
EXISTING=$(crontab -l 2>/dev/null | grep -v 'health-app')

# 新しいcronエントリ
NEW_CRON=$(cat <<EOF
# health-app: 12時の残りカロリー通知
0 12 * * * $NODE_PATH $APP_DIR/scripts/notify.js noon >> $APP_DIR/logs/cron.log 2>&1
# health-app: 18時の残りカロリー通知
0 18 * * * $NODE_PATH $APP_DIR/scripts/notify.js evening >> $APP_DIR/logs/cron.log 2>&1
# health-app: 毎週日曜20時に週次レポート
0 20 * * 0 $NODE_PATH $APP_DIR/scripts/notify.js weekly >> $APP_DIR/logs/cron.log 2>&1
EOF
)

# ログディレクトリ作成
mkdir -p "$APP_DIR/logs"

# cron登録
(echo "$EXISTING"; echo "$NEW_CRON") | crontab -

echo "✅ cron登録完了！"
echo ""
echo "登録内容:"
echo "  毎日 12:00 - 残りカロリー通知 (Slack #health)"
echo "  毎日 18:00 - 残りカロリー通知 (Slack #health)"
echo "  毎週日曜 20:00 - 週次レポート (Slack #health)"
echo ""
echo "確認: crontab -l | grep health-app"
