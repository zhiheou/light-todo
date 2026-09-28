#!/usr/bin/env node
/**
 * 生成**网页侧**的品牌图标件（桌面版的图标另有其人，见下）。
 *
 * 分工：
 *   desktop/scripts/make-icons.mjs  → 桌面版要用的 .ico / .icns / 托盘（构建时现造）
 *   本脚本                          → 网页要用的 favicon.ico / favicon.svg / logo.svg
 *
 * ⚠️ 但两边**画的是同一张脸** —— 都从 `scripts/make-icon.mjs` 取几何和配色。
 *    想改图标长什么样，只改那一个文件，这两个脚本各跑一次就都对了。
 *
 * 用法：node scripts/make-brand-assets.mjs
 * 产出：public/favicon.ico · public/favicon.svg · public/logo.svg
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  drawAppIcon,
  drawIcon,
  drawMaskableIcon,
  encodeICO,
  encodePNG,
  iconSvg,
  logoSvg,
} from "./make-icon.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PUBLIC = join(ROOT, "public");

mkdirSync(PUBLIC, { recursive: true });

// ── favicon.svg：现代浏览器首选，一个文件覆盖所有尺寸
writeFileSync(join(PUBLIC, "favicon.svg"), iconSvg());
console.log("✅ public/favicon.svg   矢量，任意缩放都锐利");

// ── favicon.ico：兜底。
//    还需要它吗？需要 —— 老浏览器、部分 RSS 阅读器、以及某些"抓网站图标"
//    的服务只认 /favicon.ico（连 <link> 都不看，直接按老规矩取根目录那个文件）。
//
//    只放 16/32/48 三帧（2026-09-28 图标调研的结论）：
//    一个 ICO 最多三帧就够，现代浏览器一律走上面的 svg，更大的尺寸它用不着。
//    原来是 16~256 七帧、20KB —— 其中 128/256 那两帧占了 17KB，
//    却只有"Windows 从 ico 里抠大图标"这一种情况用得到，而桌面版根本不读这个文件。
//    砍完 20KB → 3.5KB。Windows 快捷方式/任务栏要的大图标走 desktop/build/icon.ico。
const icoSizes = [16, 32, 48];
writeFileSync(
  join(PUBLIC, "favicon.ico"),
  encodeICO(icoSizes.map((size) => ({ size, png: encodePNG(drawAppIcon(size), size) }))),
);
console.log(`✅ public/favicon.ico   (${icoSizes.join("/")} px)`);

// ── apple-touch-icon：iOS/iPadOS 加到主屏时用。
//    苹果**不会**给它加圆角，所以这里要一个**铺满的正方形**（cornerRatio: 0），
//    否则主屏上会出现"圆角里再套一层圆角"的丑边。
//    这条是照着苹果 HIG 来的，别改回圆角版。
writeFileSync(
  join(PUBLIC, "apple-touch-icon.png"),
  encodePNG(drawIcon(180, { cornerRatio: 0, blush: false, mouth: true }), 180),
);
console.log("✅ public/apple-touch-icon.png (180 px, 铺满正方形，交给 iOS 自己切圆角)");

// ── logo.svg：页内那个小 logo 的**独立文件版**（跟随 currentColor）。
//    ⚠️ 页内实际用的是 React 组件 BrandMark.tsx（img 里的 svg 拿不到 currentColor）。
//    这个文件保留给"需要一个独立 svg 文件"的场合（比如以后做宣传页、邮件模板）。
writeFileSync(join(PUBLIC, "logo.svg"), logoSvg());
console.log("✅ public/logo.svg      跟随文字颜色（页内请用 BrandMark 组件）");

// ── PWA 图标（2026-09-28 图标调研补的）。
//    manifest 本身是"加到主屏/装成应用"用的。轻待办**暂时不做 PWA**，
//    这里只把两个 PNG 摆好（各几十 KB），等哪天要加 manifest 就是一行 <link> 的事，
//    不用回头重新出图。
//    ⚠️ maskable 那两张是**满幅底板 + 缩小到安全区里的脸**，和 app 版不是同一张 ——
//       Android 会按厂商形状裁切，直接拿 app 版当 maskable 会把耳朵削掉。
for (const size of [192, 512]) {
  writeFileSync(join(PUBLIC, `icon-${size}.png`), encodePNG(drawAppIcon(size), size));
  writeFileSync(join(PUBLIC, `icon-maskable-${size}.png`), encodePNG(drawMaskableIcon(size), size));
}
console.log("✅ public/icon-192/512.png + icon-maskable-192/512.png (Android 备用)");

console.log(`\n产出目录：${PUBLIC}`);
