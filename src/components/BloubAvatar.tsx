import { useEffect, useMemo, useRef, useState } from "react";
import { BotEngine, type BotFrame, type Look } from "../lib/bloub/engine";
import { NOTIF_BLUE } from "../lib/bloub/decor";
import type { StateId } from "../lib/bloub/states";
import type { PetCoatKey } from "../types";
import { COAT_PALETTES } from "../lib/petPalettes";

/**
 * BloubAvatar：bloub 引擎的 React 渲染层。
 *
 * - 一个受控的 `state`（形变态 idle/egg/hexagon/…），引擎 sample(t) 纯时间函数。
 * - rAF 驱动：每帧 engine.sample(clock) → setFrame。frozenAt 时不启 rAF（静态帧）。
 * - 颜色：bloub 原版是"纸底 + 墨色 body + 挖空眼睛"。轻待办版 body 用 coat 主色，
 *   挖空处透出淡色（paper = 极淡的 coat 底色），整体呼应晨青/暮暖。
 * - `Look` 暴露给外层做鼠标注视（setLook）。
 */
export interface BloubAvatarProps {
  size?: number;
  state?: StateId;
  /** 供使用 DEFAULT_SHAPE 之外的静止形状（占位，未接 skins） */
  coat: PetCoatKey;
  /** 背景色/纸色：眼睛挖穿处透出 */
  paper?: string;
  /** 若指定则不跑动画，渲染该绝对时间的静态帧 */
  frozenAt?: number;
  /** 外层控制注视 */
  look?: Look | null;
  className?: string;
  ariaLabel?: string;
}

export interface BloubAvatarHandle {
  setState(id: StateId): void;
  setLook(look: Look | null): void;
}

const VB = 158; // bloub DEMI_VIEWBOX
const R = 100; // bloub RAYON

/** 每 coat 给一对 ink(body 主色) 与 paper(眼洞露出淡底) */
function paletteFor(coat: PetCoatKey) {
  const p = COAT_PALETTES[coat];
  return { ink: p.main, paper: p.cheek ?? "#f2f6f5" };
}

