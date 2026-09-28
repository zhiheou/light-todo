import { useId } from "react";
import { BRAND, faceShapes, logoViewBox } from "../../shared/brandSpec.mjs";

interface BrandMarkProps {
  /** 尺寸（px），跟旁边的文字对齐用 */
  size?: number;
  /** 无障碍标签；不传则当纯装饰（读屏跳过） */
  label?: string;
  className?: string;
  /**
   * 画法：
   *   "tile" —— 自带紫色渐变底板的完整图标（= favicon 那个样子）
   *   "face" —— 只有脸，没有底板（给已经坐在别的容器里的场合）
   */
  variant?: "tile" | "face";
  /**
   * `variant="face"` 时的脸色 / 五官色。
   *
   * ⚠️ 这两个颜色**必须互相对比**，否则五官会糊在脸上看不见。
   *    换色请照这个规矩：脸浅 → 五官深；脸深 → 五官浅。
   */
  face?: string;
  feature?: string;
}

/**
 * 轻待办品牌标记 —— 吉祥物「轻宜」的正脸。
 *
 * 以前侧边栏、登录页、下载页用的都是图标库里的通用「清单」符号（`ListTodo`），
 * 跟桌宠、跟产品没有任何关系；而网页 favicon 干脆是空的（`href="data:,"`）。
 * 现在页内 logo、浏览器标签页、桌面快捷方式、系统托盘**是同一张脸**。
 *
 * ── 为什么是 React 组件，不是 `<img src="/logo.svg">` ──
 * 里面的渐变和配色要用 CSS 变量（跟随主题色），而 `<img>` 里的 SVG 是
 * 独立文档 —— 拿不到外面的 CSS 变量、也不继承 currentColor，会渲染成黑色。
 * 所以必须内联成 JSX。（`public/logo.svg` 是同一个几何，给需要独立文件的地方用。）
 *
 * ── 几何从哪来 ──
 * `shared/brandSpec.mjs` —— 和图标生成脚本共用一份，改了那里这里跟着变。
 * 本组件**不写死任何坐标**。
 */
export default function BrandMark({
  size = 18,
  label,
  className = "",
  variant = "tile",
  face = BRAND.shine,
  feature = `var(--on-accent, ${BRAND.on})`,
}: BrandMarkProps) {
  const vb = logoViewBox();
  // ⚠️ 页内可能同时出现好几个 BrandMark。渐变 id 必须每个实例唯一，
  //    写死的话同页会出现重复 id —— 浏览器只认第一个，后面的会拿错渐变。
  const gid = `${BRAND.gradientIdPrefix}-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <svg
      viewBox={`${vb.x} ${vb.y} ${vb.size} ${vb.size}`}
      width={size}
      height={size}
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {variant === "tile" && (
        <>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={BRAND.lit} />
              <stop offset="1" stopColor={BRAND.deep} />
            </linearGradient>
          </defs>
          <rect
            x={vb.x}
            y={vb.y}
            width={vb.size}
            height={vb.size}
            rx={vb.size * BRAND.cornerRatio}
            fill={`url(#${gid})`}
          />
        </>
      )}
      {faceShapes({
        faceFill: face,
        featureFill: feature,
        withBlush: false, // 小尺寸下腮红是脏点
      }).map((s, i) => {
        if (s.kind === "circle") {
          return <circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill={s.fill} />;
        }
        if (s.kind === "ellipse") {
          return (
            <ellipse key={i} cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} fill={s.fill} opacity={s.opacity} />
          );
        }
        return (
          <path
            key={i}
            d={s.d}
            fill={s.fill}
            stroke={s.stroke}
            strokeWidth={s.strokeWidth}
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}
