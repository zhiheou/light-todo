#!/usr/bin/env node
/**
 * 生成桌面版图标（Windows .ico + macOS .icns + 托盘 PNG）
 *
 * 为什么要脚本生成而不是放现成图片：
 *  1. .icns 是苹果私有格式，Windows 上造不出来 —— 只能在 Mac 构建机上传，所以图标必须能现造
 *  2. 图标主题是"茶绿圆底 + 白色对勾"，跟产品色一致（--accent #8B91E8 的姊妹色）
 *
 * 用法：node desktop/scripts/make-icons.mjs
 * 产出：desktop/build/icon.ico / icon.icns / icon.png / tray.png
 *
 * 零依赖：自己写 PNG 编码（zlib 是 Node 内置），不引第三方库。
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "build");

// ---------- 画图（纯像素，无依赖） ----------
const TEAL = [15, 118, 110]; // 茶绿（与产品主色系一致）
const WHITE = [255, 255, 255];

/** 圆角方形 + 白色对勾，返回 RGBA 像素缓冲 */
function drawIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - size * 0.03; // 留一点边距
  const r2 = radius * radius;

  // 对勾三个关键点（按尺寸比例）
  const p1 = { x: size * 0.28, y: size * 0.52 };
  const p2 = { x: size * 0.44, y: size * 0.68 };
  const p3 = { x: size * 0.73, y: size * 0.35 };
  const strokeW = Math.max(1.5, size * 0.085);

  /** 点到线段距离 */
  const distToSeg = (p, a, b) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // 圆外 → 透明（抗锯齿：边缘 1px 渐变）
      let alpha = 1;
      if (dist > radius) {
        alpha = Math.max(0, 1 - (dist - radius) / 1.2);
      }
      if (alpha <= 0) {
        px[i] = 0; px[i + 1] = 0; px[i + 2] = 0; px[i + 3] = 0;
        continue;
      }

      // 底色：茶绿（轻微径向渐变，看起来不那么死板）
      const shade = 1 - Math.min(0.18, (dist / radius) * 0.18);
      let r = Math.round(TEAL[0] * shade);
      let g = Math.round(TEAL[1] * shade);
      let b = Math.round(TEAL[2] * shade);

      // 对勾：两条线段
      const p = { x: x + 0.5, y: y + 0.5 };
      const d = Math.min(distToSeg(p, p1, p2), distToSeg(p, p2, p3));
      if (d < strokeW) {
        const t = d < strokeW - 1.2 ? 1 : Math.max(0, (strokeW - d) / 1.2);
        r = Math.round(r + (WHITE[0] - r) * t);
        g = Math.round(g + (WHITE[1] - g) * t);
        b = Math.round(b + (WHITE[2] - b) * t);
      }

      px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = Math.round(alpha * 255);
    }
  }
  return px;
}

// ---------- PNG 编码（Node 内置 zlib，无需依赖） ----------
function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n += 1) {
    c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(rgba, size) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // 每行前加 filter byte 0
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- ICO 打包（PNG-in-ICO，Vista+ 支持） ----------
function encodeICO(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);

  const dirEntries = [];
  let offset = 6 + entries.length * 16;
  for (const e of entries) {
    const dir = Buffer.alloc(16);
    dir[0] = e.size >= 256 ? 0 : e.size; // 256 写成 0
    dir[1] = e.size >= 256 ? 0 : e.size;
    dir[2] = 0; // palette
    dir[3] = 0; // reserved
    dir.writeUInt16LE(1, 4); // color planes
    dir.writeUInt16LE(32, 6); // bpp
    dir.writeUInt32LE(e.png.length, 8);
    dir.writeUInt32LE(offset, 12);
    offset += e.png.length;
    dirEntries.push(dir);
  }
  return Buffer.concat([header, ...dirEntries, ...entries.map((e) => e.png)]);
}

// ---------- ICNS 打包（PNG-in-ICNS，macOS 10.7+ 支持） ----------
function encodeICNS(entries) {
  const chunks = [];
  for (const e of entries) {
    const typeBuf = Buffer.from(e.type, "ascii"); // 4 字节类型
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(e.png.length + 8);
    chunks.push(Buffer.concat([typeBuf, lenBuf, e.png]));
  }
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(8);
  header.write("icns", 0, "ascii");
  header.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([header, body]);
}

// ---------- 主流程 ----------
mkdirSync(OUT_DIR, { recursive: true });

// Windows .ico：16/32/48/64/128/256
const icoSizes = [16, 32, 48, 64, 128, 256];
const icoEntries = icoSizes.map((size) => ({ size, png: encodePNG(drawIcon(size), size) }));
writeFileSync(join(OUT_DIR, "icon.ico"), encodeICO(icoEntries));
console.log(`✅ icon.ico   (${icoSizes.join("/")} px)`);

// macOS .icns：16/32/64/128/256/512/1024（含 @2x 命名）
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
].map((e) => ({ type: e.type, png: encodePNG(drawIcon(e.size), e.size) }));
writeFileSync(join(OUT_DIR, "icon.icns"), encodeICNS(icnsEntries));
console.log("✅ icon.icns  (macOS 全尺寸)");

// 通用 PNG（electron-builder 的 Linux 目标 / 网页也用它）
writeFileSync(join(OUT_DIR, "icon.png"), encodePNG(drawIcon(512), 512));
console.log("✅ icon.png   (512 px)");

// 托盘小图标（Windows 托盘 16px、Mac 菜单栏 22px 取 32 更清晰）
writeFileSync(join(OUT_DIR, "tray.png"), encodePNG(drawIcon(32), 32));
console.log("✅ tray.png   (32 px)");

console.log(`\n产出目录：${OUT_DIR}`);
