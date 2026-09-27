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

# 找到产物。
# ⚠️ v3.9.20 修：必须只匹配 ASCII 文件名（`light-todo-setup-*.exe`，由 package.json 的
# artifactName 生成）。旧写法 `ls release/*Setup*.exe | head -1` 会同时命中
# 「轻待办 Setup 3.9.4.exe」这个**历史遗留的旧构建**（并因中文排序靠前被 head 选中）
# → 上传的是旧包，用户装完发现"改了没反应"。
# 顺手清掉旧的中文名产物，避免以后再被误选。
rm -f release/*Setup*.exe 2>/dev/null || true
SETUP=$(ls release/light-todo-setup-*.exe 2>/dev/null | head -1)
YML="release/latest.yml"
if [ -z "$SETUP" ]; then echo "❌ 没找到安装包（light-todo-setup-*.exe）"; exit 1; fi
if [ ! -f "$YML" ]; then echo "❌ 没找到 latest.yml（自动更新的版本描述）"; exit 1; fi

# v3.9.20：版本号必须每次递增，否则自动更新会失效（远端=本地 → 永不提示更新）
PKG_VER=$(node -p "require('./package.json').version" 2>/dev/null || echo "?")
YML_VER=$(grep -m1 '^version:' "$YML" | awk '{print $2}')
if [ "$PKG_VER" != "$YML_VER" ]; then
  echo "❌ 版本号不一致：package.json=$PKG_VER  latest.yml=$YML_VER"
  echo "   请先在 desktop/package.json 提升 version 再发布（否则用户收不到更新）。"
  exit 1
fi
echo "📦 发布版本：$PKG_VER"

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
