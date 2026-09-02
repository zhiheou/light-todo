import { forwardRef } from "react";
import type { JSX } from "react";
import type { PetCoatKey, PetEyeStyle, PetExtras, PetFrame, PetMouthSpec } from "../types";
import { COAT_PALETTES } from "../lib/petPalettes";

/**
 * AvatarV2：轻宜的身体渲染（纯表现层）。
 *
 * 吃 PetFrame（引擎产出），画 SVG。本身不跑时钟、不管输入，只画"这一帧长什么样"，
 * 因此能在主角色 / 聊天小头像 / 表情馆缩略图多处复用（喂静态 frame 即可）。
 */

export interface AvatarV2Props {
  /** 渲染所需的一帧 */
  frame: PetFrame;
  size?: number;
  coat: PetCoatKey;
  className?: string;
  reduced?: boolean;
}

export interface AvatarV2Handle {}

const VB = 128; // viewBox 空间
const CY = 56; // 身体中心 y（留头顶空间给特效）

function EyeSVG({
  style,
  cx,
  baseY,
  scale,
  irisScale = 1,
  look = { dx: 0, dy: 0 },
  blink,
  coat,
  side = "l",
}: {
  style: PetEyeStyle;
  cx: number;
  baseY: number;
  scale: number;
  irisScale?: number;
  look?: { dx: number; dy: number };
  blink: number;
  coat: { main: string; line: string; hi: string };
  side?: "l" | "r";
}) {
  const sx = scale;
  const sy = scale * (1 - 0.9 * blink); // 眨眼压缩
  const gx = cx + look.dx * 2.4;
  const gy = baseY + look.dy * 2;

  const line = coat.line;

  // wink：这只眼若是要眨的一侧 → 闭线；另一侧保持圆睁
  const winkClosed = style === "winkL" ? side === "l" : style === "winkR" ? side === "r" : false;
  const effectiveStyle: PetEyeStyle = winkClosed ? "closed" : style === "winkL" || style === "winkR" ? "round" : style;

  const shapes: Record<string, JSX.Element> = {
    round: (
      <>
        <ellipse cx={gx} cy={gy} rx={5.2 * sx * irisScale} ry={5.6 * sy * irisScale} fill={line} />
        <circle cx={gx + 1.4} cy={gy - 1.4} r={1.6 * irisScale} fill="#fff" opacity={0.85} />
      </>
    ),
    openBig: (
      <>
        <ellipse cx={gx} cy={gy} rx={6 * sx * irisScale} ry={6.4 * sy * irisScale} fill={line} />
        <circle cx={gx + 1.6} cy={gy - 1.6} r={1.8 * irisScale} fill="#fff" opacity={0.9} />
      </>
    ),
    happyArc: (
      <path
        d={`M ${gx - 6 * sx} ${gy + 1} Q ${gx} ${gy - 4 * sy * 2.2} ${gx + 6 * sx} ${gy + 1}`}
        stroke={line}
        strokeWidth={2.6 * sx}
        fill="none"
        strokeLinecap="round"
      />
    ),
    sadArc: (
      <path
        d={`M ${gx - 5 * sx} ${gy - 1} Q ${gx} ${gy + 3.6} ${gx + 5 * sx} ${gy - 1}`}
        stroke={line}
        strokeWidth={2.6 * sx}
        fill="none"
        strokeLinecap="round"
      />
    ),
    cryArc: (
      <>
        <path
          d={`M ${gx - 5 * sx} ${gy - 1} Q ${gx} ${gy + 3.6} ${gx + 5 * sx} ${gy - 1}`}
          stroke={line}
          strokeWidth={2.6 * sx}
          fill="none"
          strokeLinecap="round"
        />
        <ellipse cx={gx + 6 * sx} cy={gy + 2} rx={1.6} ry={2.2} fill="#8ec9ff" />
      </>
    ),
    sleepLine: (
      <path
        d={`M ${gx - 5.5 * sx} ${gy} Q ${gx} ${gy - 2.4 * sy * 2} ${gx + 5.5 * sx} ${gy}`}
        stroke={line}
        strokeWidth={2.4 * sx}
        fill="none"
        strokeLinecap="round"
      />
    ),
    closed: (
      <path d={`M ${gx - 5 * sx} ${gy} L ${gx + 5 * sx} ${gy}`} stroke={line} strokeWidth={2.2 * sx} strokeLinecap="round" />
    ),
    squint: (
      <path
        d={`M ${gx - 4.6 * sx} ${gy + 1.6} Q ${gx} ${gy - 2.6 * sy * 1.6} ${gx + 4.6 * sx} ${gy + 1.6}`}
        stroke={line}
        strokeWidth={2.4 * sx}
        fill="none"
        strokeLinecap="round"
      />
    ),
    dot: <circle cx={gx} cy={gy} r={1.9 * sx} fill={line} />,
    heart: (
      <path
        d={`M ${gx} ${gy + 4.4} C ${gx - 6 * sx} ${gy - 0.5} ${gx - 3.4 * sx} ${gy - 5.6} ${gx} ${gy - 1.4} C ${gx + 3.4 * sx} ${gy - 5.6} ${gx + 6 * sx} ${gy - 0.5} ${gx} ${gy + 4.4} Z`}
        fill={coat.main}
      />
    ),
    star: (
      <polygon
        points={starPoints(gx, gy, 4.6 * sx, 2.1 * sx)}
        fill={line}
      />
    ),
    half: (
      <>
        <path
          d={`M ${gx - 4.8 * sx} ${gy} Q ${gx} ${gy - 2.2 * sy * 2} ${gx + 4.8 * sx} ${gy} L ${gx + 4.8 * sx} ${gy + 2.2} L ${gx - 4.8 * sx} ${gy + 2.2} Z`}
          fill={line}
        />
      </>
    ),
    tense: (
      <>
        <path
          d={`M ${gx - 5 * sx} ${gy + 2.4} L ${gx - 2} ${gy - 2.4} L ${gx + 2} ${gy + 2.4} L ${gx + 5 * sx} ${gy - 2.4}`}
          stroke={line}
          strokeWidth={2.6 * sx}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    ),
    cross: (
      <g stroke={line} strokeWidth={2.4 * sx} strokeLinecap="round">
        <line x1={gx - 4.2 * sx} y1={gy - 4.2 * sx} x2={gx + 4.2 * sx} y2={gy + 4.2 * sx} />
        <line x1={gx + 4.2 * sx} y1={gy - 4.2 * sx} x2={gx - 4.2 * sx} y2={gy + 4.2 * sx} />
      </g>
    ),
    blank: <circle cx={gx} cy={gy} r={2.6 * sx} fill={line} opacity={0.6} />,
    zzz: <path d={`M ${gx - 4 * sx} ${gy} h 8`} stroke={line} strokeWidth={2 * sx} strokeLinecap="round" />,
  };

  return <g>{shapes[effectiveStyle] ?? shapes.round}</g>;
}

