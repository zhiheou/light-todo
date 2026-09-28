// 主题外观偏好：localStorage 持久化 + 应用到 document.documentElement 的 CSS 变量。
// 组件零改动 —— 主题只改 CSS 变量（--coral/--coral-soft/--coral-ink/--font-app/--app-font-scale/card-style）。
import type { ThemePrefs } from "../types";

const THEME_KEY = "lighttodo:theme:v1";

// 强调色 token：与 Dadao 对齐的 4 套低饱和色
//
// v3.9.25 重排了三个字段，起因是一次 UI 体检：
//
//  `on`     —— 写在强调色**实底**上的文字色。
//              🔴 原来这里是白字，而这四套色都刻意压低了饱和度、偏浅，
//              白字写上去只有 2.87 ~ 3.51（紫 2.87、青绿 2.95），
//              远低于无障碍线 4.5 —— 也就是说「新建任务」「保存」这些
//              **最该看清的按钮，恰恰是全站最糊的地方**。换深色字后 4.62 ~ 7.73。
//
//  `ink`    —— 强调色**浅底**（soft）上的文字/图标色。
//              🔴 原来紫 3.39、青绿 3.56，一样不及格。
//              按同色相往深里压到 5.1 左右（紫 #575D91 等）。
//
//  `hover`  —— 悬停时加深一点点（8%）。注意**不能**直接拿 ink 当悬停底：
//              ink 太深，压上去底上的字反而掉到 3.4，看着"越悬停越糊"。
//
// ⚠️ 底色 coral 一个像素没动 —— 用户挑的就是这套色，改的只是"压在它上面的东西"。
//    这四条不变量由 tests/ui-contrast.test.ts 用真正的 WCAG 公式守着。
export const ACCENT_MAP: Record<
  ThemePrefs["accent"],
  { coral: string; soft: string; ink: string; on: string; hover: string }
> = {
  purple: { coral: "#8B91E8", soft: "#E7E8FB", ink: "#575D91", on: "#232759", hover: "#8085D5" },
  graphite: { coral: "#52525B", soft: "#EEEEF0", ink: "#3F3F46", on: "#FFFFFF", hover: "#4B4B54" },
  mistBlue: { coral: "#6B8CAE", soft: "#E8EEF4", ink: "#4E667E", on: "#0F2233", hover: "#6281A0" },
  sageGreen: { coral: "#7A9E8E", soft: "#EAF0EC", ink: "#526A61", on: "#12271C", hover: "#709183" },
};

// 字体栈：与 Dadao 对齐的 4 套
const FONT_MAP: Record<ThemePrefs["font"], string> = {
  kai: "'LXGW WenKai', 'LXGW WenKai TC', 'LXGW WenKai Screen', 'PingFang SC', 'Microsoft YaHei', sans-serif",
  sans: "'PingFang SC', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, 'Microsoft YaHei', sans-serif",
  song: "'Songti SC', 'STSong', 'SimSun', 'Noto Serif SC', serif",
  noto: "'Noto Sans SC', 'PingFang SC', -apple-system, BlinkMacSystemFont, sans-serif",
};

// 字号缩放系数
const SIZE_MAP: Record<ThemePrefs["fontSize"], string> = {
  small: "0.9",
  standard: "1",
  large: "1.15",
  extraLarge: "1.3",
};

export const THEME_DEFAULTS: ThemePrefs = {
  accent: "purple",
  font: "kai",
  cardStyle: "classic",
  fontSize: "standard",
};

export function loadThemePrefs(): ThemePrefs {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (!raw) return THEME_DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<ThemePrefs>;
    return {
      accent:
        parsed.accent && parsed.accent in ACCENT_MAP
          ? (parsed.accent as ThemePrefs["accent"])
          : THEME_DEFAULTS.accent,
      font:
        parsed.font && parsed.font in FONT_MAP ? (parsed.font as ThemePrefs["font"]) : THEME_DEFAULTS.font,
      cardStyle:
        parsed.cardStyle &&
        (parsed.cardStyle === "classic" ||
          parsed.cardStyle === "plain" ||
          parsed.cardStyle === "colorful")
          ? parsed.cardStyle
          : THEME_DEFAULTS.cardStyle,
      fontSize:
        parsed.fontSize && parsed.fontSize in SIZE_MAP
          ? (parsed.fontSize as ThemePrefs["fontSize"])
          : THEME_DEFAULTS.fontSize,
    };
  } catch {
    return THEME_DEFAULTS;
  }
}

export function saveThemePrefs(prefs: ThemePrefs): void {
  try {
    localStorage.setItem(THEME_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage 不可用时静默失败
  }
}

// 把主题偏好写入 <html data-*> 与 CSS 变量。
// 组件用不到变量名 —— 全部样式引用 var(--coral) 等。
export function applyTheme(prefs: ThemePrefs): void {
  const root = document.documentElement;
  const accent = ACCENT_MAP[prefs.accent];
  root.style.setProperty("--coral", accent.coral);
  root.style.setProperty("--coral-soft", accent.soft);
  root.style.setProperty("--coral-ink", accent.ink);
  // 主色/强调色联动到现有 accent/primary（渐进式，避免大量组件回退）
  root.style.setProperty("--accent", accent.coral);
  root.style.setProperty("--primary", accent.coral);
  root.style.setProperty("--accent-soft", accent.soft);
  // v3.9.25：强调色底上的文字色 / 悬停加深色
  // ⚠️ `--accent-ink` 以前**只有这 4 个地方偷偷用、却从来没人定义**：
  //    当文字色用时靠 var(--accent-ink, var(--accent)) 的兜底混过去（勉强能看），
  //    当**背景**用时没有兜底 → 解析成透明 → 白字写在透明上，直接看不见。
  //    补上定义，两边一起治好。
  root.style.setProperty("--accent-ink", accent.ink);
  root.style.setProperty("--accent-hover", accent.hover);
  root.style.setProperty("--on-accent", accent.on);
  root.style.setProperty("--font-app", FONT_MAP[prefs.font]);
  root.style.setProperty("--app-font-scale", SIZE_MAP[prefs.fontSize]);
  root.dataset.cardStyle = prefs.cardStyle;
  root.dataset.accent = prefs.accent;
}
