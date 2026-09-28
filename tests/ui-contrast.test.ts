import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ACCENT_MAP } from "../src/lib/theme";

/**
 * 轻宜「考试系统」· 第 31 科：配色不许再"发灰看不清"
 *
 * 🔴 起因（2026-09-28，UI 体检）：
 *   四套主题色都是**刻意压低饱和度**的浅色，可按钮上一直写的是**白字**：
 *     紫 #8B91E8 + 白 = 2.87 : 1
 *     青绿 #7A9E8E + 白 = 2.95 : 1
 *   无障碍及格线是 4.5 : 1。也就是说「新建任务」「保存」这些**最该看清的按钮**，
 *   恰恰是全站最糊的地方。
 *
 * 修法：**底色一个像素不动**（用户挑的就是这套色），只把写在强调色上的字换成深色。
 *   深色字 = 4.62 ~ 7.73 : 1，全部及格。
 *
 * ⚠️ 这里用的是真正的 WCAG 相对亮度公式，不是"看着差不多"。
 *    以后谁再想调 ACCENT_MAP 里的颜色，这个测试会当场拦住 —— 这正是它存在的意义。
 */

// ---------- WCAG 2.x 对比度 ----------
function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const ACCENTS = Object.keys(ACCENT_MAP) as (keyof typeof ACCENT_MAP)[];
const WHITE = "#FFFFFF";

// ────────────────────────────────────────────────────────────
// ① 核心：强调色底上的字，必须过 4.5
// ────────────────────────────────────────────────────────────
describe("① 强调色底上的文字对比度", () => {
  it("【本次修复】四套主题全部 ≥ 4.5（原来紫 2.87 / 青绿 2.95，全不及格）", () => {
    for (const key of ACCENTS) {
      const a = ACCENT_MAP[key];
      const ratio = contrast(a.coral, a.on);
      expect(ratio, `${key} 主题：${a.on} 写在 ${a.coral} 上只有 ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });

  it("🔴 回归哨兵：白字写在浅色主题上**一定不及格**（防止有人改回去）", () => {
    for (const key of ACCENTS) {
      const a = ACCENT_MAP[key];
      // 石墨主题本身就很深（白字 7.73），它的 on 就该是白色 —— 不算数
      if (a.on.toUpperCase() === WHITE) {
        expect(a.coral, `${key} 用了白字，那它的底色必须真的很深`).toBeTruthy();
        expect(contrast(a.coral, WHITE), `${key} 用白字但底色不够深`).toBeGreaterThanOrEqual(4.5);
        continue;
      }
      // 其余三套都是浅色底 —— 白字必然不及格，这就是当初的毛病
      const ratio = contrast(a.coral, WHITE);
      expect(ratio, `${key} 主题白字对比度 ${ratio.toFixed(2)}，不该及格`).toBeLessThan(4.5);
    }
  });

  it("悬停加深色也要够深 —— 但不能深到把上面的字糊掉（≥ 3.5）", () => {
    for (const key of ACCENTS) {
      const a = ACCENT_MAP[key];
      const ratio = contrast(a.hover, a.on);
      expect(ratio, `${key} 主题悬停态只有 ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3.5);
    }
  });

  it("悬停色确实比底色深（否则就是「悬停没反应」，用户以为按钮坏了）", () => {
    for (const key of ACCENTS) {
      const a = ACCENT_MAP[key];
      expect(luminance(a.hover), `${key} 主题悬停色不比底色深`).toBeLessThan(luminance(a.coral));
    }
  });
});

