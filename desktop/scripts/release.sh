#!/usr/bin/env bash
# 轻待办桌面版 · 一键发布（打包 → 上传到我们自己的服务器 → 桌面版就能自动更新）
#
# 用法：bash desktop/scripts/release.sh
#
# 做了四件事：
#   1. 打包 Windows 安装包（含 latest.yml —— 自动更新的版本描述文件）
#   2. 从 GitHub Release 取回**云端 Mac 构建**的两个包（本机是 Windows，造不出 Mac 包）
#   3. 全部上传到 Cloudflare R2（我们自己的下载源，国内可访问）
#   4. 打印下载链接与更新地址，供下载页/桌面版使用
#
# 前置：需要先开通 R2（CF 后台 → R2 → Enable），并在 worker/wrangler.toml 里
#       取消 [[r2_buckets]] 的注释、重新 deploy 一次。
#
# Mac 包从哪来：`git tag vX.Y.Z` 推上去 → GitHub Actions 云端 Mac 机器造（见
#   .github/workflows/build-desktop.yml）。本机是 Windows，造不出 Mac 包。
set -e

PROJ="C:/Users/L/Documents/Codex/2026-08-18/new-chat/outputs/light-todo-v3"
BUCKET="light-todo-downloads"
TOKEN_FILE="$HOME/.cf-token"
REPO="zhiheou/light-todo"

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

echo "② 取回云端 Mac 构建的两个包…"
# 🔴 v3.9.22 血泪：Mac 包**必须按芯片分开**，少一个就有用户装不上。
#   之前 artifactName 没带 ${arch}，Intel 版和 Apple 芯片版打包成同一个文件名、
#   后者覆盖前者 → 线上只剩 arm64 的包 → 2018 款 Intel Mac 一装就报
#   「这台 Mac 不支持此应用程序」，而且从下载页完全看不出异常。
MAC_DIR="release/mac-from-ci"
rm -rf "$MAC_DIR" && mkdir -p "$MAC_DIR"

# 用 GitHub 接口按名字精确取（不用 html_url —— 那是给人点的，脚本里会 302 到别处）
GH_API="https://api.github.com/repos/$REPO/releases/tags/v$PKG_VER"
curl -fsSL "$GH_API" -o "$MAC_DIR/release.json" || {
  echo "❌ 取不到 GitHub Release v$PKG_VER —— 云端 Mac 构建可能还没跑完。"
  echo "   先看 https://github.com/$REPO/actions 是否全绿，再重跑本脚本。"
  exit 1
}

get_asset() { # $1=匹配模式  $2=说明
  local url
  url=$(node -e "
    const r = require('./$MAC_DIR/release.json');
    const a = (r.assets || []).find(x => /$1/.test(x.name));
    if (a) process.stdout.write(a.url);
  ")
  if [ -z "$url" ]; then
    echo "❌ Release 里没找到 $2（模式 $1）"
    echo "   —— Mac 包必须两个芯片都有，否则那种芯片的用户装不上。"
    exit 1
  fi
  echo "$url"
}

for pair in "mac-x64\.zip:Intel 芯片包:x64" "mac-arm64\.zip:Apple 芯片包:arm64"; do
  pat="${pair%%:*}"; rest="${pair#*:}"; desc="${rest%%:*}"; arch="${rest##*:}"
  asset_url=$(get_asset "$pat" "$desc")
  out="$MAC_DIR/light-todo-setup-$PKG_VER-mac-$arch.zip"
  echo "   下载 $desc …"
  curl -fsSL -H "Accept: application/octet-stream" "$asset_url" -o "$out"
  ls -la "$out" | awk '{printf "   → %s (%.1f MB)\n", $NF, $5/1048576}'
done
rm -f "$MAC_DIR/release.json"

echo "③ 上传到 R2（我们自己域名下的下载源）…"
# 🔴 v3.9.22 血泪：路径**必须转成绝对路径**再 cd 走。
#   `cd "$PROJ/worker"` 之后，`--file=release/xxx.exe` 这种相对路径会相对 **worker/** 去找
#   → 报 "The file ... does not exist"，而且 wrangler 是从**第一个**文件就失败，
#   三个包一个都没传上去。这里是静默失败过一次的地方，别再改回相对路径。
WIN_SETUP="$PROJ/desktop/$SETUP"
WIN_YML="$PROJ/desktop/$YML"
MAC_FILES=("$PROJ/desktop/$MAC_DIR"/light-todo-setup-*-mac-*.zip)
for f in "$WIN_SETUP" "$WIN_YML" "${MAC_FILES[@]}"; do
  [ -f "$f" ] || { echo "❌ 上传前找不到文件：$f"; exit 1; }
done

cd "$PROJ/worker"
export CLOUDFLARE_API_TOKEN="$(cat "$TOKEN_FILE")"
# 🔴🔴 v3.9.22 血泪（第二次踩）：**必须加 `--remote`**！
#   wrangler 4.x 的 `r2 object put` 默认写进**本地模拟桶**（`.wrangler/state`），
#   不是真桶。它照样打印 "Upload complete."，只是前面一行写着 "Resource location: local"
#   —— 太容易被当成噪音扫过去。结果：本地"上传成功"，线上下载页 404，
#   而 `wrangler r2 object get` 又读的是同一个本地模拟桶，所以本地自测还"能读到文件"。
#   判断真假的唯一铁证：输出里必须是 **Resource location: remote**。
#   上传完务必再用 curl 打一次真实下载链接（见脚本结尾的提示）。
npx wrangler r2 object put "$BUCKET/$(basename "$WIN_SETUP")" --file="$WIN_SETUP" --content-type=application/octet-stream --remote
npx wrangler r2 object put "$BUCKET/latest.yml" --file="$WIN_YML" --content-type=text/yaml --remote
for m in "${MAC_FILES[@]}"; do
  npx wrangler r2 object put "$BUCKET/$(basename "$m")" --file="$m" --content-type=application/octet-stream --remote
done

echo ""
echo "✅ 发布完成"
echo "   Windows：https://todo.aebuiyke.xyz/dl/$(basename "$SETUP")"
echo "   Mac(Intel)：https://todo.aebuiyke.xyz/dl/light-todo-setup-$PKG_VER-mac-x64.zip"
echo "   Mac(Apple 芯片)：https://todo.aebuiyke.xyz/dl/light-todo-setup-$PKG_VER-mac-arm64.zip"
echo "   更新源：https://todo.aebuiyke.xyz/dl/latest.yml"
echo ""
echo "下一步：把上面三个链接填进 src/lib/downloads.ts（windows / macIntel / macApple），"
echo "        再 npm run build + 部署一次。tests/downloads-consistency.test.ts 会盯着你别漏。"
