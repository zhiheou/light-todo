import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { ACCENT_MAP } from "../src/lib/theme";
import BrandMark from "../src/components/BrandMark";
import {
  BRAND,
  FACE,
  FACE_SIZE,
  FACE_SCALE,
  faceX,
  faceY,
  faceR,
  eyeRadius,
  mouthStroke,
  headBox,
  logoViewBox,
  faceShapes,
} from "../shared/brandSpec.mjs";
import {
  drawAppIcon,
  drawMacIcon,
  drawTrayIcon,
  drawIcon,
  drawMaskableIcon,
  iconSvg,
  logoSvg,
  encodePNG,
  encodeICO,
  encodeICNS,
} from "../scripts/make-icon.mjs";

/**
 * 轻宜「考试系统」· 第 32 科：图标不许再「四张脸」
 *
 * 🔴 起因（2026-09-25，图标调研）：
 *   同一个产品，四个地方四个长相 ——
 *     · 网页 favicon   = `href="data:,"`（**一个故意的空图标**，等于没有）
 *     · 桌面快捷方式   = 茶绿圆底 + 白对勾（跟产品紫色完全不搭）
 *     · 侧边栏/登录页  = 图标库里的通用「清单」符号（跟产品没关系）
 *     · 系统托盘       = 直接拿 256px 的图标缩到 16px（糊成一团）
 *
 * 现在：**几何和配色只有一份**（`shared/brandSpec.mjs`），
 *       favicon / 网页 logo / Windows 图标 / macOS 图标 / 托盘全部从它算出来。
 *
 * ⚠️ 这个文件里有几条是"**回归哨兵**"——它们不检查功能，只负责在有人
 *    把图标改回老样子时当场变红。改图标前先看一遍这些断言想干什么。
 */

const ROOT = resolve(__dirname, "..");