export function BloubAvatar({
  size = 160,
  state = "idle",
  coat,
  paper,
  frozenAt,
  look,
  className = "",
  ariaLabel = "轻宜",
}: BloubAvatarProps) {
  const pal = paletteFor(coat);
  const ink = pal.ink;
  const paperColor = paper ?? pal.paper;

  const engineRef = useRef<BotEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new BotEngine(R, state);
  }
  const engine = engineRef.current;

  const [frame, setFrame] = useState<BotFrame>(() => engine.sample(frozenAt ?? 0));
  const uid = useMemo(() => Math.random().toString(36).slice(2, 8), []);
  const maskId = `blob-mask-${uid}`;

  const lookRef = useRef(look);
  lookRef.current = look;
  const lastSetState = useRef(state);

  // state 变化 → 引擎 setState(带时钟)
  useEffect(() => {
    if (state === lastSetState.current) return;
    lastSetState.current = state;
    const t = performance.now() / 1000;
    engine.setState(state, t);
    // 状态切换后立刻取一帧（含进入形变的起点）
    setFrame(engine.sample(t));
  }, [state, engine]);

  // 注视
  useEffect(() => {
    const lk = lookRef.current;
    if (lk) engine.setLook(lk, performance.now() / 1000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [look]);

  // rAF 时钟（仅未 frozen）
  useEffect(() => {
    if (frozenAt !== undefined) {
      setFrame(engine.sample(frozenAt));
      return;
    }
    let raf = 0;
    const tick = (now: number) => {
      const clock = now / 1000;
      // liveliness 只在这些 setter 带时钟时正确；表情沿用
      const f = engine.sample(clock);
      setFrame(f);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [engine, frozenAt]);

  // dot attrs 辅助（dot.d 时是 path，否则 circle）
  const dotFill = (dot: BotFrame["dots"][number]): string => {
    if (dot.color) return dot.color;
    if (dot.depth !== undefined) {
      // mix paper↔ink by depth —— 简单近似
      const k = dot.depth;
      return lerpHex(paperColor, ink, k);
    }
    return ink;
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox={`${-VB} ${-VB} ${VB * 2} ${VB * 2}`}
      role="img"
      aria-label={ariaLabel}
      className={`blob-avatar ${className}`}
    >
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x={-VB} y={-VB} width={VB * 2} height={VB * 2}>
          <path d={frame.bodyPath} fill="#fff" />
          {frame.eyes.map((eye, i) => (
            <path key={i} d={eye.d} transform={eye.matrix} opacity={eye.alpha} fill="#000" />
          ))}
          {frame.notch && (
            <circle cx={frame.notch.x} cy={frame.notch.y} r={frame.notch.r} fill="#000" />
          )}
        </mask>
        {frame.arcs.map((arc) => (
          <linearGradient
            key={arc.id}
            id={`${uid}-${arc.id}`}
            gradientUnits="userSpaceOnUse"
            x1={arc.grad.x1}
            y1={arc.grad.y1}
            x2={arc.grad.x2}
            y2={arc.grad.y2}
          >
            {arc.grad.stops.map((c, i) => (
              <stop
                key={i}
                offset={i / (arc.grad.stops.length - 1)}
                stopColor={c}
              />
            ))}
          </linearGradient>
        ))}
      </defs>

      {/* 弧的背面（先画，被身体遮挡） */}
      <g fill="none" strokeLinecap="round">
        {frame.arcs.map((arc) => (
          <path
            key={`b${arc.id}`}
            d={arc.back}
            stroke={`url(#${uid}-${arc.id})`}
            strokeWidth={arc.width}
            opacity={arc.opacity}
          />
        ))}
      </g>

      {/* 星爆粒子（身后） */}
      {frame.dotsBehind && (
        <g>
          {frame.dots.map((dot, i) =>
            dot.d ? (
              <path
                key={`pb${i}`}
                d={dot.d}
                transform={`translate(${dot.x} ${dot.y}) rotate(${dot.rot ?? 0}) scale(${R})`}
                fill={dotFill(dot)}
                opacity={dot.opacity}
              />
            ) : (
              <circle key={`pb${i}`} cx={dot.x} cy={dot.y} r={dot.r} fill={dotFill(dot)} opacity={dot.opacity} />
            ),
          )}
        </g>
      )}

      {/* 身体（纸底 + 挖眼墨色） */}
      <g opacity={frame.bodyAlpha}>
        <path d={frame.bodyPath} fill={paperColor} />
        <g mask={`url(#${maskId})`}>
          <rect x={-VB} y={-VB} width={VB * 2} height={VB * 2} fill={ink} />
        </g>
      </g>

      {/* 身前的点 */}
      {!frame.dotsBehind && (
        <g>
          {frame.dots.map((dot, i) =>
            dot.d ? (
              <path
                key={`pf${i}`}
                d={dot.d}
                transform={`translate(${dot.x} ${dot.y}) rotate(${dot.rot ?? 0}) scale(${R})`}
                fill={dotFill(dot)}
                opacity={dot.opacity}
              />
            ) : (
              <circle key={`pf${i}`} cx={dot.x} cy={dot.y} r={dot.r} fill={dotFill(dot)} opacity={dot.opacity} />
            ),
          )}
        </g>
      )}

      {/* 通知蓝点 */}
      {frame.notif && (
        <circle cx={frame.notif.x} cy={frame.notif.y} r={frame.notif.r} fill={NOTIF_BLUE} />
      )}

      {/* 弧的前半段 */}
      <g fill="none" strokeLinecap="round">
        {frame.arcs.map((arc) => (
          <path
            key={`f${arc.id}`}
            d={arc.front}
            stroke={`url(#${uid}-${arc.id})`}
            strokeWidth={arc.width}
            opacity={arc.opacity}
          />
        ))}
      </g>
    </svg>
  );
}

/** 两个 hex 颜色按 t 插值（粒子深度雾简化用） */
function lerpHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ar = (pa >> 16) & 255;
  const ag = (pa >> 8) & 255;
  const ab = pa & 255;
  const br = (pb >> 16) & 255;
  const bg = (pb >> 8) & 255;
  const bb = pb & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
}
