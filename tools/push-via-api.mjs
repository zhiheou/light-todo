#!/usr/bin/env node
/**
 * 绕过不通的 github.com:443，用 GitHub 官方 REST 接口推送提交。
 *
 * 背景：某次网络封锁里 github.com:443 全 IP 不通，但 api.github.com 正常。
 * 这个脚本把本地 git 对象（blob/tree/commit）直接通过接口写上去，
 * 再把分支引用指过去 —— 效果等同 git push。
 *
 * 要点：新提交的 parent 必须指向**推送后的新编号**，不能沿用本地编号，
 * 所以维护一张 本地sha → 远端sha 的映射，边推边查。
 *
 * 用法：node tools/push-via-api.mjs [分支名] [--force] [--tag <标签名>]
 *
 * ⚠️ 血泪坑（2026-09-27 踩过）：解析 tree 必须用 `ls-tree -z`！
 *    普通 `ls-tree` 会按 core.quotepath 把中文名输出成"带引号的八进制转义"
 *    （"_devlog/00-\351\234\200....md"），把它当字面路径传给 GitHub 接口
 *    → 远端树里存成名字真带引号/反斜杠的文件 → Windows Actions checkout
 *    直接 `error: invalid path`。macOS 不挑这些字符，所以只有 Windows 构建炸。
 */
import { execFileSync } from "node:child_process";

const REPO = "zhiheou/light-todo";
const API = "https://api.github.com";
const argvRest = process.argv.slice(2);
const TAG = (() => {
  const i = argvRest.indexOf("--tag");
  return i >= 0 ? argvRest[i + 1] : null;
})();
const BRANCH = argvRest.find((a) => !a.startsWith("--") && a !== TAG) || "master";
const FORCE = argvRest.includes("--force");

const token = execFileSync("git", ["config", "--get", "remote.origin.url"], {
  encoding: "utf8",
})
  .trim()
  .replace(/^.*:\/\/[^:]+:([^@]+)@.*$/, "$1");
if (!/^(github_pat_|gh[pousr]_)/.test(token)) {
  console.error("❌ 没能从 remote.origin.url 里取到 GitHub 密钥");
  process.exit(1);
}

const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 1 << 28 }).trim();
const gitBuf = (...args) => execFileSync("git", args, { maxBuffer: 1 << 28 });

