/**
 * 轻待办 · 品牌图形规格（**唯一出处**）
 *
 * ─────────────────────────────────────────────────────────────
 * 这个文件回答一个问题：轻宜长什么样、用什么颜色。
 * ─────────────────────────────────────────────────────────────
 * 它被三处引用，所以改了这里 = 全套一起变：
 *   · `scripts/make-icon.mjs`            —— 用像素算成 PNG/ICO/ICNS（Node 内置，零依赖）
 *   · `src/components/BrandMark.tsx`     —— 页内那个小 logo（React，跟随文字色）
 *   · `tests/brand-icon.test.ts`         —— 锁住"几何/配色/各处引用"不许跑偏
 *
 * ⚠️ **不要**把颜色写在这份文件之外的地方。以前就是各画各的：
 *    网页 favicon 是空的、桌面图标是茶绿对勾、侧边栏是个通用图标库的
 *    待办清单符号 —— 同一个产品四张脸。现在只有这一份。
 *
 * ─────────────────────────────────────────────────────────────
 * 关于"纯数据、不含依赖"
 * ─────────────────────────────────────────────────────────────
 * 这个文件**不许 import 任何东西**（不引 node:、不引 react）。
 * 因为 Node 脚本和浏览器端 React 都要用它，任何一边特有的依赖都会把另一边搞崩。
 */

// ═══════════════════════════════════════════════════════════
// 一、品牌色
// ═══════════════════════════════════════════════════════════
//
// ⚠️ 这几个值和 `src/lib/theme.ts` 的 ACCENT_MAP.purple 是一套的，
//    有测试逐字段盯着（改一边不改另一边会当场红）。
//    它们不是随手调的 —— 是按"能看清"的规矩配的：
//    深紫写在品牌紫上 = 4.62:1（无障碍及格线 4.5）。
export const BRAND = {
  /** 品牌主色（= --accent，也是 ACCENT_MAP.purple.coral） */
  coral: "#8B91E8",
  /**
   * 图标**底板**专用色：是 coral 压深 6% 的近亲，不是另一个颜色。
   *
   * 为什么不用 coral 本身（2026-09-28 图标调研实测）：
   *   coral #8B91E8 和纸白脸的对比度只有 **2.87:1** —— 低于图形元素常用的 3:1 底线，
   *   而且底板还带渐变，亮的那头（lit #A3A8F1）只有 **2.23:1**。
   *   换上压深版：底色 **3.28:1**、渐变亮端 **2.60:1**、暗端 **4.01:1**，整条渐变都过线。
   *
   * 调研原话是"品牌色本身不用改，只是图标底色微调" —— 这里照做了：
   * 界面上的按钮、文字、--accent 全都还是 coral，只有图标底板走这一套。
   * 色相不变，肉眼几乎看不出差别，但那 0.4 个点的对比度是实打实的。
   */
  tile: "#7F86E2",
  /** 底板亮部（左上打光）—— tile 的同族提亮 */
  tileLit: "#949AEB",
  /** 底板暗部（右下压深）—— tile 的同族压深 */
  tileDeep: "#6F76D6",
  /** 底板亮部（左上打光） */
  lit: "#A3A8F1",
  /** 底板暗部（右下压深）—— 和 --accent-hover 同族 */
  deep: "#7A80DC",
  /** 画在品牌紫上的深色（= --on-accent） */
  on: "#232759",
  /** 浅底（= --accent-soft） */
  soft: "#E7E8FB",
  /** 脸的纸白 / 高光 */
  shine: "#FFFFFF",
  /** 腮红 */
  blush: "#FF7B7B",
  /**
   * 底板圆角占边长的比例（0.225 是 macOS 那套"超椭圆"的观感）。
   * 唯一例外是 iOS 主屏图标要**直角**（苹果自己切圆角），见 make-brand-assets.mjs。
   */
  cornerRatio: 0.225,
  /**
   * 网页版 logo 渐变的 DOM id。
   *
   * ⚠️ 页内可能同时出现多个 `<BrandMark>`，如果各自写死同一个 id，
   *    **同一个页面里会有重复 id** —— 浏览器只会认第一个，
   *    后面的渐变会错乱（或者干脆不显示）。所以每个实例要自己的 id，
   *    这个字符串是拼 id 用的前缀。
   */
  gradientIdPrefix: "ltgrad",
};

// ═══════════════════════════════════════════════════════════
// 二、轻宜的脸（64×64 viewBox，已归一化到 0~1）
// ═══════════════════════════════════════════════════════════
//
// 原始定义在 `src/components/MascotAvatar.tsx` 的 viewBox="0 0 64 64" 里，
// 下面的数字就是那些坐标 **除以 64**。所以图标画出来的就是轻宜本人。
export const FACE_SIZE = 64;

