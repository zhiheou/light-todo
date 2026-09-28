#!/usr/bin/env node
/**
 * 轻待办品牌图标 · 渲染核心（纯 Node 内置，零依赖）
 *
 * ─────────────────────────────────────────────────────────────
 * 为什么要抽成一份共享模块
 * ─────────────────────────────────────────────────────────────
 * 图标要出现在**四个地方**：网页 favicon、Windows 快捷方式、macOS Dock、系统托盘。
 * 以前这几处各画各的（网页干脆是空的 `href="data:,"`，桌面是茶绿对勾），
 * 结果就是"同一个产品四个长相"。
 *
 * 现在：**只有这一份几何定义**，谁要图标都从这里取 —— 想跑偏都跑不了。
 *
 * ─────────────────────────────────────────────────────────────
 * 为什么不用 SVG / 图片文件
 * ─────────────────────────────────────────────────────────────
 *  1. `.icns` 是苹果私有格式，Windows 上造不出来 —— 只能在 Mac 构建机上传，
 *     所以图标**必须能现造**（GitHub Actions 每次构建都会跑一遍生成脚本）
 *  2. 构建机 `npm install` 装什么、装不装得上 sharp，都是不确定的
 *     → 只允许用 Node 自带模块，任何机器上都能跑
 *  3. 顺带：图形是**算**出来的，不是画出来的 —— 改一个数字就能重出全套尺寸
 *
 * ─────────────────────────────────────────────────────────────
 * 形象从哪来（关键：和 App 里那个吉祥物是同一套坐标）
 * ─────────────────────────────────────────────────────────────
 * 圆脸小机器人「轻宜」的正脸定义在 `src/components/MascotAvatar.tsx`
 * 的 64×64 viewBox 里。这里把那些数字（椭圆圆心/半径、眼睛位置、嘴的贝塞尔
 * 控制点）**原样搬过来除以 64**，所以图标画出来的就是轻宜本人，
 * 不是"另画一个长得像的"。
 *
 * ─────────────────────────────────────────────────────────────
 * 画质：4 倍超采样
 * ─────────────────────────────────────────────────────────────
 * 直接在 16px 画布上算，边缘会全是锯齿（旧版手工写了个 1px 渐变凑合）。
 * 这里改成：**按 4 倍尺寸算，再 4×4 平均缩下来** —— 等于每个像素有 16 级
 * 抗锯齿，而且细线也敢画了。透明边缘用预乘 alpha 合成，不会出现黑边。
 */

import { deflateSync } from "node:zlib";
import {
  BRAND,
  FACE,
  FACE_SIZE,
  faceX,
  faceY,
  faceR,
  eyeRadius,
  mouthStroke,
  logoViewBox,
  faceShapes,
  pixelScale,
} from "../shared/brandSpec.mjs";

// 形象和配色**定义在 `shared/brandSpec.mjs`**（网页侧和这里共用一份）。
// 本文件只负责"把它算成像素"。
export { BRAND, FACE };

// ═══════════════════════════════════════════════════════════
// 三、画布（预乘 alpha 的浮点缓冲）
// ═══════════════════════════════════════════════════════════
function createCanvas(n) {
  const r = new Float32Array(n * n);
  const g = new Float32Array(n * n);
  const b = new Float32Array(n * n);
  const a = new Float32Array(n * n);
  const idx = (x, y) => y * n + x;

  /** 普通「盖上去」合成（预乘 alpha） */
  function blend(x, y, [cr, cg, cb], cov, alpha = 1) {
    if (cov <= 0) return;
    const i = idx(x, y);
    const sa = cov * alpha;
    const inv = 1 - sa;
    r[i] = cr * sa + r[i] * inv;
    g[i] = cg * sa + g[i] * inv;
    b[i] = cb * sa + b[i] * inv;
    a[i] = sa + a[i] * inv;
  }

  return { n, r, g, b, a, blend, idx };
}

/** 颜色 `#RRGGBB` → [r,g,b]（0~1） */
function rgb(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * 遍历画布、对每个像素求覆盖度并上色。
 * `fn(x, y)` 返回 0~1 的覆盖度（用有符号距离算出来的软边）。
 */
function fill(canvas, color, fn, alpha = 1) {
  const { n } = canvas;
  const c = rgb(color);
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      const cov = fn(x + 0.5, y + 0.5);
      if (cov > 0) canvas.blend(x, y, c, cov, alpha);
    }
  }
}