// Windows 上非法的路径字符（引号/反斜杠/控制符）——上传前拦下，别再把远端的树弄坏
const badPath = (p) => /["\\]|[\x00-\x1f\x7f]/.test(p);

async function api(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "light-todo-push",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method || "GET"} ${path} → ${res.status}\n${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

// ---------- 远端当前状态 ----------
const head = git("rev-parse", "HEAD");
const remoteRef = await api(`/repos/${REPO}/git/ref/heads/${BRANCH}`).catch(() => null);
const remoteHead = remoteRef?.object?.sha ?? null;

console.log(`本地 HEAD      : ${head}`);
console.log(`远端 ${BRANCH.padEnd(7)}: ${remoteHead ?? "(分支不存在)"}`);
if (head === remoteHead && !TAG) {
  console.log("✅ 已是最新，无需推送");
  process.exit(0);
}

/**
 * 找出"要推哪些提交"。
 *
 * 不能直接 `git rev-list 远端sha..HEAD` —— 用接口推送时，远端提交的编号
 * 是 GitHub 重新生成的新编号，**本地 git 库里根本没有这个对象**，
 * 拿它当范围起点会直接报 `Invalid revision range`。
 *
 * 所以改成：拿远端提交的**提交说明首行**，在本地历史里找到对应的那个提交当基准。
 */
const localHas = (sha) => {
  try {
    execFileSync("git", ["cat-file", "-e", sha], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

function resolveLocalEquivalent(remoteMsgFirstLine) {
  for (const c of git("rev-list", "HEAD").split("\n").filter(Boolean)) {
    if (git("log", "-1", "--format=%s", c) === remoteMsgFirstLine) return c;
  }
  return null;
}

let base = null; // 本地提交 sha：从这里**之后**的提交才需要推
if (remoteHead) {
  if (localHas(remoteHead)) {
    base = remoteHead;
  } else {
    const info = await api(`/repos/${REPO}/git/commits/${remoteHead}`);
    const guess = resolveLocalEquivalent(info.message.split("\n")[0]);
    if (guess) {
      base = guess;
      console.log(`（远端提交本地不存在，已按提交说明定位到本地对应提交 ${guess.slice(0, 8)}）`);
    } else {
      // 找不到对应：保守起见全量重传（幂等，不会丢东西，只是多传几个对象）
      console.log("⚠️ 无法定位远端提交在本地历史中的位置 → 保守起见从分支起点重传");
      base = null;
    }
  }
}

const range = base ? `${base}..${head}` : head;
const commits = git("rev-list", "--reverse", range).split("\n").filter(Boolean);
console.log(`要推送 ${commits.length} 个提交\n`);

// ---------- 对象上传（带缓存，多个提交共用同一棵树时不重复传） ----------
const blobMap = new Map(); // 本地 blob sha → 远端 sha
const treeMap = new Map(); // 本地 tree sha → 远端 sha

async function pushBlob(sha) {
  if (blobMap.has(sha)) return blobMap.get(sha);
  const buf = gitBuf("cat-file", "blob", sha);
  const out = await api(`/repos/${REPO}/git/blobs`, {
    method: "POST",
    body: JSON.stringify({ content: buf.toString("base64"), encoding: "base64" }),
  });
  blobMap.set(sha, out.sha);
  return out.sha;
}

async function pushTree(sha) {
  if (treeMap.has(sha)) return treeMap.get(sha);
  // 必须 -z：NUL 分隔 + 原样 UTF-8 字节，不做 quotepath 转义（中文名才不会坏）
  const entries = git("ls-tree", "-z", sha)
    .split("\0")
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(\d+) (\w+) ([0-9a-f]+)\t([\s\S]*)$/);
      if (!m) throw new Error(`无法解析 tree 条目: ${line}`);
      if (badPath(m[4])) throw new Error(`路径含 Windows 非法字符，拒绝上传：${JSON.stringify(m[4])}`);
      return { mode: m[1], type: m[2], sha: m[3], path: m[4] };
    });

  const tree = [];
  for (const e of entries) {
    const remoteSha =
      e.type === "blob" ? await pushBlob(e.sha) : e.type === "tree" ? await pushTree(e.sha) : e.sha;
    tree.push({ path: e.path, mode: e.mode, type: e.type, sha: remoteSha });
  }
  const out = await api(`/repos/${REPO}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ tree }),
  });
  treeMap.set(sha, out.sha);
  return out.sha;
}

// ---------- 逐个提交上传 ----------
const shaMap = new Map(); // 本地 commit sha → 远端 commit sha
/**
 * 关键：把"本地基准提交"映射到"远端实际编号"。
 * 两者编号不同（接口推送时 GitHub 会重新生成），
 * 新提交的 parent 必须指向**远端的那个编号**，否则 GitHub 报 422
 * "Parent SHA does not exist or is not a commit object"。
 */
if (base && remoteHead) shaMap.set(base, remoteHead);

let lastSha = remoteHead;
for (const c of commits) {
  const meta = git("cat-file", "-p", c);
  const msgEnd = meta.indexOf("\n\n");
  const headers = meta.slice(0, msgEnd);
  const message = meta.slice(msgEnd + 2);
  const treeSha = headers.match(/^tree ([0-9a-f]+)$/m)?.[1];
  const parents = [...headers.matchAll(/^parent ([0-9a-f]+)$/gm)].map((m) => m[1]);
  if (!treeSha) throw new Error(`提交 ${c} 缺少 tree`);

  // parent 必须指向**推送后**的新编号
  const remoteParents = parents.map((p) => shaMap.get(p) ?? p);
  const remoteTree = await pushTree(treeSha);

  const out = await api(`/repos/${REPO}/git/commits`, {
    method: "POST",
    body: JSON.stringify({ message, tree: remoteTree, parents: remoteParents }),
  });
  shaMap.set(c, out.sha);
  lastSha = out.sha;
  console.log(`  ✓ ${c.slice(0, 8)} → ${out.sha.slice(0, 8)}  ${message.split("\n")[0]}`);
}

// ---------- 移动分支引用 ----------
if (remoteHead) {
  if (lastSha === remoteHead) {
    console.log(`（分支 ${BRANCH} 已指向目标提交，跳过更新）`);
  } else {
    try {
      await api(`/repos/${REPO}/git/refs/heads/${BRANCH}`, {
        method: "PATCH",
        body: JSON.stringify({ sha: lastSha, force: FORCE }),
      });
    } catch (e) {
      if (!FORCE && String(e.message).includes("422")) {
        console.error(
          `\n❌ 分支更新不是快进（远端 ${BRANCH} 上有本地没有的提交）。\n` +
            `   确认远端没有独有内容后，加 --force 重跑：\n` +
            `   node tools/push-via-api.mjs ${BRANCH} --force`,
        );
        process.exit(1);
      }
      throw e;
    }
  }
} else {
  await api(`/repos/${REPO}/git/refs`, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${BRANCH}`, sha: lastSha }),
  });
}

// 可选：把标签（重新）指到刚推上去的提交 —— 用来触发 Actions 云端构建
if (TAG) {
  const refPath = `/repos/${REPO}/git/refs/tags/${TAG}`;
  const exists = await api(refPath)
    .then(() => true)
    .catch(() => false);
  if (exists) {
    await api(refPath, { method: "PATCH", body: JSON.stringify({ sha: lastSha, force: true }) });
  } else {
    await api(`/repos/${REPO}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/tags/${TAG}`, sha: lastSha }),
    });
  }
  console.log(`\n🏷️  标签 ${TAG} → ${lastSha}（已指向新提交，可触发 Actions）`);
}

console.log(`\n✅ 已推送 ${BRANCH} → ${lastSha}`);
console.log(`\n对齐本地引用（否则 git status 会以为还没推）：`);
console.log(`  git fetch origin`);