/**
 * 脸在 64 框里的放大系数。
 *
 * 原 viewBox 四周留白偏多（身体只占 24/64 半径），直接放进方形图标里显得小气。
 * 1.08 是拿多档尺寸实测比出来的：再大耳朵会顶到图标边、再小脸不够抓眼。
 */
export const FACE_SCALE = 1.08;

export const FACE = {
  body: { cx: 32 / 64, cy: 34 / 64, rx: 24 / 64, ry: 21 / 64 },
  /**
   * 两只小耳朵。
   *
   * ⚠️ App 里那两只是 `cx=12/52, cy=20, r=3.4, opacity=0.25` —— 它们**整个都在
   * 身体轮廓以内**，靠"半透明浅一块"来读，是当着色用的。
   * 直接搬进图标就废了：32px 下只露出 3 个像素，等于没有（实测过，就是两个小疙瘩）。
   *
   * 所以这里**沿身体椭圆挪到斜上方的边缘上**（圆心正好落在椭圆上，外侧一半探出身体），
   * 让耳朵有一半在身体外面 —— 这样才是"耳朵"，而不是身体上的一块斑。
   * 半径也放大到 5，让它在 16px 下也活得下来。
   */
  earL: { cx: 22.5 / 64, cy: 15 / 64, r: 5 / 64 },
  earR: { cx: 41.5 / 64, cy: 15 / 64, r: 5 / 64 },
  /**
   * 眼睛。App 里 rx/ry 是 2.4（还会随情绪变），这里**放大到 1.5 倍**：
   * 两个点就是整张图标唯一的信息量，小尺寸下必须够大。
   */
  eyeL: { cx: 23 / 64, cy: 29 / 64, r: 2.4 / 64, scale: 1.5 },
  eyeR: { cx: 41 / 64, cy: 29 / 64, r: 2.4 / 64, scale: 1.5 },
  /**
   * 嘴：`M27 38 q5 4 10 0` —— 二次贝塞尔。
   * 注意 `q` 是**相对**控制点：38 + 4 = 42，所以控制点落在 (32, 42)。
   */
  mouth: {
    x0: 27 / 64,
    y0: 38 / 64,
    cx: 32 / 64,
    cy: 42 / 64,
    x1: 37 / 64,
    y1: 38 / 64,
    stroke: 0.02, // 线宽（相对 64 框）
  },
  cheekL: { cx: 17 / 64, cy: 36 / 64, rx: 3 / 64, ry: 1.8 / 64 },
  cheekR: { cx: 47 / 64, cy: 36 / 64, rx: 3 / 64, ry: 1.8 / 64 },
};

// ═══════════════════════════════════════════════════════════
// 三、坐标换算（两份渲染器共用同一套，保证像素图和 SVG 长得一样）
// ═══════════════════════════════════════════════════════════

/** 归一化坐标 → 64 框内坐标（含放大） */
export const faceX = (v) => 32 + (v * FACE_SIZE - 32) * FACE_SCALE;
export const faceY = (v) => 32 + (v * FACE_SIZE - 32) * FACE_SCALE;
export const faceR = (v) => v * FACE_SIZE * FACE_SCALE;

/** 眼睛的实际半径（含放大系数） */
export const eyeRadius = () => faceR(FACE.eyeL.r) * FACE.eyeL.scale;

/** 嘴的线宽（64 框内），带一个下限免得细到看不见 */
export const mouthStroke = () => Math.max(1.6, faceR(FACE.mouth.stroke));

/** 头的包围盒（64 框内）—— 耳朵和身体的并集 */
export function headBox() {
  const b = FACE.body;
  const xs = [];
  const ys = [];

  const addEllipse = (cx, cy, rx, ry) => {
    xs.push(faceX(cx) - faceR(rx), faceX(cx) + faceR(rx));
    ys.push(faceY(cy) - faceR(ry), faceY(cy) + faceR(ry));
  };
  const addCircle = (cx, cy, r) => {
    xs.push(faceX(cx) - faceR(r), faceX(cx) + faceR(r));
    ys.push(faceY(cy) - faceR(r), faceY(cy) + faceR(r));
  };

  addEllipse(b.cx, b.cy, b.rx, b.ry);
  addCircle(FACE.earL.cx, FACE.earL.cy, FACE.earL.r);
  addCircle(FACE.earR.cx, FACE.earR.cy, FACE.earR.r);

  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  };
}

/**
 * 页内 logo 的 viewBox（不带底板、只有头）。
 *
 * 为什么要**另算一个框**而不是直接用 `0 0 64 64`：
 *   脸只占 64 框中间那一块，四周全是空白 —— 直接当 logo 用，
 *   图标周围会凭空多出一圈内边距，跟旁边的文字对不齐（实测过，看着像"缩进去了"）。
 *   这里把框收紧到头的实际范围（再留 4% 呼吸感），logo 就跟字号一样大。
 *
 * 头和框都是居中的，所以收紧框**不会**让脸的位置发生任何变化。
 */
