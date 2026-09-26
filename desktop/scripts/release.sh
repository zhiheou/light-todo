#!/usr/bin/env bash
# 轻待办桌面版 · 一键发布（打包 → 上传到我们自己的服务器 → 桌面版就能自动更新）
#
# 用法：bash desktop/scripts/release.sh
#
# 做了三件事：
#   1. 打包 Windows 安装包（含 latest.yml —— 自动更新的版本描述文件）
#   2. 上传安装包 + latest.yml 到 Cloudflare R2（我们自己的下载源，国内可访问）
#   3. 打印下载链接与更新地址，供下载页/桌面版使用
#
# 前置：需要先开通 R2（CF 后台 → R2 → Enable），并在 worker/wrangler.toml 里
#       取消 [[r2_buckets]] 的注释、重新 deploy 一次。
set -e

PROJ="C:/Users/L/Documents/Codex/2026-08-18/new-chat/outputs/light-todo-v3"
BUCKET="light-todo-downloads"
TOKEN_FILE="$HOME/.cf-token"

cd "$PROJ/desktop"

echo "① 打包 Windows 安装包…"
export CSC_IDENTITY_AUTO_DISCOVERY=false
export ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
# 注意 -c.win.signAndEditExecutable=false：绕开 winCodeSign 的符号链接权限问题；
# 图标与版本信息由 scripts/after-pack.cjs 钩子自己补写。
npx electron-builder --win -c.win.signAndEditExecutable=false

# 找到产物（文件名含中文，用通配符匹配）
SETUP=$(ls release/*Setup*.exe 2>/dev/null | head -1)
YML="release/latest.yml"
if [ -z "$SETUP" ]; then echo "❌ 没找到安装包"; exit 1; fi
if [ ! -f "$YML" ]; then echo "❌ 没找到 latest.yml（自动更新的版本描述）"; exit 1; fi

echo "② 上传到 R2（我们自己域名下的下载源）…"
cd "$PROJ/worker"
export CLOUDFLARE_API_TOKEN="$(cat "$TOKEN_FILE")"

npx wrangler r2 object put "$BUCKET/$(basename "$SETUP")" --file="$SETUP" --content-type=application/octet-stream
npx wrangler r2 object put "$BUCKET/latest.yml" --file="$YML" --content-type=text/yaml

echo ""
echo "✅ 发布完成"
echo "   安装包：https://todo.aebuiyke.xyz/dl/$(basename "$SETUP")"
echo "   更新源：https://todo.aebuiyke.xyz/dl/latest.yml"
echo ""
echo "下一步：把安装包链接填进 src/lib/downloads.ts 的 DOWNLOADS.windows，再 build + deploy 一次。"
