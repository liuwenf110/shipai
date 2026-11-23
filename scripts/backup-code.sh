#!/usr/bin/env bash
# 代码备份：本地提交 → git bundle 完整历史快照 → 同时落 iCloud Drive 与生产服务器（异地两份）
#
# 用法：bash scripts/backup-code.sh ["提交说明"]
#   不带说明时自动用「快照备份 YYYY-MM-DD HH:MM」；工作区无改动则跳过提交、只重做快照。
#
# 说明：仓库只存代码，.env/数据库/登录态素材均被 .gitignore 排除，故备份不含任何凭据与用户数据。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

MSG="${1:-快照备份 $(date '+%Y-%m-%d %H:%M')}"
TS="$(date +%Y%m%d-%H%M)"
NAME="shipai-code-$TS.bundle"
TMP="/tmp/$NAME"
IC="$HOME/Library/Mobile Documents/com~apple~CloudDocs/shipai-backups"

# 1) 提交当前改动（无改动不产生空提交）
git add -A
if git diff --cached --quiet; then
  echo "[1/4] 工作区无新改动，沿用 $(git rev-parse --short HEAD)"
else
  git commit -q -m "$MSG"
  echo "[1/4] 已提交 $(git rev-parse --short HEAD)：$(git log -1 --pretty=%s)"
fi

# 2) 生成并自检 bundle（verify 失败即中断，不产出坏快照）
git bundle create "$TMP" --all >/dev/null 2>&1
git bundle verify "$TMP" >/dev/null 2>&1
echo "[2/4] bundle 校验通过，大小 $(du -h "$TMP" | cut -f1 | tr -d ' ')"

# 3) 落 iCloud Drive，只保留最近 7 份
mkdir -p "$IC"
cp "$TMP" "$IC/$NAME"
ls -1t "$IC"/shipai-code-*.bundle 2>/dev/null | tail -n +8 | while read -r old; do rm -f "$old"; done
echo "[3/4] iCloud: $IC/$NAME"

# 4) 推生产服务器异地一份（该机未装 git，仅作文件存放），同样保留最近 7 份
scp -q "$TMP" "manban:/home/tuoniao/backups/"
ssh manban 'mkdir -p /home/tuoniao/backups && cd /home/tuoniao/backups && ls -1t shipai-code-*.bundle 2>/dev/null | tail -n +8 | xargs -r rm -f'
echo "[4/4] manban:/home/tuoniao/backups/$NAME"

rm -f "$TMP"
echo "本地 md5: $(md5 -q "$IC/$NAME")"
echo "恢复方式: git clone \"$IC/$NAME\" <新项目目录>"