/** 有符号距离 → 覆盖度。`band` 是软边宽度（渲染空间像素） */
function cover(d, band = 1) {
  return Math.max(0, Math.min(1, 0.5 - d / band));
}

// ── 距离场 ──────────────────────────────────────────────

/** 圆角矩形的有符号距离（<0 在内部） */
function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r;
}

/** 椭圆的有符号距离（近似，够用） */
function sdEllipse(px, py, cx, cy, rx, ry) {
  // 归一化到单位圆求近似距离，再乘回最小半径 —— 椭圆率不大时误差可忽略
  const dx = (px - cx) / rx;
  const dy = (py - cy) / ry;
  const d = Math.hypot(dx, dy);
  return (d - 1) * Math.min(rx, ry);
}

/** 圆 */
function sdCircle(px, py, cx, cy, r) {
  return Math.hypot(px - cx, py - cy) - r;
}

/** 点到线段的距离 */
function sdSegment(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - x0) * dx + (py - y0) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}

/** 点到二次贝塞尔的距离（离散成 24 段逼近，超采样下足够准） */
function sdQuad(px, py, x0, y0, cx, cy, x1, y1) {
  let best = Infinity;
  let prevX = x0;
  let prevY = y0;
  const STEPS = 24;
  for (let i = 1; i <= STEPS; i += 1) {
    const t = i / STEPS;
    const it = 1 - t;
    const qx = it * it * x0 + 2 * it * t * cx + t * t * x1;
    const qy = it * it * y0 + 2 * it * t * cy + t * t * y1;
    const d = sdSegment(px, py, prevX, prevY, qx, qy);
    if (d < best) best = d;
    prevX = qx;
    prevY = qy;
  }
  return best;
}

// ═══════════════════════════════════════════════════════════
// 四、画一张图标
// ═══════════════════════════════════════════════════════════

/**
 * @param {number} size   输出边长（px）
 * @param {object} [opts]
 * @param {number} [opts.padding]  四周留白比例（macOS 要 ~0.098，其它平台 0）
 * @param {boolean} [opts.ears]    是否画两只小耳朵
 * @param {boolean} [opts.blush]   是否画腮红
 * @param {boolean} [opts.mouth]   是否画嘴
 * @param {"paper"|"ink"} [opts.style] 脸怎么画（见下）
 * @param {number} [opts.cornerRatio] 底板圆角占边长的比例（0 = 直角正方形）
 * @returns {Buffer} RGBA 像素
 */
