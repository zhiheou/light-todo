#!/usr/bin/env bash
# 轻待办 · 推 GitHub 专用脚本（v3.9.23 起）
#
# 为什么需要它：本机 `github.com` 的**域名解析被污染**了
#   —— 解析出来的地址连不上，但 GitHub 真实地址是通的。
# 做法：用 `-c http.curloptResolve=github.com:443:<IP>` 把地址钉死，
#   绕开被污染的解析，**不动系统 hosts、不动系统 DNS**。
#
# 用法：bash push-github.sh
#
# ⚠️ 2026-09-27 实测：`api.github.com` 这个域名**连钉地址都连不上**
#    （多个真实 IP 都试过，POST 必断），所以 `tools/push-via-api.mjs`
#    在当前网络下用不了 —— 走这个脚本就行。网络恢复后两者都能用。

set -e
cd "C:/Users/L/Documents/Codex/2026-08-18/new-chat/outputs/light-todo-v3"

# GitHub 的可用地址（实测连通；按顺序试，第一个通常就行）
IPS=("140.82.116.3" "20.27.177.113" "140.82.121.4")

pick_ip() {
  for ip in "${IPS[@]}"; do
    if timeout 25 git -c "http.curloptResolve=github.com:443:$ip" ls-remote https://github.com/zhiheou/light-todo.git HEAD >/dev/null 2>&1; then
      echo "$ip"
      return 0
    fi
  done
  return 1
}

IP=$(pick_ip) || { echo "❌ GitHub 所有候选地址都不通，稍后再试"; exit 1; }
echo "使用地址: $IP"

timeout 300 git -c "http.curloptResolve=github.com:443:$IP" -c http.postBuffer=524288000 push origin master:main
echo "✅ 已推 GitHub main"
