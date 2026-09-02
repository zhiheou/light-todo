import { useRef, useState } from "react";
import type { MascotMood } from "../types";

interface MascotAvatarProps {
  /** 情绪态 */
  mood?: MascotMood;
  /** 尺寸（px） */
  size?: number;
  /** 品牌色 / 空间色调（工作=青白，个人=暖黑）—— 由调用方给 class 名控制 SVG 内 currentColor */
  className?: string;
  /** 是否允许鼠标跟随（桌面端 true，移动端 false） */
  follow?: boolean;
}

/**
 * 圆脸小机器人吉祥物（SVG）。
 *
 * - 基态呼吸 + 随机眨眼（CSS animation）
 * - 瞳孔跟随鼠标轻微转动（桌面端 follow=true）
 * - mood 驱动眼睛/嘴形变：happy=弯眼咧嘴、thinking=侧目+皱嘴、reminding=圆睁+开口、listening=聚焦
 * - prefers-reduced-motion 下由 CSS 关闭动画
 */
export default function MascotAvatar({
  mood = "idle",
  size = 56,
  className = "",
  follow = true,
}: MascotAvatarProps) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const [pat, setPat] = useState({ x: 0, y: 0 });

  function handleMove(event: React.MouseEvent) {
    if (!follow || !rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    // 瞳孔最大偏移 2.5px
    const dx = ((event.clientX - cx) / rect.width) * 2.5;
    const dy = ((event.clientY - cy) / rect.height) * 2.5;
    setPat({
      x: Math.max(-2.5, Math.min(2.5, dx)),
      y: Math.max(-1.5, Math.min(1.5, dy)),
    });
  }

  function handleLeave() {
    setPat({ x: 0, y: 0 });
  }

  // 表情形态：眼睛形状/嘴
  const eyes = mood === "happy"
    ? { e: 2.6, ry: 2.2, up: -1 } // 弯 (用 path 更佳，这里用上弧近似)
    : mood === "thinking"
      ? { e: 2.4, ry: 2.4, up: 0 }
      : mood === "reminding"
        ? { e: 3.2, ry: 3.2, up: 0 }
        : { e: 2.4, ry: 2.4, up: 0 };
  const smile = mood === "reminding" ? "open" : mood === "thinking" ? "flat" : mood === "happy" ? "wide" : "smile";

  return (
    <span
      ref={rootRef}
      className={`mascot-avatar mascot-mood-${mood} ${className}`}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      style={{ width: size, height: size, color: "currentColor" }}
      role="img"
      aria-label="吉祥物小助手"
    >
      <svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true">
        {/* 机身：圆润 blob */}
        <ellipse
          cx="32"
          cy="34"
          rx="24"
          ry="21"
          fill="currentColor"
          opacity="0.16"
          className="mascot-blob"
        />
        {/* 机身高光 */}
        <ellipse cx="24" cy="26" rx="7" ry="4" fill="#fff" opacity="0.35" />
        {/* 两只小耳朵/角 */}
        <circle cx="12" cy="20" r="3.4" fill="currentColor" opacity="0.25" />
        <circle cx="52" cy="20" r="3.4" fill="currentColor" opacity="0.25" />

        {/* 眼睛容器（跟随只轻微移动瞳孔，眼睛本体固定） */}
        <g className="mascot-eyes">
          <g className="mascot-eye mascot-eye-l">
            {mood === "happy" ? (
              <path d="M24 26 q-3 3 -6 0" stroke="#333" strokeWidth="2.4" fill="none" strokeLinecap="round" />
            ) : (
              <>
                <ellipse cx="23" cy="29" rx={eyes.e} ry={eyes.ry} fill="#333" />
                <circle
                  cx={23 + pat.x}
                  cy={29 + pat.y * 0.4}
                  r="1.1"
                  fill="#fff"
                  className="mascot-pupil"
                />
              </>
            )}
          </g>
          <g className="mascot-eye mascot-eye-r">
            {mood === "happy" ? (
              <path d="M38 26 q3 3 6 0" stroke="#333" strokeWidth="2.4" fill="none" strokeLinecap="round" />
            ) : (
              <>
                <ellipse cx="41" cy="29" rx={eyes.e} ry={eyes.ry} fill="#333" />
                <circle
                  cx={41 + pat.x}
                  cy={29 + pat.y * 0.4}
                  r="1.1"
                  fill="#fff"
                  className="mascot-pupil"
                />
              </>
            )}
          </g>
        </g>

        {/* 嘴 */}
        {smile === "smile" && (
          <path d="M27 38 q5 4 10 0" stroke="#333" strokeWidth="2" fill="none" strokeLinecap="round" />
        )}
        {smile === "wide" && (
          <path d="M26 38 q6 6 12 0 z" fill="#333" opacity="0.85" />
        )}
        {smile === "open" && (
          <ellipse cx="32" cy="40" rx="4" ry="3" fill="#333" />
        )}
        {smile === "flat" && (
          <path d="M29 40 h6" stroke="#333" strokeWidth="2.2" strokeLinecap="round" />
        )}

        {/* 脸颊红晕（可爱感） */}
        <ellipse cx="17" cy="36" rx="3" ry="1.8" fill="#ff7b7b" opacity={mood === "happy" ? 0.5 : 0.25} />
        <ellipse cx="47" cy="36" rx="3" ry="1.8" fill="#ff7b7b" opacity={mood === "happy" ? 0.5 : 0.25} />
      </svg>
    </span>
  );
}