// ────────────────────────────────────────────────────────────
// ② 结构：字段齐全，且没有"把旧值抄错"
// ────────────────────────────────────────────────────────────
describe("② ACCENT_MAP 结构", () => {
  it("每套色都齐 on / hover / ink / coral / soft 五个字段", () => {
    for (const key of ACCENTS) {
      const a = ACCENT_MAP[key];
      for (const field of ["coral", "soft", "ink", "on", "hover"] as const) {
        expect(a[field], `${key}.${field} 缺失`).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    }
  });

  it("--accent-ink（强调色深字）在**它真正被用的两种底**上都 ≥ 4.5", () => {
    // 实际用法只有两种，别拿"白底"想当然：
    //   A) 4 处是 accent-soft 浅底（导航标 / 卡片图标 / 说明条）← 主要战场
    //   B) 1 处是白底图标
    // 原来紫 3.39、青绿 3.56，全在这个浅底上糊掉。
    for (const key of ACCENTS) {
      const a = ACCENT_MAP[key];
      const onSoft = contrast(a.soft, a.ink);
      const onWhite = contrast(WHITE, a.ink);
      expect(onSoft, `${key}：ink ${a.ink} 写在 soft ${a.soft} 上只有 ${onSoft.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      expect(onWhite, `${key}：ink ${a.ink} 写白底上只有 ${onWhite.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("ink 确实比 coral 深（它叫「深字色」就得真的深）", () => {
    for (const key of ACCENTS) {
      const a = ACCENT_MAP[key];
      expect(luminance(a.ink), `${key} 的 ink 不比 coral 深`).toBeLessThan(luminance(a.coral));
    }
  });
});

// ────────────────────────────────────────────────────────────
// ③ 一致性：三处定义不许跑偏
//     index.html 的内联脚本是为了"首屏不闪"而手抄的一份，最容易忘同步。
// ────────────────────────────────────────────────────────────
describe("③ 三处定义必须一致（theme.ts / index.html / styles.css）", () => {
  const html = readFileSync(resolve(__dirname, "../index.html"), "utf8");
  const css = readFileSync(resolve(__dirname, "../src/styles.css"), "utf8");

  it("index.html 内联脚本里的每套色，都和 ACCENT_MAP 逐字段相同", () => {
    for (const key of ACCENTS) {
      const a = ACCENT_MAP[key];
      // 内联脚本里是 `purple: { coral: "#8B91E8", ... }` 这种单行写法
      const line = html.split("\n").find((l) => new RegExp(`\\b${key}:\\s*\\{`).test(l));
      expect(line, `index.html 里找不到 ${key} 的定义`).toBeTruthy();
      for (const field of ["coral", "soft", "ink", "on", "hover"] as const) {
        const m = (line as string).match(new RegExp(`${field}:\\s*"(#[0-9A-Fa-f]{6})"`));
        expect(m, `index.html 的 ${key}.${field} 没写`).toBeTruthy();
        expect(
          (m as RegExpMatchArray)[1].toUpperCase(),
          `index.html 的 ${key}.${field} 和 theme.ts 不一致（会导致首屏闪一下旧色）`,
        ).toBe(a[field].toUpperCase());
      }
    }
  });

  it("index.html 内联脚本确实把这几个变量写进了根元素", () => {
    for (const v of ["--on-accent", "--accent-hover", "--accent-ink"]) {
      expect(html.includes(`setProperty("${v}"`), `index.html 没设置 ${v}`).toBe(true);
    }
  });

  it("🔴 styles.css 里再也不许出现「白字 + 强调色底」的搭配", () => {
    // 允许出现在别的上下文（比如深色底），只抓 background:var(--accent) 后面跟的 color:#fff
    const bad = css
      .split(/\n(?=[.#\[a-zA-Z])/)
      .filter((block) => /background:\s*var\(--accent\)\s*;/.test(block) && /color:\s*#fff\s*;/i.test(block));
    expect(bad.length, `还有 ${bad.length} 处白字写在强调色上：\n${bad.join("\n---\n")}`).toBe(0);
  });

  it("🔴 styles.css 里不许再有写死的蓝色 #1d4ed8（点一下按钮变蓝那种）", () => {
    expect(css.includes("#1d4ed8")).toBe(false);
  });

  it("🔴 --accent 只能当**填充色**，不许再当文字色（它当文字只有 2.87:1）", () => {
    // 强调色是浅色，是给"背景块"用的；要写字得用同色系的深色 --accent-ink。
    // 这条挡的是"顺手写回 color: var(--accent)"导致文字又糊掉。
    // ⚠️ 选择器部分 [^{}] 和 [^@\s}] 都排除 `}`，否则正则可能横跨两个规则块、
    //    把真正的违规"吞"进上一条里（旧版本 47 处违规就是这么漏掉的）。
    //    这条规则已用改动前的样式表实测过：能抓到 47 条，改完 0 条。
    const bad = [...css.matchAll(/^[^@\s}][^{}]*\{[^}]*color:\s*var\(--accent\)\s*;[^}]*\}/gm)].map((m) =>
      m[0].split("{")[0].trim(),
    );
    expect(bad, `这些规则又把 --accent 当文字色了，应改用 --accent-ink：\n${bad.join("\n")}`).toEqual([]);
  });

  it("🔴 用到的强调色变量都必须有定义（--accent-ink 以前就是没定义，当背景用时透明）", () => {
    const used = new Set<string>();
    for (const m of css.matchAll(/var\((--[a-z0-9-]+)/g)) used.add(m[1]);
    // 有兜底值的变量允许不定义
    const withFallback = new Set<string>();
    for (const m of css.matchAll(/var\((--[a-z0-9-]+)\s*,/g)) withFallback.add(m[1]);
    const defined = new Set<string>();
    for (const m of css.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)) defined.add(m[1]);

    const missing = [...used].filter((v) => !defined.has(v) && !withFallback.has(v));
    expect(missing, `这些变量用了却完全没定义：${missing.join(", ")}`).toEqual([]);

    // --accent-ink 必须真的被定义（它是被当**背景**用的，没兜底 = 透明）
    expect(defined.has("--accent-ink"), "--accent-ink 必须定义").toBe(true);
    expect(defined.has("--on-accent"), "--on-accent 必须定义").toBe(true);
    expect(defined.has("--accent-hover"), "--accent-hover 必须定义").toBe(true);
  });
});

// ────────────────────────────────────────────────────────────
// ④ 全局可访问性：焦点圈 + 减少动态效果
// ────────────────────────────────────────────────────────────
describe("④ 全局可访问性样式", () => {
  const css = readFileSync(resolve(__dirname, "../src/styles.css"), "utf8");

  it("有全局的 :focus-visible 焦点圈（键盘用户才看得见自己在哪）", () => {
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent\)/);
  });

  it("焦点圈用 :where() 压优先级，不许盖掉组件自己写的焦点样式", () => {
    const line = css.split("\n").find((l) => l.includes(":focus-visible") && l.includes("outline") === false && l.includes(":where"));
    expect(line, "全局焦点圈没有用 :where() 包裹").toBeTruthy();
  });

  it("有全局的 prefers-reduced-motion 兜底（不能只盖住零散几处动画）", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\*,[\s\S]{0,400}animation-duration:\s*0\.001ms !important/);
  });
});