/** 五角星顶点 */
function starPoints(cx: number, cy: number, rOut: number, rIn: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? rOut : rIn;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(" ");
}

function MouthSVG({ spec, coat }: { spec: PetMouthSpec; coat: { main: string; line: string } }) {
  const s = spec.scale ?? 1;
  const line = coat.line;
  const parts: Record<string, JSX.Element> = {
    smile: <path d="M 56 66 Q 64 73 72 66" stroke={line} strokeWidth={3 * s} fill="none" strokeLinecap="round" />,
    open: <path d="M 52 64 Q 64 78 76 64 Q 64 70 52 64 Z" fill={line} />,
    wow: <ellipse cx={64} cy={70} rx={6 * s} ry={7 * s} fill={line} />,
    oh: <circle cx={64} cy={69} r={4.6 * s} fill={line} />,
    flat: <path d="M 56 70 h 16" stroke={line} strokeWidth={3 * s} strokeLinecap="round" />,
    line: <path d="M 58 70 h 12" stroke={line} strokeWidth={2.6 * s} strokeLinecap="round" />,
    frown: <path d="M 56 72 Q 64 64 72 72" stroke={line} strokeWidth={3 * s} fill="none" strokeLinecap="round" />,
    grim: <path d="M 55 72 Q 64 66 73 72" stroke={line} strokeWidth={3.4 * s} fill="none" strokeLinecap="round" />,
    grimace: <path d="M 56 68 h 16 M 56 73 h 16" stroke={line} strokeWidth={2.6 * s} strokeLinecap="round" />,
    wavy: <path d="M 54 68 q 2.6 -3 5.3 0 q 2.6 3 5.3 0 q 2.6 -3 5.3 0" stroke={line} strokeWidth={2.6 * s} fill="none" strokeLinecap="round" />,
    cry: <path d="M 56 70 Q 64 66 72 70 M 64 70 L 64 74 M 70 74 l 3 -2" stroke={line} strokeWidth={2.6 * s} fill="none" strokeLinecap="round" />,
    smirk: <path d="M 55 66 Q 68 68 74 62" stroke={line} strokeWidth={3 * s} fill="none" strokeLinecap="round" />,
    annoyed: <path d="M 57 67 Q 64 63 71 67" stroke={line} strokeWidth={2.8 * s} fill="none" strokeLinecap="round" />,
    kiss: <path d="M 60 70 A 4 4 0 1 1 68 70" stroke={line} strokeWidth={2.4 * s} fill="none" strokeLinecap="round" />,
    tongue: (
      <>
        <path d="M 54 64 Q 64 74 74 64" stroke={line} strokeWidth={3 * s} fill="none" strokeLinecap="round" />
        <path d="M 60 67 Q 64 78 68 67 Z" fill="#f7a8b8" />
      </>
    ),
    teeth: <path d="M 56 66 Q 64 72 72 66 Z" fill="#fff" stroke={line} strokeWidth={1.4} />,
  };
  return <g>{parts[spec.kind] ?? parts.smile}</g>;
}