export function logoViewBox() {
  const b = headBox();
  const pad = Math.max(b.width, b.height) * 0.04;
  const x = b.minX - pad;
  const y = b.minY - pad;
  const w = b.width + pad * 2;
  const h = b.height + pad * 2;
  // 补成正方形，免得窄屏下被拉扁
  const side = Math.max(w, h);
  return {
    x: Number((x - (side - w) / 2).toFixed(2)),
    y: Number((y - (side - h) / 2).toFixed(2)),
    size: Number(side.toFixed(2)),
  };
}

/**
 * 页内 logo 的完整几何（给 React 组件和生成脚本共用）。
 *
 * `faceFill` / `featureFill` 由调用方决定：
 *   页内 logo → "currentColor" + "var(--on-accent)"，跟着主题色变
 *   favicon   → 写死的白 + 深紫（浏览器标签页没有继承来源，currentColor 无意义）
 */
export function faceShapes({ faceFill, featureFill, blushFill = BRAND.blush, withEars = true, withMouth = true, withBlush = false }) {
  const f = (n) => Number(n.toFixed(2));
  const shapes = [];

  if (withEars) {
    for (const ear of [FACE.earL, FACE.earR]) {
      shapes.push({
        kind: "circle",
        cx: f(faceX(ear.cx)),
        cy: f(faceY(ear.cy)),
        r: f(faceR(ear.r)),
        fill: faceFill,
      });
    }
  }

  const b = FACE.body;
  shapes.push({
    kind: "ellipse",
    cx: f(faceX(b.cx)),
    cy: f(faceY(b.cy)),
    rx: f(faceR(b.rx)),
    ry: f(faceR(b.ry)),
    fill: faceFill,
  });

  if (withBlush) {
    for (const c of [FACE.cheekL, FACE.cheekR]) {
      shapes.push({
        kind: "ellipse",
        cx: f(faceX(c.cx)),
        cy: f(faceY(c.cy)),
        rx: f(faceR(c.rx)),
        ry: f(faceR(c.ry)),
        fill: blushFill,
        opacity: 0.75,
      });
    }
  }

  for (const eye of [FACE.eyeL, FACE.eyeR]) {
    shapes.push({
      kind: "circle",
      cx: f(faceX(eye.cx)),
      cy: f(faceY(eye.cy)),
      r: f(eyeRadius()),
      fill: featureFill,
    });
  }

  if (withMouth) {
    const m = FACE.mouth;
    shapes.push({
      kind: "path",
      d:
        `M${f(faceX(m.x0))} ${f(faceY(m.y0))} ` +
        `Q${f(faceX(m.cx))} ${f(faceY(m.cy))} ${f(faceX(m.x1))} ${f(faceY(m.y1))}`,
      fill: "none",
      stroke: featureFill,
      strokeWidth: f(mouthStroke()),
    });
  }

  return shapes;
}

// ═══════════════════════════════════════════════════════════
// 四、像素渲染器要用的那一份（把 64 框套到画布上）
// ═══════════════════════════════════════════════════════════
//
// ⚠️ 这里绕了一个弯，但必须绕 —— 否则像素图和 SVG 会对不上：
//
//   直觉写法：把"64 框"直接当成画布大小 → `gx(v) = cx + (v*64 - 32) * K`
//   但画布的**单位不是 64**，是渲染分辨率（比如 32px × 4 倍超采样 = 128）。
//   而且底板还带 padding（macOS 版要留白）。
//
//   所以要先算出"64 框实际摊在画布上的边长"（`boxSide`），
//   再让 k = boxSide / 64 —— 这样两边算出来的**是同一个东西**，只是单位不同。
//
//   `boxSide` 的来历：脸的宽度 = boxSide × FACE_SCALE，而脸在 64 框里
//   宽度是 `headBox().width`（56.7 个单位）→ boxSide = headBox().width × FACE_SCALE。
//   也就是说 **FACE_SCALE 决定了"脸占画布多大"**，数学上是唯一确定的。
export const HEAD_BOX = headBox();

/**
 * @param {number} side   画布上留给脸的正方形边长（像素）
 * @param {number} cx     画布中心 x
 * @param {number} cy     画布中心 y
 */
export function pixelScale(side, cx, cy) {
  const boxSide = side * FACE_SCALE;
  const k = boxSide / FACE_SIZE; // 64 框的 1 个单位 = 画布上 k 个像素
  return {
    bx: (v) => cx + (v * FACE_SIZE - 32) * k,
    by: (v) => cy + (v * FACE_SIZE - 32) * k,
    br: (v) => v * FACE_SIZE * k,
    /** 直接把"64 框里的单位数"换成像素（给线宽、eyeRadius() 这类用） */
    bu: (units) => units * k,
    boxSide,
    k,
  };
}
