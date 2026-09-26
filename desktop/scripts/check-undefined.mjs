#!/usr/bin/env node
/**
 * 桌面版主进程"未定义变量"自检。
 *
 * 为什么需要（血的教训）：`node --check` 只验语法，**不查未定义变量**。
 * 我曾在改 main.js 时误删 `const APP_URL = ...`，而后面 3 处还在用它 →
 * 语法检查通过、打包毫无异常、**用户一打开就崩**
 * （ReferenceError: APP_URL is not defined，发生在模块加载期）。
 *
 * 做法：文本扫描（不用正则拼字符串，避免转义踩坑），
 * 检查关键标识符是否"被用到了但没声明"。零误报优先。
 *
 * 用法：node desktop/scripts/check-undefined.mjs
 * 退出码 0 = 通过；非 0 = 有问题（打包应当中止）
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAIN = join(__dirname, "..", "main.js");
const src = readFileSync(MAIN, "utf8");

/** 去掉行注释，避免把注释里的词当成代码 */
const code = src
  .split("\n")
  .map((line) => {
    const i = line.indexOf("//");
    return i >= 0 ? line.slice(0, i) : line;
  })
  .join("\n");

/** 某个名字是否被声明过（覆盖 const/let/var/function/async function） */
function isDeclared(name) {
  return (
    code.includes(`const ${name}`) ||
    code.includes(`let ${name}`) ||
    code.includes(`var ${name}`) ||
    code.includes(`function ${name}(`) ||
    code.includes(`function ${name} (`)
  );
}

/** 关键常量：被删掉会让程序在**加载期**就崩 */
const KEY_CONSTS = [
  "APP_URL",
  "PET_FALLBACK",
  "PET_PADDING",
  "PET_MARGIN",
  "CHAT_PANEL_W",
  "CHAT_MARGIN",
  "CHAT_WINDOW_H",
  "UPDATE_FEED",
  "UPDATE_INTERVAL_MS",
  "BOOT_ID",
];

/** 关键函数：调用处存在但定义被删 → 点了就报错（hideMainWindow 那次事故） */
const KEY_FUNCS = [
  "hideMainWindow",
  "createMainWindow",
  "createPetWindow",
  "createTray",
  "refreshTrayMenu",
  "startPetHoverWatch",
  "injectDisplayMetrics",
  "initAutoUpdate",
  "applyPetGeometry",
  "displayForPet",
  "displayMetrics",
  "petWindowGeometry",
  "mainWindowUrl",
  "withCacheBuster",
  "beginUpdateDownload",
  "installUpdateNow",
];

const problems = [];

for (const name of KEY_CONSTS) {
  if (code.includes(name) && !isDeclared(name)) {
    problems.push(`常量 ${name} 被使用但未声明`);
  }
}

for (const fn of KEY_FUNCS) {
  const called = code.includes(`${fn}(`);
  if (called && !isDeclared(fn)) {
    problems.push(`函数 ${fn}() 被调用但未定义`);
  }
}

if (problems.length > 0) {
  console.error("❌ desktop/main.js 自检未通过：");
  for (const p of problems) console.error(`   - ${p}`);
  console.error("\n这会导致应用启动即崩或点击报错。修好再打包。");
  process.exit(1);
}

console.log("✅ desktop/main.js 自检通过（关键常量与函数都齐全）");
