import { useEffect, useMemo, useRef, useState } from "react";
import { BotEngine, type BotFrame, type Look } from "../lib/bloub/engine";
import { NOTIF_BLUE } from "../lib/bloub/decor";
import type { StateId } from "../lib/bloub/states";
import type { PetCoatKey } from "../types";
import { COAT_PALETTES } from "../lib/petPalettes";

/**
 * BloubAvatar：bloub 引擎的 React 渲染层（性能版 v2）。
 *
 * 结构一次性渲染（固定骨架 + 池化节点），之后 rAF 直写 SVG 属性，不经过 React reconcile。
 * 眼睛 = mask 内挖空的胶囊 path（与 bloub 原版一致），骨架里按最大数铺好，每帧更新属性。
 *
 * 池：eyes×2 / maskNotch×1 / arcs×6(前后各) / dots前后各×10 / notif×1。
 * 某帧没有该元素 → display:none。
 */

export interface BloubAvatarProps {
  size?: number;
  state?: StateId;
  coat: PetCoatKey;
  paper?: string;
  frozenAt?: number;
  look?: Look | null;
  behaviors?: { breathe?: boolean; blink?: boolean };
  className?: string;
  ariaLabel?: string;
}

const VB = 158;
const R = 100;
const EYE_POOL = 2;
const ARC_POOL = 6;

function paletteFor(coat: PetCoatKey) {
  const p = COAT_PALETTES[coat];
  return { ink: p.main, paper: p.cheek ?? "#f2f6f5" };
}

/** dot 的颜色（内联渲染时用） */
function dotFill(d: BotFrame["dots"][number], paper: string, ink: string): string {
  if (d.color) return d.color;
  if (d.depth !== undefined) return lerpHex(paper, ink, d.depth);
  return ink;
}