export function drawIcon(size, opts = {}) {
  const {
    padding = 0,
    ears = true,
    blush = true,
    mouth = true,
    style = "paper",
    cornerRatio = 0.225,
  } = opts;
  const SS = 4; // 超采样倍数
  const N = size * SS;
  const canvas = createCanvas(N);

  // 归一化坐标（0~1）→ 渲染空间
  const u = (v) => v * N;

  // ── ① 底板：圆角方形（squircle 手感）
  const pad = padding * N;
  const side = N - pad * 2;
  const cx = N / 2;
  const cy = N / 2;
  const hw = side / 2;
  // macOS 那种"超椭圆"观感：半径约为边长的 22.5%
  const corner = side * cornerRatio;

  // 竖直渐变：左上亮、右下深 —— 让平面图标有一点体积感
  const cLit = rgb(BRAND.tileLit);
  const cDeep = rgb(BRAND.tileDeep);
  for (let y = 0; y < N; y += 1) {
    for (let x = 0; x < N; x += 1) {
      const d = sdRoundRect(x + 0.5, y + 0.5, cx, cy, hw, hw, corner);
      const cov = cover(d, 1.2);
      if (cov <= 0) continue;
      // 沿左上→右下取插值系数
      const t = Math.max(0, Math.min(1, ((x + y) / (2 * N) - 0.15) / 0.7));
      const col = [
        cLit[0] + (cDeep[0] - cLit[0]) * t,
        cLit[1] + (cDeep[1] - cLit[1]) * t,
        cLit[2] + (cDeep[2] - cLit[2]) * t,
      ];
      canvas.blend(x, y, col, cov);
    }
  }

  // ── ② 轻宜的脸
  //
  // 两种画法（`style`）：
  //   "paper" —— 纸白的脸 + 深色五官。**默认**。这是 App 里 mono（黑白默认）
  //              那套的构造，也是图标该有的读法：浅色形状最跳、最抓眼，
  //              深色器官落在浅色上 16px 也认得出来。
  //   "ink"   —— 深色的脸 + 挖白的五官。留作备选（深色底上更像剪影），
  //              但在浅紫底上会和底糊成一片，不推荐。
  //
  // 两种都用 --on-accent / 纸白这一对颜色 —— 和界面同一个色系，不另起炉灶。
  const FACE_COLOR = style === "ink" ? BRAND.on : BRAND.shine;
  const FEATURE_COLOR = style === "ink" ? BRAND.shine : BRAND.on;
  const INK = rgb(FACE_COLOR);

  // 身体轮廓：scale 的定义见 shared/brandSpec.mjs 的 pixelScale
  const g = pixelScale(side, cx, cy);
  const gx = g.bx;
  const gy = g.by;
  const gr = g.br;

  // 耳朵先画（有一半在身体椭圆上，会被身体盖掉内侧，露出来那半就是耳朵）
  if (ears) {
    for (const ear of [FACE.earL, FACE.earR]) {
      fill(canvas, FACE_COLOR, (x, y) => cover(sdCircle(x, y, gx(ear.cx), gy(ear.cy), gr(ear.r))));
    }
  }

  // 身体
  fill(canvas, FACE_COLOR, (x, y) =>
    cover(sdEllipse(x, y, gx(FACE.body.cx), gy(FACE.body.cy), gr(FACE.body.rx), gr(FACE.body.ry))),
  );

  // ── ③ 五官：画在脸上，所以颜色和脸**反着来**
  const PAPER = FEATURE_COLOR;

  // 腮红（先画，被眼睛压住也无所谓）
  if (blush) {
    for (const cheek of [FACE.cheekL, FACE.cheekR]) {
      fill(
        canvas,
        BRAND.blush,
        (x, y) => cover(sdEllipse(x, y, gx(cheek.cx), gy(cheek.cy), gr(cheek.rx), gr(cheek.ry))),
        0.75,
      );
    }
  }

  // 眼睛：两个圆点（放大些，小尺寸才看得见）
  const eyeR = g.bu(eyeRadius());
  for (const eye of [FACE.eyeL, FACE.eyeR]) {
    fill(canvas, PAPER, (x, y) => cover(sdCircle(x, y, gx(eye.cx), gy(eye.cy), eyeR)));
  }

  // 嘴：一条弧线（细，小尺寸下会自然融掉，不碍事）
  if (mouth) {
    const strokeW = Math.max(1.2, g.bu(mouthStroke()));
    fill(canvas, PAPER, (x, y) => {
      const m = FACE.mouth;
      const d =
        sdQuad(x, y, gx(m.x0), gy(m.y0), gx(m.cx), gy(m.cy), gx(m.x1), gy(m.y1)) - strokeW / 2;
      return cover(d, 1.2);
    });
  }

  // ── ④ 降采样：4×4 平均（这一步才是真正的抗锯齿来源）
  return downsample(canvas, size, SS);
}

/** 预乘 alpha 的 4×4 平均降采样 → 直通 RGBA Buffer */
function downsample(canvas, size, ss) {
  const { n, r, g, b, a } = canvas;
  const out = Buffer.alloc(size * size * 4);
  const inv = 1 / (ss * ss);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let ar = 0;
      let ag = 0;
      let ab = 0;
      let aa = 0;
      for (let dy = 0; dy < ss; dy += 1) {
        for (let dx = 0; dx < ss; dx += 1) {
          const i = (y * ss + dy) * n + (x * ss + dx);
          ar += r[i];
          ag += g[i];
          ab += b[i];
          aa += a[i];
        }
      }
      ar *= inv;
      ag *= inv;
      ab *= inv;
      aa *= inv;

      const o = (y * size + x) * 4;
      if (aa <= 0.0001) {
        out[o] = 0;
        out[o + 1] = 0;
        out[o + 2] = 0;
        out[o + 3] = 0;
        continue;
      }
      // 预乘 → 直通（否则半透明边缘会发黑）
      out[o] = Math.round(Math.min(1, ar / aa) * 255);
      out[o + 1] = Math.round(Math.min(1, ag / aa) * 255);
      out[o + 2] = Math.round(Math.min(1, ab / aa) * 255);
      out[o + 3] = Math.round(Math.min(1, aa) * 255);
    }
  }
  return out;
}

