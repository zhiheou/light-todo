// 主题外观偏好：localStorage 持久化 + 应用到 document.documentElement 的 CSS 变量。
// 组件零改动 —— 主题只改 CSS 变量（--coral/--coral-soft/--coral-ink/--font-app/--app-font-scale/card-style）。
import type { ThemePrefs } from "../types";

const THEME_KEY = "lighttodo:theme:v1";

// 强调色 token：与 Dadao 对齐的 4 套低饱和色
export const ACCENT_MAP: Record<
  ThemePrefs["accent"],
  { coral: string; soft: string; ink: string }
> = {
  purple: { coral: "#8B91E8", soft: "#E7E8FB", ink: "#6D74D6" },
  graphite: { coral: "#52525B", soft: "#EEEEF0", ink: "#3F3F46" },
  mistBlue: { coral: "#6B8CAE", soft: "#E8EEF4", ink: "#567596" },
  sageGreen: { coral: "#7A9E8E", soft: "#EAF0EC", ink: "#5F8575" },
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
  root.style.setProperty("--font-app", FONT_MAP[prefs.font]);
  root.style.setProperty("--app-font-scale", SIZE_MAP[prefs.fontSize]);
  root.dataset.cardStyle = prefs.cardStyle;
  root.dataset.accent = prefs.accent;
}