/** 特效层（extras.fx）用 SMIL 简单位移动画 */
function FxLayer({ extras, coat }: { extras: PetExtras; coat: { main: string; line: string } }) {
  const fx = extras.fx;
  if (!fx) return null;
  if (fx === "orbit") {
    // 思考环带：头顶三小点环绕
    const pts = [
      { x: 42, y: 10, d: 0 },
      { x: 64, y: 4, d: 0.35 },
      { x: 86, y: 12, d: 0.7 },
    ];
    return (
      <g>
        {pts.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={3.2}
            fill={coat.main}
            opacity={0.85}
          >
            <animate attributeName="cy" values={`${p.y};${p.y - 6};${p.y}`} dur="1.4s" begin={`${p.d}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.35;1;0.35" dur="1.4s" begin={`${p.d}s`} repeatCount="indefinite" />
          </circle>
        ))}
      </g>
    );
  }
  if (fx === "zzz") {
    return (
      <g fill={coat.main}>
        <text x={80} y={18} fontSize={13} fontWeight={700}>
          z
          <animate attributeName="x" values="80;88" dur="2.6s" repeatCount="indefinite" />
          <animate attributeName="y" values="18;6" dur="2.6s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;1;0" dur="2.6s" repeatCount="indefinite" />
        </text>
        <text x={92} y={10} fontSize={10} fontWeight={700}>
          z
          <animate attributeName="x" values="92;100" dur="2.6s" begin="0.5s" repeatCount="indefinite" />
          <animate attributeName="y" values="10;-2" dur="2.6s" begin="0.5s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;1;0" dur="2.6s" begin="0.5s" repeatCount="indefinite" />
        </text>
      </g>
    );
  }
  if (fx === "confetti") {
    // 撒花：几片小色片斜上抛
    const cols = [coat.main, "#f6a9c0", "#7fd6c6", "#f7c97e"];
    const dots = [
      { x: 30, y: 60, dx: -12, dy: -30, r: 3 },
      { x: 98, y: 60, dx: 12, dy: -32, r: 3 },
      { x: 40, y: 66, dx: -20, dy: -18, r: 2.4 },
      { x: 88, y: 66, dx: 18, dy: -20, r: 2.4 },
      { x: 64, y: 60, dx: 0, dy: -38, r: 3.2 },
    ];
    return (
      <g>
        {dots.map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={cols[i % cols.length]}>
            <animate attributeName="cy" values={`${d.y};${d.y + d.dy}`} dur="0.8s" repeatCount="indefinite" />
            <animate attributeName="cx" values={`${d.x};${d.x + d.dx}`} dur="0.8s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0;1;0" dur="0.8s" repeatCount="indefinite" />
          </circle>
        ))}
      </g>
    );
  }
  if (fx === "typeDots") {
    return (
      <g>
        {[0, 1, 2].map((i) => (
          <circle key={i} cx={54 + i * 10} cy={52} r={2.6} fill={coat.main}>
            <animate attributeName="opacity" values="0.25;1;0.25" dur="0.9s" begin={`${i * 0.15}s`} repeatCount="indefinite" />
            <animate attributeName="cy" values="52;50;52" dur="0.9s" begin={`${i * 0.15}s`} repeatCount="indefinite" />
          </circle>
        ))}
      </g>
    );
  }
  if (fx === "sparkle") {
    return (
      <g fill="#fff5d9">
        {[
          { x: 44, y: 12, s: 4 },
          { x: 84, y: 16, s: 3 },
        ].map((p, i) => (
          <path
            key={i}
            d={`M ${p.x} ${p.y - p.s} L ${p.x + p.s * 0.3} ${p.y - p.s * 0.3} L ${p.x + p.s} ${p.y} L ${p.x + p.s * 0.3} ${p.y + p.s * 0.3} L ${p.x} ${p.y + p.s} L ${p.x - p.s * 0.3} ${p.y + p.s * 0.3} L ${p.x - p.s} ${p.y} L ${p.x - p.s * 0.3} ${p.y - p.s * 0.3} Z`}
            fill="#ffd76a"
          >
            <animate attributeName="opacity" values="0.3;1;0.3" dur="1.6s" repeatCount="indefinite" />
          </path>
        ))}
      </g>
    );
  }
  return null;
}

const AvatarV2 = forwardRef<AvatarV2Handle, AvatarV2Props>(function AvatarV2(
  { frame, size = 88, coat, className = "" },
  _ref,
) {
  const pal = COAT_PALETTES[coat];
  const ex = frame.extras;
  const look = frame.eyes.look ?? { dx: 0, dy: 0 };
  const bodyScaleY = (frame.squashY ?? 1) * 1;
  const bodyScaleX = frame.squashX ?? 1;

  return (
    <svg
      viewBox={`0 0 ${VB} ${VB}`}
      width={size}
      height={size}
      className={`pet-avatar ${className}`}
      role="img"
      aria-label="轻宜"
    >
      <defs>
        <radialGradient id={`petBody-${coat}`} cx="38%" cy="32%" r="80%">
          <stop offset="0%" stopColor={pal.hi} stopOpacity="0.9" />
          <stop offset="55%" stopColor={pal.main} />
          <stop offset="100%" stopColor={pal.main} stopOpacity="0.9" />
        </radialGradient>
      </defs>

      {/* 特效层画在身体之上、可投影在身后 */}
      {ex?.fx && <FxLayer extras={ex} coat={pal} />}

      <g
        transform={`translate(${VB / 2} ${CY + frame.dy}) scale(${bodyScaleX.toFixed(3)} ${bodyScaleY.toFixed(3)}) rotate(${frame.rotate ?? 0})`}
      >
        {/* 身体 */}
        <path d={frame.bodyPath} fill={`url(#petBody-${coat})`} />
        {/* 高光 */}
        <ellipse cx={-9} cy={-16} rx={7} ry={4.4} fill="#fff" opacity={0.28} transform="rotate(-18 -9 -16)" />
      </g>

      {/* 眼睛 + 嘴（相对身体中心但不受 squash 太强影响） */}
      <g transform={`translate(${VB / 2} ${CY + frame.dy})`}>
        {/* 眼睛：两只，间距由表情决定 */}
        <EyeSVG
          style={frame.eyes.style}
          cx={-9}
          baseY={-6}
          scale={1}
          irisScale={frame.eyes.irisScale ?? 1}
          look={look}
          blink={frame.blink}
          coat={pal}
          side="l"
        />
        <EyeSVG
          style={frame.eyes.style}
          cx={9}
          baseY={-6}
          scale={1}
          irisScale={frame.eyes.irisScale ?? 1}
          look={look}
          blink={frame.blink}
          coat={pal}
          side="r"
        />
        <MouthSVG spec={frame.mouth} coat={pal} />

        {/* 腮红 / 汗滴 / 叹号 / × / 星 / 心 */}
        {ex?.blush && (
          <>
            <ellipse cx={-22} cy={6} rx={3.6} ry={2.2} fill={pal.cheek} opacity={0.9} />
            <ellipse cx={22} cy={6} rx={3.6} ry={2.2} fill={pal.cheek} opacity={0.9} />
          </>
        )}
        {ex?.sweat && (
          <path d="M 42 2 Q 46 -4 46 2 A 4 4 0 1 1 42 2 Z" fill="#8ec9ff" />
        )}
        {ex?.exclaim && (
          <g transform="translate(64 -6)">
            <circle cx={0} cy={-7} r={3.2} fill={pal.line} />
            <rect x={-1.8} y={-2} width={3.6} height={10} rx={1.6} fill={pal.line} />
          </g>
        )}
        {ex?.crossMark && (
          <g transform="translate(64 -4)" stroke="#d64545" strokeWidth={3.4} strokeLinecap="round">
            <line x1={-5} y1={-5} x2={5} y2={5} />
            <line x1={5} y1={-5} x2={-5} y2={5} />
          </g>
        )}
        {ex?.heart && (
          <g transform="translate(44 -2)">
            <path d="M 0 6 C -7 -3 -4 -10 0 -3 C 4 -10 7 -3 0 6 Z" fill="#f6a9c0">
              <animate attributeName="opacity" values="0.4;1;0.4" dur="1.2s" repeatCount="indefinite" />
            </path>
          </g>
        )}
        {typeof ex?.stars === "number" &&
          ex.stars > 0 &&
          Array.from({ length: ex.stars }).map((_, i) => (
            <polygon
              key={i}
              points={starPoints(24 + i * 26, -6, 4.4, 2)}
              fill="#ffd76a"
              transform={`translate(${(i % 2) * 6} ${i % 3 === 0 ? -6 : 0})`}
            />
          ))}
      </g>
    </svg>
  );
});

export { AvatarV2 };