// ═══════════════════════════════════════════════════════════
// 五、PNG / ICO / ICNS 封装（全用 Node 内置 zlib）
// ═══════════════════════════════════════════════════════════

let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = [];
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/** RGBA 像素 → PNG 文件字节 */
export function encodePNG(rgba, size) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 位深
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0; // 每行前缀 filter byte
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/** PNG-in-ICO（Vista+ 支持，现代 Windows 全兼容） */
export function encodeICO(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);
  const dirs = [];
  let offset = 6 + entries.length * 16;
  for (const e of entries) {
    const d = Buffer.alloc(16);
    d[0] = e.size >= 256 ? 0 : e.size;
    d[1] = e.size >= 256 ? 0 : e.size;
    d.writeUInt16LE(1, 4); // color planes
    d.writeUInt16LE(32, 6); // bpp
    d.writeUInt32LE(e.png.length, 8);
    d.writeUInt32LE(offset, 12);
    offset += e.png.length;
    dirs.push(d);
  }
  return Buffer.concat([header, ...dirs, ...entries.map((e) => e.png)]);
}

/** PNG-in-ICNS（macOS 10.7+ 支持） */
export function encodeICNS(entries) {
  const chunks = [];
  for (const e of entries) {
    const typeBuf = Buffer.from(e.type, "ascii");
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

// ═══════════════════════════════════════════════════════════
// 六、图标上的"小尺寸自适应"
// ═══════════════════════════════════════════════════════════
//
// 16px 的 favicon 只有 256 个像素。腮红（占 3/64 宽）和嘴（一条 2px 线）
// 在这个尺寸下不是"变小"，而是**变成脏点**——反而把眼睛挤糊了。
// 所以按尺寸分级减笔画，跟真人设计师交小尺寸稿时做的事一样。
export function drawAppIcon(size) {
  const tiny = size <= 24;
  const small = size <= 48;
  return drawIcon(size, {
    blush: !small,
    mouth: !tiny,
    ears: size > 20,
  });
}

/** macOS 版：四周要留白（苹果图标网格：824/1024 ≈ 0.805，即每边留 9.8%） */
export function drawMacIcon(size) {
  const tiny = size <= 32;
  return drawIcon(size, {
    padding: 0.098,
    blush: false, // macOS 尺寸多，腮红在大图标上才有意义，统一不画更干净
    mouth: size > 32,
    ears: !tiny,
  });
}

/**
 * 系统托盘版：**不画底板，只有一张剪影**。
 *
 * 为什么和其它几个不一样：托盘图标（Windows 16px、Mac 菜单栏 22px）
 * 是画在**用户自己的任务栏**上的，而任务栏深浅完全不可控。
 * 带一块浅紫方底 → 在浅色任务栏上是一块突兀的方块；
 * 画成实心剪影 → 深浅任务栏都能看清（Windows/Linux 用深色墨，
 * macOS 用 template 图，由系统按当前菜单栏深浅自动反色）。
 *
 * @param {"ink"|"paper"|"template"} tone
 *   ink      —— 深色剪影（Windows / Linux 托盘）
 *   paper    —— 浅色剪影（深色任务栏备用）
 *   template —— 纯黑 + alpha（macOS template image，系统自动反色）
 */
export function drawTrayIcon(size, tone = "ink") {
  const color = tone === "paper" ? BRAND.shine : tone === "template" ? "#000000" : BRAND.on;
  const SS = 4;
  const N = size * SS;
  const canvas = createCanvas(N);

  const cx = N / 2;
  const cy = N / 2;
  // 托盘没有底板，所以脸要占满整个画布（比 app 图标大一圈）
  const side = N * 0.96;
  const g = pixelScale(side, cx, cy);
  const gx = g.bx;
  const gy = g.by;
  const gr = g.br;

  // 耳朵 + 身体：一整块剪影
  // ⚠️ 16px 下耳朵只有 1~2 个像素，会变成身体上方两个游离的小点（实测过，像脏点）
  //    —— 小到这个份上就不画了，留一颗干净的圆头反而更像"角色"。
  if (size > 20) {
    for (const ear of [FACE.earL, FACE.earR]) {
      fill(canvas, color, (x, y) => cover(sdCircle(x, y, gx(ear.cx), gy(ear.cy), gr(ear.r))));
    }
  }
  const b = FACE.body;
  fill(canvas, color, (x, y) =>
    cover(sdEllipse(x, y, gx(b.cx), gy(b.cy), gr(b.rx), gr(b.ry))),
  );

  // 五官挖空（用 destination-out 的等价做法：把这块 alpha 减掉）
  const eyes = [FACE.eyeL, FACE.eyeR];
  const eyeR = g.bu(eyeRadius());
  for (let y = 0; y < N; y += 1) {
    for (let x = 0; x < N; x += 1) {
      const i = y * N + x;
      if (canvas.a[i] <= 0) continue;
      let cut = 0;
      for (const eye of eyes) {
        cut = Math.max(cut, cover(sdCircle(x + 0.5, y + 0.5, gx(eye.cx), gy(eye.cy), eyeR)));
      }
      // 嘴：小尺寸下不挖，挖了就是两个洞
      if (size > 20) {
        const m = FACE.mouth;
        const w = Math.max(1.2, g.bu(mouthStroke()));
        cut = Math.max(
          cut,
          cover(sdQuad(x + 0.5, y + 0.5, gx(m.x0), gy(m.y0), gx(m.cx), gy(m.cy), gx(m.x1), gy(m.y1)) - w / 2, 1.2),
        );
      }
      if (cut > 0) {
        const keep = Math.max(0, 1 - cut);
        canvas.r[i] *= keep;
        canvas.g[i] *= keep;
        canvas.b[i] *= keep;
        canvas.a[i] *= keep;
      }
    }
  }

  return downsample(canvas, size, SS);
}

// ═══════════════════════════════════════════════════════════
// 七、网页用的品牌件（favicon.svg + 页内 logo）
// ═══════════════════════════════════════════════════════════
//
// 桌面版只能"算"图标（.icns 得现造），但**网页侧用 SVG 更好**：
//   1. 矢量，任何缩放都锐利（favicon 从 16px 到 512px 一个文件搞定）
//   2. 体积小（几百字节 vs PNG 的几 KB），还能 gzip
//   3. 能带 <title>，读屏软件念得出是什么
//   4. 页内那个 logo 还能跟随主题色（currentColor）—— 换了主题色，logo 跟着变
//
// 几何定义和 PNG 版**完全同源**：下面这些数字都是从 FACE 和 BRAND 推出来的。

/** 把 shared/brandSpec.mjs 算出来的图形转成 SVG 元素字符串 */
function shapesToSvg(shapes) {
  return shapes
    .map((s) => {
      if (s.kind === "circle") {
        return `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}" fill="${s.fill}"/>`;
      }
      if (s.kind === "ellipse") {
        const extra = s.opacity != null ? ` opacity="${s.opacity}"` : "";
        return `<ellipse cx="${s.cx}" cy="${s.cy}" rx="${s.rx}" ry="${s.ry}" fill="${s.fill}"${extra}/>`;
      }
      return (
        `<path d="${s.d}" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.strokeWidth}"` +
        ` stroke-linecap="round"/>`
      );
    })
    .join("");
}

/**
 * 网页用的图标 SVG（自带底板的完整图标）。
 *
 * ⚠️ 颜色写死，不用 currentColor —— 这是**独立文件**，
 *    浏览器标签页/任务栏里没有可继承的颜色，写 currentColor 会变成黑色。
 */
export function iconSvg() {
  const r = Number((FACE_SIZE * BRAND.cornerRatio).toFixed(2));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${FACE_SIZE} ${FACE_SIZE}" role="img" aria-label="轻待办">` +
    `<title>轻待办</title>` +
    `<defs><linearGradient id="ltgrad" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${BRAND.tileLit}"/>` +
    `<stop offset="1" stop-color="${BRAND.tileDeep}"/>` +
    `</linearGradient></defs>` +
    `<rect x="0" y="0" width="${FACE_SIZE}" height="${FACE_SIZE}" rx="${r}" fill="url(#ltgrad)"/>` +
    // 腮红是给大尺寸看的，favicon 不画（小尺寸下就是两块脏点）
    shapesToSvg(faceShapes({ faceFill: BRAND.shine, featureFill: BRAND.on, withBlush: false })) +
    `</svg>`
  );
}

/**
 * Android 自适应图标（maskable）专用：**满幅底板 + 缩到安全区里的脸**。
 *
 * 为什么和 drawAppIcon 不一样（2026-09-28 图标调研）：
 *   Android 会按厂商自己决定的形状裁切这层图 —— 圆形、水滴、方圆形都有，
 *   只保证**正中直径 80% 的圆**一定看得见，四周各 10% 可能被切掉。
 *   直接拿 drawAppIcon 当 maskable，圆角裁切会把两只耳朵一起削掉。
 *   所以底板铺满（被裁掉也不心疼），脸整体缩到 80% 的安全区以内。
 *
 * @param {number} size 边长
 * @param {number} [faceScale] 脸相对安全区的占比（默认 0.92，留一点呼吸感）
 */
export function drawMaskableIcon(size, faceScale = 0.92) {
  const SS = 4;
  const N = size * SS;
  const canvas = createCanvas(N);
  const cLit = rgb(BRAND.tileLit);
  const cDeep = rgb(BRAND.tileDeep);

  // ① 底板：**直角**铺满整张画布（裁切交给系统，我们不留圆角也不留白）
  for (let y = 0; y < N; y += 1) {
    for (let x = 0; x < N; x += 1) {
      const t = Math.max(0, Math.min(1, ((x + y) / (2 * N) - 0.15) / 0.7));
      const col = [
        cLit[0] + (cDeep[0] - cLit[0]) * t,
        cLit[1] + (cDeep[1] - cLit[1]) * t,
        cLit[2] + (cDeep[2] - cLit[2]) * t,
      ];
      canvas.blend(x, y, col, 1);
    }
  }

  // ② 脸缩进安全区：side 从"整张画布"缩到 0.8（安全区直径）× faceScale
  const g = pixelScale(N * 0.8 * faceScale, N / 2, N / 2);
  for (const ear of [FACE.earL, FACE.earR]) {
    fill(canvas, BRAND.shine, (x, y) => cover(sdCircle(x, y, g.bx(ear.cx), g.by(ear.cy), g.br(ear.r))));
  }
  const b = FACE.body;
  fill(canvas, BRAND.shine, (x, y) =>
    cover(sdEllipse(x, y, g.bx(b.cx), g.by(b.cy), g.br(b.rx), g.br(b.ry))),
  );
  const eyes = [FACE.eyeL, FACE.eyeR];
  for (const eye of eyes) {
    fill(canvas, BRAND.on, (x, y) => cover(sdCircle(x, y, g.bx(eye.cx), g.by(eye.cy), g.bu(eyeRadius()))));
  }
  // maskable 常被缩到很小，嘴和腮红在这里是脏点，不画
  return downsample(canvas, size, SS);
}

/**
 * 页内 logo（不带底板，只有头）。
 *
 * 用 `currentColor` 当脸色 —— 侧边栏、登录页、下载页各自继承自己的文字色，
 * 换了主题色 logo 自动跟着变，不需要为每套主题出图。
 *
 * ⚠️ **这个文件只能内联用**（`?raw` 或 React 组件）。
 *    `<img src="/logo.svg">` 是**不生效**的 —— img 里的 SVG 是独立文档，
 *    拿不到外面的 CSS 变量，也不会继承 currentColor，会渲染成黑色或透明。
 *    页内请用 `src/components/BrandMark.tsx`（同样的几何，直接画成 JSX）。
 */
export function logoSvg() {
  const vb = logoViewBox();
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.x} ${vb.y} ${vb.size} ${vb.size}"` +
    ` aria-hidden="true" focusable="false">` +
    shapesToSvg(
      faceShapes({
        faceFill: "currentColor",
        featureFill: "var(--on-accent, #fff)",
        withBlush: false,
      }),
    ) +
    `</svg>`
  );
}
