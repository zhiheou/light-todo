import { Palette } from "lucide-react";
import { useState } from "react";
import type { ThemePrefs } from "../types";
import { ACCENT_MAP } from "../lib/theme";

interface AppearancePanelProps {
  prefs: ThemePrefs;
  onChange: (patch: Partial<ThemePrefs>) => void;
}

const FONT_LABEL: Record<ThemePrefs["font"], string> = {
  kai: "楷体",
  sans: "黑体",
  song: "宋体",
  noto: "Noto",
};

const ACCENT_LABEL: Record<ThemePrefs["accent"], string> = {
  purple: "极光紫",
  graphite: "石墨灰",
  mistBlue: "雾蓝",
  sageGreen: "鼠尾草绿",
};

const CARD_LABEL: Record<ThemePrefs["cardStyle"], string> = {
  classic: "经典",
  plain: "平实",
  colorful: "多彩",
};

const SIZE_LABEL: Record<ThemePrefs["fontSize"], string> = {
  small: "小",
  standard: "标准",
  large: "大",
  extraLarge: "特大",
};

export default function AppearancePanel({ prefs, onChange }: AppearancePanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="appearance-wrap">
      <button
        type="button"
        className="local-note"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <Palette size={12} />
        外观
      </button>
      {open && (
        <div className="appearance-panel">
          <div className="appearance-group">
            <span className="appearance-label">主题色</span>
            <div className="appearance-row">
              {(Object.keys(ACCENT_MAP) as ThemePrefs["accent"][]).map((key) => (
                <button
                  key={key}
                  type="button"
                  className={prefs.accent === key ? "swatch active" : "swatch"}
                  style={{ background: ACCENT_MAP[key].coral }}
                  title={ACCENT_LABEL[key]}
                  aria-label={ACCENT_LABEL[key]}
                  onClick={() => onChange({ accent: key })}
                />
              ))}
            </div>
          </div>

          <div className="appearance-group">
            <span className="appearance-label">字体</span>
            <div className="appearance-row">
              {(Object.keys(FONT_LABEL) as ThemePrefs["font"][]).map((key) => (
                <button
                  key={key}
                  type="button"
                  className={prefs.font === key ? "chip-btn active" : "chip-btn"}
                  onClick={() => onChange({ font: key })}
                >
                  {FONT_LABEL[key]}
                </button>
              ))}
            </div>
          </div>

          <div className="appearance-group">
            <span className="appearance-label">卡片</span>
            <div className="appearance-row">
              {(Object.keys(CARD_LABEL) as ThemePrefs["cardStyle"][]).map((key) => (
                <button
                  key={key}
                  type="button"
                  className={prefs.cardStyle === key ? "chip-btn active" : "chip-btn"}
                  onClick={() => onChange({ cardStyle: key })}
                >
                  {CARD_LABEL[key]}
                </button>
              ))}
            </div>
          </div>

          <div className="appearance-group">
            <span className="appearance-label">字号</span>
            <div className="appearance-row">
              {(Object.keys(SIZE_LABEL) as ThemePrefs["fontSize"][]).map((key) => (
                <button
                  key={key}
                  type="button"
                  className={prefs.fontSize === key ? "chip-btn active" : "chip-btn"}
                  onClick={() => onChange({ fontSize: key })}
                >
                  {SIZE_LABEL[key]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