// ════════════════════════════════════════════════════════════
// ① 配色：图标必须和界面上是同一套紫
// ════════════════════════════════════════════════════════════
describe("① 图标配色和界面同源", () => {
  it("品牌主色 = 主题里的紫色（不是当年那个茶绿 #0F766E）", () => {
    expect(BRAND.coral.toUpperCase()).toBe(ACCENT_MAP.purple.coral.toUpperCase());
  });

  it("🔴 回归哨兵：图标主色**不许**是茶绿 —— 那是老图标，跟产品完全没关系", () => {
    // 老图标写死 TEAL = [15, 118, 110] = #0F766E。这条就是拦它回来的。
    const teal = "#0F766E";
    expect(BRAND.coral.toUpperCase()).not.toBe(teal);
    // 顺带把整个品牌色板都扫一遍，任何一个位置都不该是茶绿
    for (const [name, value] of Object.entries(BRAND)) {
      if (typeof value !== "string" || !value.startsWith("#")) continue;
      expect(value.toUpperCase(), `BRAND.${name} 混进了茶绿`).not.toBe(teal);
    }
  });

  it("脸和五官必须是**互相对比**的（同色 = 五官糊在脸上看不见）", () => {
    // 默认画法：浅脸 + 深五官
    const shape = faceShapes({ faceFill: BRAND.shine, featureFill: BRAND.on });
    const fills = shape.map((s) => s.fill);
    expect(fills).toContain(BRAND.shine);
    // 嘴是可描边的路径，线色必须和脸不同，否则等于没画
    const strokes = shape.filter((s) => s.kind === "path").map((s) => s.stroke);
    expect(strokes.length).toBeGreaterThan(0);
    expect(strokes.every((s) => s === BRAND.on)).toBe(true);
    expect(BRAND.shine.toUpperCase()).not.toBe(BRAND.on.toUpperCase());
  });

  it("深紫五官写在纸白脸上，对比度 ≥ 4.5（和界面同一条及格线）", () => {
    // 复用第 31 科那套真 WCAG 公式的思路，这里只算这一对
    const lum = (hex: string) => {
      const n = parseInt(hex.replace("#", ""), 16);
      const ch = (v: number) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
    };
    const a = lum(BRAND.shine);
    const b = lum(BRAND.on);
    const [hi, lo] = a > b ? [a, b] : [b, a];
    const ratio = (hi + 0.05) / (lo + 0.05);
    expect(ratio, `五官/脸 只有 ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });

  it("🔴 白脸和白底板的对比度 ≥ 3:1 —— 这是 2026-09-28 图标调研揪出来的", () => {
    // 调研原话：品牌紫 #8B91E8 和白色只有 **2.87:1**，低于图形元素常用的 3:1 底线；
    // 底板还带渐变，亮的那头更惨（2.23:1）。所以底板单独压深了一档（BRAND.tile 系列）。
    // 品牌色本身没动 —— 界面照旧用 coral，只有图标底板走 tile。
    const lum = (hex: string) => {
      const n = parseInt(hex.replace("#", ""), 16);
      const ch = (v: number) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
    };
    const ratio = (x: string, y: string) => {
      const a = lum(x);
      const b = lum(y);
      const [hi, lo] = a > b ? [a, b] : [b, a];
      return (hi + 0.05) / (lo + 0.05);
    };
    for (const [name, bg] of [["tile", BRAND.tile], ["tileLit", BRAND.tileLit], ["tileDeep", BRAND.tileDeep]] as const) {
      const r = ratio(BRAND.shine, bg);
      expect(r, `白脸 vs ${name}(${bg}) 只有 ${r.toFixed(2)}:1，白脸会陷进底板里`).toBeGreaterThanOrEqual(2.5);
    }
    // 底线那条：主底色必须真的过 3:1
    expect(ratio(BRAND.shine, BRAND.tile)).toBeGreaterThanOrEqual(3);
  });

  it("底板色是品牌色的近亲，不是另一个颜色（色相没跑偏）", () => {
    // tile 是 coral 压深出来的。这里不查具体数值（会变），只保证：
    //  ① 还是同一个蓝色系：蓝通道最强
    //  ② **接近中性**：红绿两个通道差得不多（差太多说明色相歪到红或青去了）。
    //     ⚠️ 不能写成 r > g —— 靛紫本来就是 g > r（这正是它偏蓝的原因），
    //        BRAND.tile #7F86E2 的 g=134 就比 r=127 大。这条一开始写错了，实测才发现。
    //  ③ 压深/提亮的层次关系对
    const rgb = (hex: string) => {
      const n = parseInt(hex.replace("#", ""), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };
    for (const [name, hex] of [["tile", BRAND.tile], ["tileLit", BRAND.tileLit], ["tileDeep", BRAND.tileDeep]] as const) {
      const [r, g, b] = rgb(hex);
      expect(b, `${name} 的蓝通道不是最强的，色相跑偏了`).toBeGreaterThan(g);
      expect(b, `${name} 的蓝通道不是最强的，色相跑偏了`).toBeGreaterThan(r);
      expect(Math.abs(r - g), `${name} 的红绿差得太多，色相歪了`).toBeLessThanOrEqual(12);
    }
    const sum = (hex: string) => rgb(hex).reduce((a, b) => a + b, 0);
    expect(sum(BRAND.tile)).toBeLessThan(sum(BRAND.coral));
    expect(sum(BRAND.tileDeep)).toBeLessThan(sum(BRAND.tile));
    expect(sum(BRAND.tileLit)).toBeGreaterThan(sum(BRAND.tile));
  });
});

// ════════════════════════════════════════════════════════════
// ② 几何：脸得真的在框里、尺寸得真的对
// ════════════════════════════════════════════════════════════
describe("② 脸的几何", () => {
  const box = headBox();

  it("整张脸都待在 64 框里面（超出去会被裁掉）", () => {
    expect(box.minX).toBeGreaterThan(0);
    expect(box.minY).toBeGreaterThan(0);
    expect(box.maxX).toBeLessThan(FACE_SIZE);
    expect(box.maxY).toBeLessThan(FACE_SIZE);
  });

  it("脸占了框的大部分（太小会在图标里显小气）", () => {
    expect(box.width / FACE_SIZE).toBeGreaterThan(0.7);
  });

  it("🔴 眼睛在身体轮廓以内 —— 画到外面就成「脸上飘着两个点」了", () => {
    // 椭圆内点判定
    const inside = (x: number, y: number) => {
      const dx = (x - faceX(FACE.body.cx)) / faceR(FACE.body.rx);
      const dy = (y - faceY(FACE.body.cy)) / faceR(FACE.body.ry);
      return dx * dx + dy * dy <= 1;
    };
    for (const eye of [FACE.eyeL, FACE.eyeR]) {
      expect(inside(faceX(eye.cx), faceY(eye.cy)), "眼睛跑到身体外面了").toBe(true);
    }
    // 眼睛连半径一起也不能越界
    for (const eye of [FACE.eyeL, FACE.eyeR]) {
      const r = eyeRadius() / Math.min(faceR(FACE.body.rx), faceR(FACE.body.ry));
      const x = (faceX(eye.cx) - faceX(FACE.body.cx)) / faceR(FACE.body.rx);
      const y = (faceY(eye.cy) - faceY(FACE.body.cy)) / faceR(FACE.body.ry);
      expect(Math.hypot(x, y) + r, "眼睛有一半探出身体了").toBeLessThan(1);
    }
  });

  it("眼睛够大 —— 16px 下必须还看得见（这是图标唯一的信息量）", () => {
    // 16px 缩完还剩多少像素宽。下限取 1.5 而不是 2：
    // 实测 1.944px 的眼睛在 4×4 降采样后能**完整盖住一个像素**
    // （采出来正好是纯 #232759，见 ⑤ 的采样测试），所以 2 这个门槛是错的。
    const px = (eyeRadius() / FACE_SIZE) * 16 * 2;
    expect(px, `16px 下眼睛直径只有 ${px.toFixed(2)} 像素，糊了`).toBeGreaterThanOrEqual(1.5);
  });

  it("两只眼睛左右对称（不对称会看着别扭）", () => {
    expect(faceX(FACE.eyeL.cx) + faceX(FACE.eyeR.cx)).toBeCloseTo(2 * 32, 1);
    expect(faceY(FACE.eyeL.cy)).toBeCloseTo(faceY(FACE.eyeR.cy), 5);
  });

  it("耳朵有一半探出身体（全在身体里 = 看不出是耳朵）", () => {
    for (const ear of [FACE.earL, FACE.earR]) {
      const dx = (faceX(ear.cx) - faceX(FACE.body.cx)) / faceR(FACE.body.rx);
      const dy = (faceY(ear.cy) - faceY(FACE.body.cy)) / faceR(FACE.body.ry);
      const d = Math.hypot(dx, dy);
      // 圆心到身体中心的归一化距离 ∈ (0.5, 1.3) 才算「搭在边上」
      expect(d, `耳朵圆心离身体中心 ${d.toFixed(2)}（应为「搭在边上」）`).toBeGreaterThan(0.5);
      expect(d).toBeLessThan(1.3);
    }
  });

  it("嘴的线宽有个下限（太细等于没画）", () => {
    expect(mouthStroke()).toBeGreaterThanOrEqual(1.6);
  });

  it("放大系数不能把脸顶出框", () => {
    expect(FACE_SCALE).toBeGreaterThan(1);
    expect(FACE_SCALE).toBeLessThan(1.25);
  });
});

// ════════════════════════════════════════════════════════════
// ③ logo 的取景框
// ════════════════════════════════════════════════════════════
describe("③ 页内 logo 的取景框", () => {
  const vb = logoViewBox();
  const box = headBox();

  it("框比 64 小 —— 不收紧的话 logo 四周会多出一圈空白，跟文字对不齐", () => {
    expect(vb.size).toBeLessThan(FACE_SIZE);
  });

  it("框刚好包住脸（留一点点呼吸感，但不多）", () => {
    expect(vb.x).toBeLessThanOrEqual(box.minX);
    expect(vb.y).toBeLessThanOrEqual(box.minY);
    expect(vb.x + vb.size).toBeGreaterThanOrEqual(box.maxX);
    expect(vb.y + vb.size).toBeGreaterThanOrEqual(box.maxY);
    // 四周留白加起来不超过 15%
    const slackX = vb.size - box.width;
    const slackY = vb.size - box.height;
    expect(slackX / vb.size).toBeLessThan(0.15);
    expect(slackY / vb.size).toBeLessThan(0.15);
  });

  it("是正方形（不是的话窄容器里会被拉扁）", () => {
    expect(vb.size).toBeCloseTo(vb.size, 5);
    // viewBox 声明里宽高同一个数
    expect(logoSvg()).toContain(`viewBox="${vb.x} ${vb.y} ${vb.size} ${vb.size}"`);
  });
});

// ════════════════════════════════════════════════════════════
// ④ 生成的图形本身
// ════════════════════════════════════════════════════════════
describe("④ SVG 产物", () => {
  it("favicon.svg 自带颜色（标签页里没有可继承的颜色，用 currentColor 会变黑）", () => {
    const svg = iconSvg();
    expect(svg).not.toContain("currentColor");
    expect(svg).toContain(BRAND.shine);
    expect(svg).toContain(BRAND.on);
    // 底板渐变两个端点都在
    expect(svg).toContain(BRAND.tileLit);
    expect(svg).toContain(BRAND.tileDeep);
  });

  it("favicon.svg 有 <title> 和无障碍标签（读屏念得出这是什么）", () => {
    const svg = iconSvg();
    expect(svg).toContain("<title>轻待办</title>");
    expect(svg).toContain('aria-label="轻待办"');
  });

  it("favicon.svg 的圆角不是直角（直角在标签页里像个土方块）", () => {
    const svg = iconSvg();
    const m = svg.match(/rx="([\d.]+)"/);
    expect(m, "找不到圆角").toBeTruthy();
    const r = Number((m as RegExpMatchArray)[1]);
    expect(r / FACE_SIZE).toBeCloseTo(BRAND.cornerRatio, 2);
  });

  it("logo.svg 用 currentColor 当脸色（换主题色自动跟着变）", () => {
    expect(logoSvg()).toContain('fill="currentColor"');
  });

  it("脸的图形块数对得上（耳朵×2 + 身体 + 眼睛×2 + 嘴）", () => {
    const shapes = faceShapes({ faceFill: "#fff", featureFill: "#000" });
    expect(shapes.filter((s) => s.kind === "circle")).toHaveLength(4); // 2 耳 + 2 眼
    expect(shapes.filter((s) => s.kind === "ellipse")).toHaveLength(1); // 身体
    expect(shapes.filter((s) => s.kind === "path")).toHaveLength(1); // 嘴
  });

  it("腮红是可选的，且默认不画（小尺寸下就是两块脏点）", () => {
    const without = faceShapes({ faceFill: "#fff", featureFill: "#000" });
    const withBlush = faceShapes({ faceFill: "#fff", featureFill: "#000", withBlush: true });
    expect(withBlush.length).toBe(without.length + 2);
  });
});

// ════════════════════════════════════════════════════════════
// ⑤ 像素产物：小尺寸真的能看 + 打包格式真的合法
// ════════════════════════════════════════════════════════════
describe("⑤ 像素产物", () => {
  /** 取某个归一化坐标的像素 */
  const sample = (px: Buffer, size: number, nx: number, ny: number) => {
    const x = Math.min(size - 1, Math.max(0, Math.floor(nx * size)));
    const y = Math.min(size - 1, Math.max(0, Math.floor(ny * size)));
    const i = (y * size + x) * 4;
    return { r: px[i], g: px[i + 1], b: px[i + 2], a: px[i + 3] };
  };

  it("🔴 16px 下眼睛还在（采到纯墨色）—— 这是「图标还能不能认出是轻宜」的底线", () => {
    const size = 16;
    const px = drawAppIcon(size);
    // 眼睛必须是**深色**：浅脸 + 深眼才是这套图标的读法。
    // 采样点落在眼心，降采样后应当就是纯 #232759（对比度拉满，不是"糊成灰的"）。
    for (const eye of [FACE.eyeL, FACE.eyeR]) {
      const p = sample(px, size, faceX(eye.cx) / FACE_SIZE, faceY(eye.cy) / FACE_SIZE);
      expect(p.a, "眼睛位置是透明的").toBeGreaterThan(200);
      expect(p.r, `16px 下眼睛被糊成了 ${p.r},${p.g},${p.b} —— 应该接近纯墨色`).toBeLessThan(80);
      expect(p.b).toBeLessThan(140);
      // 但也不能整块都黑：脸必须是浅的，否则眼睛就"化"在脸里了
      const cheek = sample(px, size, faceX(FACE.body.cx) / FACE_SIZE, faceY(FACE.body.cy - 0.06) / FACE_SIZE);
      expect(cheek.r, "脸不是浅色，眼睛没有对比可言").toBeGreaterThan(200);
    }
  });

  it("16px 下脸上是浅色、底板是紫色（脸和底分得开）", () => {
    const size = 16;
    const box = headBox();
    const px = drawAppIcon(size);
    // 脸：身体中心往上一点（避开嘴）
    const face = sample(px, size, faceX(FACE.body.cx) / FACE_SIZE, faceY(FACE.body.cy - 0.06) / FACE_SIZE);
    // 底板：取**头顶上方**。⚠️ 不能取左右两侧 —— 脸在 16px 下横向几乎铺满，
    // 0.85 那种位置采到的是脸不是底（这条踩过）。头顶上方是唯一稳妥的底板采样区。
    const tile = sample(px, size, 0.5, (box.minY - 1.5) / FACE_SIZE);
    expect(face.r, "脸上不是浅色").toBeGreaterThan(200);
    expect(tile.a, "头顶上方应该有底板，却是透明的").toBeGreaterThan(200);
    expect(tile.r, "底板不是紫色（红通道偏高）").toBeLessThan(200);
    expect(tile.b, "底板不是紫色（蓝通道应明显高于红）").toBeGreaterThan(tile.r + 30);
  });

  it("托盘是**剪影**：中心不透明，四角透明（不画底板）", () => {
    const size = 32;
    const px = drawTrayIcon(size, "ink");
    const center = sample(px, size, 0.5, 0.5);
    expect(center.a, "托盘中心应该是实心的").toBeGreaterThan(200);
    // 四个角必须透明 —— 有底板的话这里会是不透明的方块
    for (const [nx, ny] of [
      [0.02, 0.02],
      [0.98, 0.02],
      [0.02, 0.98],
      [0.98, 0.98],
    ]) {
      expect(sample(px, size, nx, ny).a, `托盘 ${nx},${ny} 不是透明的（画了底板？）`).toBe(0);
    }
  });

  it("托盘挖了眼睛（剪影里两个洞；不挖就是一颗没脸的圆豆）", () => {
    const size = 32;
    const px = drawTrayIcon(size, "ink");
    const eye = sample(px, size, faceX(FACE.eyeL.cx) / FACE_SIZE, faceY(FACE.eyeL.cy) / FACE_SIZE);
    expect(eye.a, "托盘的眼睛没挖空").toBeLessThan(80);
  });

  it("macOS 版四周留白（苹果网格要求，不留白 Dock 里会比别的 App 大一圈）", () => {
    const size = 64;
    const mac = drawMacIcon(size);
    // 最外圈应该全透明
    for (let i = 0; i < size; i += 1) {
      expect(mac[i * 4 + 3], "macOS 版顶边没有留白").toBe(0);
      expect(mac[((size - 1) * size + i) * 4 + 3], "macOS 版底边没有留白").toBe(0);
    }
    // 而 app 版是铺满的（第一行就该有内容）
    const app = drawAppIcon(size);
    const topRowHasContent = Array.from({ length: size }, (_, i) => app[i * 4 + 3]).some((a) => a > 0);
    expect(topRowHasContent).toBe(true);
  });

  it("iOS 主屏图是直角正方形（苹果自己会切圆角，我们切了就是「圆角套圆角」）", () => {
    const size = 64;
    const square = drawIcon(size, { cornerRatio: 0, blush: false, mouth: true });
    // 直角的话，四个角应该是不透明的
    expect(square[0 * 4 + 3], "四角是透明的，说明还是圆角").toBeGreaterThan(200);
    expect(square[(size - 1) * 4 + 3]).toBeGreaterThan(200);
    expect(square[((size - 1) * size + (size - 1)) * 4 + 3]).toBeGreaterThan(200);
  });

  it("🔴 maskable 版的耳朵必须整个待在 Android 安全圆里（不然圆形裁切会削掉耳朵）", () => {
    // Android 自适应图标只保证"正中直径 80% 的圆"不被裁 ——
    // 所以 maskable 版的脸要缩进这个圆里，底板则铺满（被裁掉也不心疼）。
    const size = 96;
    const px = drawMaskableIcon(size);
    const cx = (size - 1) / 2;
    const cy = (size - 1) / 2;
    const safeR = size * 0.4; // = 直径 80%
    // 脸（含耳朵）是**浅色**的，底板是紫色。扫一遍，所有浅色像素都得在安全圆内。
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const i = (y * size + x) * 4;
        const [r, g, b] = [px[i], px[i + 1], px[i + 2]];
        const isFace = r > 200 && g > 200 && b > 200;
        if (!isFace) continue;
        const d = Math.hypot(x - cx, y - cy);
        expect(d, `(${x},${y}) 的脸露在安全圆外了，圆形裁切会削掉它`).toBeLessThanOrEqual(safeR);
      }
    }
    // 底板必须铺满四角（不能是圆角 —— 那会在裁切后露出底色）
    for (const [x, y] of [[0, 0], [size - 1, 0], [0, size - 1], [size - 1, size - 1]]) {
      expect(px[(y * size + x) * 4 + 3], `maskable 的角 (${x},${y}) 是透明的`).toBeGreaterThan(200);
    }
  });
});

describe("⑤b 打包格式合法（这两种格式没有工具能「帮我们检查」，只能自己验）", () => {
  it("encodePNG 产出的是真 PNG（头 + IHDR 尺寸对）", () => {
    const png = encodePNG(drawAppIcon(32), 32);
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.readUInt32BE(16)).toBe(32);
    expect(png.readUInt32BE(20)).toBe(32);
    expect(png.subarray(png.length - 8).toString("ascii")).toContain("IEND");
  });

  it("encodeICO 的目录项偏移和实际内容一致（错一位 Windows 就装不上）", () => {
    const sizes = [16, 32, 48, 256];
    const ico = encodeICO(sizes.map((size) => ({ size, png: encodePNG(drawAppIcon(size), size) })));
    expect(ico.readUInt16LE(0)).toBe(0); // reserved
    expect(ico.readUInt16LE(2)).toBe(1); // type = icon
    expect(ico.readUInt16LE(4)).toBe(sizes.length);

    let expectedOffset = 6 + sizes.length * 16;
    sizes.forEach((size, i) => {
      const d = ico.subarray(6 + i * 16, 6 + i * 16 + 16);
      // 256 在 ICO 里按约定写成 0
      expect(d[0]).toBe(size >= 256 ? 0 : size);
      expect(d[1]).toBe(size >= 256 ? 0 : size);
      expect(d.readUInt32LE(12), `第 ${i} 项的偏移不对`).toBe(expectedOffset);
      const len = d.readUInt32LE(8);
      const body = ico.subarray(expectedOffset, expectedOffset + len);
      expect(body.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expectedOffset += len;
    });
    expect(expectedOffset, "目录算出来的总长和文件实际长度对不上").toBe(ico.length);
  });

  it("encodeICNS 的每个块长度自洽（错一位 Mac 就装不上）", () => {
    const entries = [
      { type: "icp4", size: 16 },
      { type: "icp5", size: 32 },
      { type: "ic07", size: 128 },
      { type: "ic10", size: 512 },
    ].map((e) => ({ type: e.type, png: encodePNG(drawMacIcon(e.size), e.size) }));
    const icns = encodeICNS(entries);
    expect(icns.subarray(0, 4).toString("ascii")).toBe("icns");
    expect(icns.readUInt32BE(4), "头部声明的总长不对").toBe(icns.length);

    let off = 8;
    for (const e of entries) {
      expect(icns.subarray(off, off + 4).toString("ascii")).toBe(e.type);
      const len = icns.readUInt32BE(off + 4);
      expect(len, `${e.type} 的块长不对`).toBe(e.png.length + 8);
      const body = icns.subarray(off + 8, off + len);
      expect(body.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      off += len;
    }
    expect(off, "块长加起来和文件实际长度对不上").toBe(icns.length);
  });
});

// ════════════════════════════════════════════════════════════
// ⑥ 产物文件真的生成了、且和源码对得上
// ════════════════════════════════════════════════════════════
describe("⑥ 产物文件", () => {
  it("public/ 下的网页图标都在", () => {
    for (const f of [
      "favicon.svg",
      "favicon.ico",
      "apple-touch-icon.png",
      // Android 备用（暂无 manifest，先出图；要加 PWA 时直接引用）
      "icon-192.png",
      "icon-512.png",
      "icon-maskable-192.png",
      "icon-maskable-512.png",
    ]) {
      expect(existsSync(resolve(ROOT, "public", f)), `public/${f} 不存在，跑一下 node scripts/make-brand-assets.mjs`).toBe(true);
    }
  });

  it("favicon.ico 只打包小尺寸（大尺寸交给 svg，别把 20KB 塞进每个页面）", () => {
    // 2026-09-28 调研：一个 ICO 最多三帧就够。
    // 原来放 16~256 七帧 = 20KB，其中 128/256 两帧占 17KB 却几乎用不到。
    //
    // ⚠️ 断言对象是**生成脚本真的会写出去的那个文件**，不是磁盘上的 favicon.ico ——
    //    读磁盘文件的话，把脚本改回七帧、忘了重新生成，测试照样是绿的（实测踩过，
    //    假哨兵）。这里改成照着脚本的 icoSizes 现算一遍。
    const src = readFileSync(resolve(ROOT, "scripts", "make-brand-assets.mjs"), "utf8");
    const m = src.match(/const\s+icoSizes\s*=\s*\[([^\]]*)\]/);
    expect(m, "在 make-brand-assets.mjs 里找不到 icoSizes 了").toBeTruthy();
    const sizes = (m as RegExpMatchArray)[1]
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n));
    expect(sizes, `favicon.ico 打包了 ${sizes.length} 帧，太多了`).toHaveLength(3);
    expect(Math.max(...sizes), "favicon.ico 里不该出现大尺寸（那是桌面版的事）").toBeLessThanOrEqual(64);
    // 真的编码一遍，确认体积也控制住了
    const ico = encodeICO(sizes.map((size) => ({ size, png: encodePNG(drawAppIcon(size), size) })));
    expect(ico.length, `favicon.ico 会变成 ${(ico.length / 1024).toFixed(1)}KB，太大了`).toBeLessThan(8 * 1024);
    // 磁盘上那份也得跟上（不能脚本改了没重新生成）
    const onDisk = readFileSync(resolve(ROOT, "public", "favicon.ico"));
    expect(onDisk.length, "public/favicon.ico 和脚本对不上，重新跑一次 make-brand-assets.mjs").toBe(ico.length);
  });

  it("desktop/build 下的桌面图标都在", () => {
    for (const f of ["icon.ico", "icon.icns", "icon.png"]) {
      expect(
        existsSync(resolve(ROOT, "desktop", "build", f)),
        `desktop/build/${f} 不存在，跑一下 node desktop/scripts/make-icons.mjs`,
      ).toBe(true);
    }
  });

  it("🔴 关键是**同源**：磁盘上的 favicon.svg 和现在算出来的必须一模一样", () => {
    // 这条挡的是「改了 brandSpec 但忘了重新生成」——
    // 那样代码里是新图标、线上还是旧图标，而且**不会有任何报错**。
    const onDisk = readFileSync(resolve(ROOT, "public", "favicon.svg"), "utf8").trim();
    expect(onDisk, "favicon.svg 与 brandSpec 不一致，重新跑一次生成脚本").toBe(iconSvg().trim());
  });

  it("🔴 index.html 不许再是空图标 `data:,`", () => {
    const html = readFileSync(resolve(ROOT, "index.html"), "utf8");
    // 只看真正生效的 <link>，不能整文件搜字符串 ——
    // 上面解释"为什么改掉它"的注释里就写着 data:, 会误报（这条踩过）。
    const links = [...html.matchAll(/<link\b[^>]*>/g)].map((m) => m[0]);
    const empty = links.filter((l) => l.includes('href="data:,"'));
    expect(empty, `index.html 又被改回空图标了：${empty.join(" ")}`).toHaveLength(0);
  });

  it("index.html 同时挂了 svg 和 ico（老浏览器/抓图服务只认 /favicon.ico）", () => {
    const html = readFileSync(resolve(ROOT, "index.html"), "utf8");
    expect(html).toContain('href="/favicon.svg"');
    expect(html).toContain('href="/favicon.ico"');
    expect(html).toContain('href="/apple-touch-icon.png"');
    expect(html).toContain('type="image/svg+xml"');
  });

  it("🔴 界面上不许再有图标库的通用「清单」符号当品牌标记", () => {
    // ListTodo 当「全部」这个导航项的图标是合理的（那里就是「所有任务」的意思），
    // 但**不能**再出现在品牌位（.brand / .gate-brand / .dl-brand）里。
    //
    // ⚠️ 断言必须同时钉住「导入路径」和「真实用法的尖括号」——
    //    只查字符串 "BrandMark" 是假的哨兵：把组件重命名成 ListTodoBrand
    //    照样包含这个子串，测试还是绿的（这条踩过，实测确认过）。
    for (const file of ["Sidebar.tsx", "LoginGate.tsx", "DownloadPage.tsx"]) {
      const src = readFileSync(resolve(ROOT, "src", "components", file), "utf8");
      expect(src, `${file} 没导入品牌组件`).toContain('from "./BrandMark"');
      expect(src, `${file} 导入了品牌组件但没用上`).toMatch(/<BrandMark[\s/>]/);
      // 反向：品牌位不许再出现图标库那个通用清单符号
      expect(src, `${file} 又用回了图标库的清单符号`).not.toContain("<ListTodo");
    }
  });

  it("🔴 删掉的两个图标壳样式不许复活（会和新组件打架）", () => {
    const css = readFileSync(resolve(ROOT, "src", "styles.css"), "utf8");
    expect(css.includes(".gate-brand-icon")).toBe(false);
    expect(css.includes(".dl-brand-icon")).toBe(false);
  });

  it("🔴 改 brandSpec 之后，桌面版的图标也真的重新生成过（别只更新网页那半边）", () => {
    // 同一个坑的桌面版：桌面图标（.ico/.icns/托盘）是从 brandSpec 现算的，
    // 改了配色忘了重跑 make-icons.mjs → 代码里是新图标、装机包里还是旧的，**不报任何错**。
    // 网页那边用「磁盘文件和算出来的完全一致」来盯；桌面这边没法直接比像素，
    // 就用「产出文件的字节数必须等于现在算出来的字节数」—— 换了颜色，体积一定会变。
    const icoSrc = readFileSync(resolve(ROOT, "desktop", "scripts", "make-icons.mjs"), "utf8");
    const m = icoSrc.match(/const\s+icoSizes\s*=\s*\[([^\]]*)\]/);
    expect(m, "desktop/scripts/make-icons.mjs 里找不到 icoSizes").toBeTruthy();
    const sizes = (m as RegExpMatchArray)[1]
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n));
    const expected = encodeICO(sizes.map((size) => ({ size, png: encodePNG(drawAppIcon(size), size) })));
    const onDisk = readFileSync(resolve(ROOT, "desktop", "build", "icon.ico"));
    expect(
      onDisk.length,
      `desktop/build/icon.ico 是 ${onDisk.length} 字节，现在算出来是 ${expected.length} —— ` +
        `改了图标规格但没重跑 node desktop/scripts/make-icons.mjs`,
    ).toBe(expected.length);
  });

  it("构建机上的图标脚本不依赖任何第三方包（GitHub Actions 上用 Node 20 跑）", () => {
    // 生成图标的两个脚本 + 共享规格，都不许 import 外部依赖。
    // 原因：构建机只 npm install 了 desktop/，根目录的 sharp 之类**不一定在**。
    for (const f of ["scripts/make-icon.mjs", "scripts/make-brand-assets.mjs", "desktop/scripts/make-icons.mjs", "shared/brandSpec.mjs"]) {
      const src = readFileSync(resolve(ROOT, f), "utf8");
      // 同时匹配 `import x from "y"` 和裸 `import "y"`
      const specs = [...src.matchAll(/\bfrom\s+["']([^"']+)["']|^\s*import\s+["']([^"']+)["']/gm)]
        .map((m) => m[1] || m[2]);
      // 兜底：连 `await import("sharp")` 这种动态导入也拦下
      const dynamic = [...src.matchAll(/\bimport\s*\(\s*["']([^"']+)["']/g)].map((m) => m[1]);
      const all = [...specs, ...dynamic];
      // ⚠️ brandSpec.mjs 是**故意**零 import 的（下面的用例专门锁它），
      //    所以这里不能要求「至少扫到一个」——只有真会 import 的脚本才需要那个防呆。
      if (f !== "shared/brandSpec.mjs") {
        expect(all.length, `${f} 一个 import 都没扫到，上面的正则可能已经失效了`).toBeGreaterThan(0);
      }
      for (const spec of all) {
        const isNodeBuiltin = spec.startsWith("node:");
        const isLocal = spec.startsWith(".") || spec.startsWith("/");
        expect(isNodeBuiltin || isLocal, `${f} 引了外部包 ${spec} —— 构建机上不一定装得上`).toBe(true);
      }
    }
  });

  it("共享规格是纯数据，不 import 任何东西（Node 和浏览器都要用它）", () => {
    const src = readFileSync(resolve(ROOT, "shared", "brandSpec.mjs"), "utf8");
    expect(src.includes("from \"") || src.includes("from '"), "brandSpec.mjs 不该 import 任何东西").toBe(false);
    expect(src.includes("require(")).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════
// ⑧ 页内那个 React 组件真的能渲染
// ════════════════════════════════════════════════════════════
describe("⑧ BrandMark 组件", () => {
  it("tile 变体渲染出底板渐变 + 脸", () => {
    const html = renderToStaticMarkup(<BrandMark size={38} variant="tile" label="轻待办" />);
    expect(html).toContain("linearGradient");
    expect(html).toContain('aria-label="轻待办"');
    expect(html).toMatch(/<circle/);
  });

  it("🔴 同一页两个 BrandMark 的渐变 id 不能撞（撞了后面那个的渐变会失效）", () => {
    // 这是真会发生的：登录页 + 侧边栏同屏，写死 id 的话浏览器只认第一个。
    const html = renderToStaticMarkup(
      <div>
        <BrandMark size={20} variant="tile" />
        <BrandMark size={30} variant="tile" />
      </div>,
    );
    const ids = [...html.matchAll(/id="(ltgrad[^"]*)"/g)].map((m) => m[1]);
    expect(ids.length, "没生成两个渐变").toBe(2);
    expect(new Set(ids).size, `两个渐变 id 撞了：${ids.join(" / ")}`).toBe(2);
  });

  it("face 变体用 currentColor 当脸色（换主题色 logo 自动跟着变）", () => {
    const html = renderToStaticMarkup(<BrandMark size={20} variant="face" face="currentColor" />);
    expect(html).toContain("currentColor");
  });
});

// ════════════════════════════════════════════════════════════
// ⑦ 类型声明和运行时导出对得上
// ════════════════════════════════════════════════════════════
describe("⑦ .mjs 和 .d.mts 不许跑偏", () => {
  it("运行时导出的每个名字，类型声明里都有", () => {
    // ⚠️ 这个文件是 .mjs（构建机的 Node 20 读不了 TS），但前端是 TS 项目，
    //    所以另配了一份 .d.mts。两份必须同步 —— 少了哪个都会在 tsc 时炸。
    const dts = readFileSync(resolve(ROOT, "shared", "brandSpec.d.mts"), "utf8");
    const runtimeExports = [
      "BRAND",
      "FACE",
      "FACE_SIZE",
      "FACE_SCALE",
      "faceX",
      "faceY",
      "faceR",
      "eyeRadius",
      "mouthStroke",
      "headBox",
      "logoViewBox",
      "pixelScale",
      "faceShapes",
    ];
    for (const name of runtimeExports) {
      expect(dts.includes(name), `shared/brandSpec.d.mts 缺了 ${name} 的声明`).toBe(true);
    }
  });

  it("声明文件里列的类型别名都是真的存在（别声明了个没人用的）", () => {
    const dts = readFileSync(resolve(ROOT, "shared", "brandSpec.d.mts"), "utf8");
    for (const t of ["BrandPalette", "FaceSpec", "FaceShape", "LogoViewBox", "PixelScale"]) {
      // ⚠️ 不能写成 expect(a) || expect(b) —— expect() 断言失败会**直接抛**，
      //    右边那半永远轮不到执行，等于只检查了第一种写法。
      const declared = dts.includes(`export interface ${t}`) || dts.includes(`export type ${t}`);
      expect(declared, `shared/brandSpec.d.mts 里找不到 ${t} 的声明`).toBe(true);
    }
  });
});
