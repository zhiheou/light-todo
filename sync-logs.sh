#!/usr/bin/env bash
# 轻待办 · 日志同步脚本
# 用途：把 _devlog 的 00 跟踪文档同步到桌面（用户看的副本）+ 提醒推 GitHub。
# 用法：bash sync-logs.sh
# 每次对话收尾 / 每次改完 00 文档后跑一次。根治"桌面副本落后"。

set -e
SRC="C:/Users/L/Documents/Codex/2026-08-18/new-chat/outputs/light-todo-v3/_devlog/00-需求与状态跟踪.md"
DST="D:/桌面/轻待办-需求与状态跟踪.md"

if [ ! -f "$SRC" ]; then
  echo "❌ 源文件不存在: $SRC"
  exit 1
fi

cp "$SRC" "$DST"
echo "✅ 已同步到桌面: $DST"

# 顺带推 GitHub（若在 git 仓库里且能连代理）
cd "C:/Users/L/Documents/Codex/2026-08-18/new-chat/outputs/light-todo-v3" 2>/dev/null && {
  if git rev-parse --git-dir >/dev/null 2>&1; then
    git add _devlog/00-需求与状态跟踪.md _devlog/README.md CLAUDE.md 2>/dev/null
    if ! git diff --cached --quiet; then
      git commit -m "sync: 日志/大脑更新" >/dev/null 2>&1
      echo "✅ 已提交本地"
    fi
    HTTPS_PROXY=http://127.0.0.1:7897 http_proxy=http://127.0.0.1:7897 git push origin master:main >/dev/null 2>&1 && echo "✅ 已推 GitHub main" || echo "⚠️ push 未成功(可能无代理/无改动)"
  fi
}

echo "完成。"
