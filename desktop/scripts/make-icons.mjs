#!/usr/bin/env node
/**
 * 生成**桌面版**要用的图标（Windows .ico + macOS .icns + 系统托盘 PNG）。
 *
 * ⚠️ 这个脚本**不定义图标长什么样** —— 它只管打包格式。
 *    形象/配色/几何全在 `../../scripts/make-icon.mjs`（和网页 favicon 同一份）。
 *    改图标 → 改那一个文件 → 跑这个脚本 + `scripts/make-brand-assets.mjs`。
 *
 * 为什么必须"现造"而不是放几张现成图片：
 *  1. `.icns` 是苹果私有格式，**Windows 上造不出来** —— 只能在 Mac 构建机上生成，
 *     而 GitHub Actions 每次构建都会重新 checkout 一份代码（没有历史产物），
 *     所以图标必须能从这个仓库里的代码现场算出来
 *  2. 顺带解决"网页图标和桌面图标长得不一样" —— 现在两边同源
 *
 * 用法：node desktop/scripts/make-icons.mjs
 * 产出：desktop/build/icon.ico · icon.icns · icon.png · tray.png · tray@2x.png
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  drawAppIcon,
  drawMacIcon,
  drawTrayIcon,
  encodeICO,
  encodeICNS,
  encodePNG,
} from "../../scripts/make-icon.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "build");

mkdirSync(OUT_DIR, { recursive: true });

// ── Windows .ico：16/24/32/48/64/128/256
//    24 和 64 是 Windows 实际会用到的（列表视图 / 中图标），别省
const icoSizes = [16, 24, 32, 48, 64, 128, 256];
writeFileSync(
  join(OUT_DIR, "icon.ico"),
  encodeICO(icoSizes.map((size) => ({ size, png: encodePNG(drawAppIcon(size), size) }))),
);
console.log(`✅ icon.ico   (${icoSizes.join("/")} px)`);

// ── macOS .icns：16/32/64/128/256/512/1024（含 @2x 命名）
//    Mac 版四周留白（苹果图标网格），否则 Dock 里会比别的 App 大一圈
const icnsEntries = [
  { type: "icp4", size: 16 },
  { type: "icp5", size: 32 },
  { type: "icp6", size: 64 },
  { type: "ic07", size: 128 },
  { type: "ic08", size: 256 },
  { type: "ic09", size: 512 },
  { type: "ic10", size: 1024 },
  { type: "ic11", size: 32 }, // 16@2x
  { type: "ic12", size: 64 }, // 32@2x
  { type: "ic13", size: 256 }, // 128@2x
  { type: "ic14", size: 512 }, // 256@2x
].map((e) => ({ type: e.type, png: encodePNG(drawMacIcon(e.size), e.size) }));
writeFileSync(join(OUT_DIR, "icon.icns"), encodeICNS(icnsEntries));
console.log("✅ icon.icns  (macOS 全尺寸，含四周留白)");

// ── 通用 PNG（Linux 目标 / 安装器界面也用它）
writeFileSync(join(OUT_DIR, "icon.png"), encodePNG(drawAppIcon(512), 512));
console.log("✅ icon.png   (512 px)");

// ── 系统托盘
//
// 为什么要**单独一张图**、而不是直接拿 icon.ico 缩放：
//   托盘是画在用户自己的任务栏上的，那块地方深浅不可控，而且只有 16px。
//   带浅紫方底的完整图标缩到 16px = 一块糊掉的方块；
//   所以托盘走"只画剪影、不画底板"的另一套画法（见 make-icon.mjs 的 drawTrayIcon）。
//
// ⚠️ 现在的 main.js 还在用 icon.ico 当托盘图（v3.9.x 的历史写法），
//    这两个文件是给后续切换用的，先一起产出，不算多余。
writeFileSync(join(OUT_DIR, "tray.png"), encodePNG(drawTrayIcon(16, "ink"), 16));
writeFileSync(join(OUT_DIR, "tray@2x.png"), encodePNG(drawTrayIcon(32, "ink"), 32));
console.log("✅ tray.png   (16 px 剪影) + tray@2x.png (32 px)");

console.log(`\n产出目录：${OUT_DIR}`);