export function BloubAvatar({
  size = 160,
  state = "idle",
  coat,
  paper,
  frozenAt,
  look,
  behaviors,
  className = "",
  ariaLabel = "轻宜",
}: BloubAvatarProps) {
  const pal = paletteFor(coat);
  const ink = pal.ink;
  const paperColor = paper ?? pal.paper;

  const engineRef = useRef<BotEngine | null>(null);
  if (!engineRef.current) engineRef.current = new BotEngine(R, state);
  const engine = engineRef.current;
  (window as unknown as { __petEngine?: BotEngine }).__petEngine = engine; // debug probe

  // 初挂一帧（供骨架布局/首屏，之后被 rAF 覆盖）
  const [bootFrame] = useState<BotFrame>(() => engine.sample(frozenAt ?? 0));

  // 行为 → 引擎
  const lastBehav = useRef("");
  useEffect(() => {
    const k = `${behaviors?.blink ?? true}-${behaviors?.breathe ?? true}`;
    if (k === lastBehav.current) return;
    lastBehav.current = k;
    engine.setLive({ blink: behaviors?.blink, breathe: behaviors?.breathe });
  }, [behaviors, engine]);

  const uid = useMemo(() => Math.random().toString(36).slice(2, 8), []);
  const maskId = `blob-mask-${uid}`;

  // ---- 稳定节点 refs ----
  const bodyPathRef = useRef<SVGPathElement | null>(null); // 纸底 body 路径
  const inkMaskPathRef = useRef<SVGPathElement | null>(null); // mask 里身体白色区
  const maskEyes = useRef<(SVGPathElement | null)[]>([]);
  const maskNotch = useRef<SVGCircleElement | null>(null);
  const bodyGroupRef = useRef<SVGGElement | null>(null); // body alpha 组
  const arcsBack = useRef<SVGGElement | null>(null); // 弧背面容器(整组重写 innerHTML)
  const arcsFront = useRef<SVGGElement | null>(null); // 弧前面容器
  const dotsF = useRef<SVGGElement | null>(null);
  const dotsB = useRef<SVGGElement | null>(null);
  const notif = useRef<SVGCircleElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // ---- 状态 ----
  const lastState = useRef(state);
  const lookRef = useRef(look);
  lookRef.current = look;

  useEffect(() => {
    if (state !== lastState.current) {
      lastState.current = state;
      engine.setState(state, performance.now() / 1000);
    }
  }, [state, engine]);

  useEffect(() => {
    const lk = lookRef.current;
    if (lk) {
      engine.setLook(lk, performance.now() / 1000);
      (window as unknown as Record<string, unknown>).__lastLook = lk;
    }
  }, [look, engine]);

  /** 每帧把引擎输出写到池化 DOM 节点 */
  function writeFrame(f: BotFrame) {
    // body 路径：纸底 + mask 白色同形
    if (bodyPathRef.current) bodyPathRef.current.setAttribute("d", f.bodyPath);
    if (inkMaskPathRef.current) inkMaskPathRef.current.setAttribute("d", f.bodyPath);
    if (bodyGroupRef.current) bodyGroupRef.current.setAttribute("opacity", String(f.bodyAlpha));

    // 眼睛（mask 挖洞）
    const eyeProbe = window as unknown as Record<string, unknown>;
    eyeProbe.__eyeProbe = { maskLen: maskEyes.current.length, eye0: f.eyes[0]?.matrix };
    for (let i = 0; i < EYE_POOL; i++) {
      const el = maskEyes.current[i];
      if (!el) continue;
      const eye = f.eyes[i];
      if (eye) {
        el.style.display = "";
        el.setAttribute("d", eye.d);
        el.setAttribute("transform", eye.matrix);
        el.setAttribute("opacity", String(eye.alpha));
      } else el.style.display = "none";
    }
    // mask 凹槽
    if (maskNotch.current) {
      if (f.notch) {
        maskNotch.current.style.display = "";
        maskNotch.current.setAttribute("cx", String(f.notch.x));
        maskNotch.current.setAttribute("cy", String(f.notch.y));
        maskNotch.current.setAttribute("r", String(f.notch.r));
      } else maskNotch.current.style.display = "none";
    }

    // 弧（前/后）—— 整组重写 innerHTML（idle 无弧=空，开销极小；orbit/burst 时临时生成）
    const ns = "http://www.w3.org/2000/svg";
    const ensureGrad = (arc: BotFrame["arcs"][number]) => {
      const gid = `${uid}-${arc.id}`;
      // getElementById 接受数字开头/含 '-' 的 id；CSS 选择器对它们会抛 SyntaxError
      if (svgRef.current?.getElementById(gid)) return;
      const lg = document.createElementNS(ns, "linearGradient");
      lg.setAttribute("id", gid);
      lg.setAttribute("gradientUnits", "userSpaceOnUse");
      lg.setAttribute("x1", String(arc.grad.x1));
      lg.setAttribute("y1", String(arc.grad.y1));
      lg.setAttribute("x2", String(arc.grad.x2));
      lg.setAttribute("y2", String(arc.grad.y2));
      arc.grad.stops.forEach((c, j) => {
        const st = document.createElementNS(ns, "stop");
        st.setAttribute("offset", String(j / (arc.grad.stops.length - 1)));
        st.setAttribute("stop-color", c);
        lg.appendChild(st);
      });
      svgRef.current?.querySelector("defs")?.appendChild(lg);
    };
    const renderArc = (g: SVGGElement | null, which: "back" | "front", arc: BotFrame["arcs"][number] | undefined) => {
      if (!g) return;
      g.innerHTML = "";
      if (!arc || arc.opacity <= 0.01) return;
      ensureGrad(arc);
      const p = document.createElementNS(ns, "path");
      p.setAttribute("d", which === "back" ? arc.back : arc.front);
      p.setAttribute("stroke", `url(#${uid}-${arc.id})`);
      p.setAttribute("stroke-width", String(arc.width));
      p.setAttribute("opacity", String(arc.opacity));
      p.setAttribute("fill", "none");
      p.setAttribute("stroke-linecap", "round");
      g.appendChild(p);
    };
    for (let i = 0; i < ARC_POOL; i++) {
      renderArc(arcsBack.current, "back", f.arcs[i]);
      renderArc(arcsFront.current, "front", f.arcs[i]);
    }

    // 点：先清空，再填
    const clearG = (g: SVGGElement | null) => { if (g) g.innerHTML = ""; };
    clearG(dotsF.current);
    clearG(dotsB.current);
    const behind = f.dotsBehind;
    const target = behind ? dotsB.current : dotsF.current;
    if (target) {
      f.dots.forEach((dot) => {
        const fill = dotFill(dot, paperColor, ink);
        if (dot.d) {
          const p = document.createElementNS(ns, "path");
          p.setAttribute("d", dot.d);
          p.setAttribute("transform", `translate(${dot.x} ${dot.y}) rotate(${dot.rot ?? 0}) scale(${R})`);
          p.setAttribute("fill", fill);
          p.setAttribute("opacity", String(dot.opacity));
          target.appendChild(p);
        } else {
          const c = document.createElementNS(ns, "circle");
          c.setAttribute("cx", String(dot.x));
          c.setAttribute("cy", String(dot.y));
          c.setAttribute("r", String(dot.r));
          c.setAttribute("fill", fill);
          c.setAttribute("opacity", String(dot.opacity));
          target.appendChild(c);
        }
      });
    }

    // notif 蓝点
    if (notif.current) {
      if (f.notif) {
        notif.current.style.display = "";
        notif.current.setAttribute("cx", String(f.notif.x));
        notif.current.setAttribute("cy", String(f.notif.y));
        notif.current.setAttribute("r", String(f.notif.r));
      } else notif.current.style.display = "none";
    }
  }

  // 初挂写一帧（避免空首帧）
  useEffect(() => {
    writeFrame(bootFrame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // rAF
  useEffect(() => {
    if (frozenAt !== undefined) {
      writeFrame(engine.sample(frozenAt));
      return;
    }
    // reduced-motion：关掉自主眨眼/漂移（交给引擎），但仍跑 rAF 让"形变/注视"这类用户触发的响应生效
    const reducedMedia = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMedia.matches) engine.setLive({ blink: false, breathe: false });
    let raf = 0;
    let last = 0;
    const FRAME = 1000 / 30; // 30fps：眨眼/漂移已顺滑，CPU 减半
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (document.hidden) return;
      if (now - last < FRAME) return;
      last = now;
      writeFrame(engine.sample(now / 1000));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, frozenAt]);

  // ---- 一次性骨架 ----
  const bf = bootFrame; // 首帧用于初始结构

  return (
    <svg
      ref={svgRef}
      width={size}
      height={size}
      viewBox={`${-VB} ${-VB} ${VB * 2} ${VB * 2}`}
      role="img"
      aria-label={ariaLabel}
      className={`blob-avatar ${className}`}
    >
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x={-VB} y={-VB} width={VB * 2} height={VB * 2}>
          <path ref={inkMaskPathRef} d={bf.bodyPath} fill="#fff" />
          {Array.from({ length: EYE_POOL }).map((_, i) => (
            <path
              key={`me${i}`}
              ref={(el) => { maskEyes.current[i] = el; }}
              d=""
              fill="#000"
              style={{ display: "none" }}
            />
          ))}
          <circle ref={maskNotch} cx="0" cy="0" r="0" fill="#000" style={{ display: "none" }} />
        </mask>
      </defs>

      {/* 弧背面 + 身后点 + notif(blue) 等：由 writeFrame 每帧整组重写 */}
      <g ref={arcsBack} fill="none" strokeLinecap="round" />
      <g ref={dotsB} />
      <circle ref={notif} cx="0" cy="0" r="0" fill={NOTIF_BLUE} style={{ display: "none" }} />

      {/* 身体组（纸底 + 挖眼墨） */}
      <g ref={bodyGroupRef} opacity={bf.bodyAlpha}>
        <path ref={bodyPathRef} d={bf.bodyPath} fill={paperColor} />
        <g mask={`url(#${maskId})`}>
          <rect x={-VB} y={-VB} width={VB * 2} height={VB * 2} fill={ink} />
        </g>
      </g>

      {/* 身前点 + 弧前面 */}
      <g ref={dotsF} />
      <g ref={arcsFront} fill="none" strokeLinecap="round" />
    </svg>
  );
}

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
