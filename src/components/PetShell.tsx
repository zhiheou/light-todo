import { useEffect, useRef, useState } from "react";
import type { PetDock, PetExpressionId, PetSkin } from "../types";
import { BloubAvatar } from "./BloubAvatar";
import type { Look } from "../lib/bloub/engine";
import type { StateId } from "../lib/bloub/states";
import { actionToState, expressionToState } from "../lib/petBodyMap";
import { flingVelocity, stepPhysics, type PhysicsState, type TrailSample } from "../lib/petPhysics";
import { petChatter } from "../lib/petChatter";
import { clearPetDock, loadPetDock, savePetDock } from "../lib/petSkin";

export type PetMenuAction = "chat" | "expression" | "config" | "hide";

export interface PetShellProps {
  mode: "work" | "personal";
  skin: PetSkin;
  /** 当前主导表情（映射成 bloub 形变态） */
  expression: PetExpressionId;
  /** 一次性动作 id（actKey 变化时播一次，播完回 expression 对应态） */
  actId?: PetExpressionId | null;
  actKey?: number;
  /** 形态馆「试玩」：设定则持续显示该 bloub 态（不受 expression 覆盖） */
  previewState?: StateId | null;
  chatOpen?: boolean;
  unread?: number;
  coatKey: PetSkin["coat"];
  onMenu: (action: PetMenuAction) => void;
  onSingleClick: () => void;
  onDoubleClick: () => void;
  /** 撞墙（甩飞撞到屏幕边缘）时通知外层播"哎哟" */
  onHitWall?: () => void;
  /** 桌宠当前位置（供聊天气泡跟随） */
  onPosition?: (r: { x: number; y: number; w: number; h: number }) => void;
}

const PX: Record<"s" | "m" | "l", number> = { s: 56, m: 76, l: 104 };

/**
 * 尺寸随设备按屏占比：目标 = 屏宽 9% 的桌宠（桌面 L≈104 时约 1150px 屏以下按比例缩，
 * 手机 390px→35px 占 9%，比固定乘 0.72 更协调）。s/m/l 彼此成比例。
 */
function responsivePx(size: "s" | "m" | "l"): number {
  const base = PX[size] ?? PX.m;
  const ratio = base / PX.l; // 相对 L
  const targetL = Math.min(PX.l, Math.max(PX.s * 0.7, window.innerWidth * 0.09));
  return Math.round(targetL * ratio);
}

export default function PetShell({
  mode,
  skin,
  expression,
  actId,
  actKey = 0,
  previewState,
  unread = 0,
  coatKey,
  onMenu,
  onSingleClick,
  onDoubleClick,
  onHitWall,
  onPosition,
}: PetShellProps) {
  const [px, setPx] = useState(() => responsivePx(skin.size));
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [dock, setDock] = useState<PetDock | null>(() => loadPetDock());
  const [displayState, setDisplayState] = useState<StateId>(() => expressionToState(expression));
  const [look, setLook] = useState<Look | null>(null);
  const [microTip, setMicroTip] = useState<string | null>(null);
  const tipTimer = useRef<number | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const actTimer = useRef<number | null>(null);
  const drag = useRef<{
    id: number;
    sx: number;
    sy: number;
    dx0: number;
    dy0: number;
    moved: boolean;
  } | null>(null);
  /** 拖拽过程中的最新落点（onUp 持久化用，避免闭包读旧值） */
  const lastDock = useRef<PetDock>({ x: 0, y: 0 });
  /** 拖拽轨迹（甩飞速度估算用） */
  const trail = useRef<TrailSample[]>([]);
  /** 是否正在物理飞行 */
  const flying = useRef(false);
  const phys = useRef<PhysicsState>({ x: 0, y: 0, vx: 0, vy: 0 });
  const wobble = useRef(0); // 撞墙后轻微旋转抖动角度
  const hitCooldown = useRef(0); // 撞墙 act 冷却，防连刷

  const position = skin.position;

  // 尺寸随窗口/皮肤大小变化（resize / orientation）
  useEffect(() => {
    const update = () => setPx(responsivePx(skin.size));
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skin.size]);

  // 桌宠位置上报（dock/position/尺寸变化或拖拽/飞行后给外层定位聊天气泡用）
  const lastReported = useRef("");
  useEffect(() => {
    const el = shellRef.current;
    if (!el || !onPosition) return;
    const r = el.getBoundingClientRect();
    const key = `${Math.round(r.x)},${Math.round(r.y)}`;
    if (key === lastReported.current) return;
    lastReported.current = key;
    onPosition({ x: r.x, y: r.y, w: r.width, h: r.height });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dock, position, px, skin.size, flying.current]);

  // 主导表情变化 → 形变态（清掉一次性动作的返回定时）
  useEffect(() => {
    if (actTimer.current) window.clearTimeout(actTimer.current);
    actTimer.current = null;
    setDisplayState(expressionToState(expression));
  }, [expression]);

  // 灵动小字：chatter 开且闲置时，偶尔在头顶冒一句话；按场景从文案库取，避免复读
  const chatterOn = skin.chatter !== false;
  function popTip(text: string) {
    if (!chatterOn) return;
    setMicroTip(text);
    if (tipTimer.current) window.clearTimeout(tipTimer.current);
    tipTimer.current = window.setTimeout(() => setMicroTip(null), 3800);
  }
  useEffect(() => {
    if (!chatterOn) return;
    let timer: number | null = null;
    const loop = () => {
      // 只在桌宠闲置(非拖拽/飞行/试玩)时搭话
      const isIdle = expression === "idle" || expression === "blink";
      if (isIdle && !drag.current && !flying.current && !menu) {
        // 多数时候正经闲聊，偶尔来句怪话，保持新鲜
        const quirky = Math.random() < 0.3;
        popTip(quirky ? petChatter.quirky() : petChatter.idle());
      }
      timer = window.setTimeout(loop, 14000 + Math.random() * 16000);
    };
    timer = window.setTimeout(loop, 7000);
    return () => { if (timer) window.clearTimeout(timer); if (tipTimer.current) window.clearTimeout(tipTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatterOn]);

  // 一次性动作：播到对应 state，稍后回到主导态
  useEffect(() => {
    if (!actId || actKey <= 0) return;
    if (actTimer.current) window.clearTimeout(actTimer.current);
    setDisplayState(actionToState(actId));
    actTimer.current = window.setTimeout(() => {
      setDisplayState(expressionToState(expression));
      actTimer.current = null;
    }, 1400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actKey]);

  // 形态馆试玩：指定则持续显示
  useEffect(() => {
    if (previewState) setDisplayState(previewState);
  }, [previewState]);

  // 闲置自动随机动作：无主导动作/无试玩时，从 skin.autoStates 勾选的池里定时随机换形态
  useEffect(() => {
    const pool = (skin.autoStates ?? []).filter(Boolean);
    if (pool.length < 2) return; // 没勾选或只有一个 → 不自动
    const isIdleExpr = expression === "idle" || !expressionToState(expression) || expression === "blink";
    // 仅在"主导=idle"时自动展示（避免打断 thinking/remind 等语义表情）
    if (!isIdleExpr) return;
    // 温和形态池：只挑"静"的形变（蛋/六边/三角/思考/瞪眼/圆球），避免 burst/comet/exclaim 之类猛跳
    const gentle = pool.filter((s) =>
      ["idle", "egg", "hexagon", "play", "thinking", "wide", "wink", "notify"].includes(s as string),
    );
    const usePool = gentle.length >= 2 ? gentle : pool;
    let timer: number | null = null;
    let lastPick = "";
    const step = () => {
      // 仍处 idle 才继续换；间隔拉长到 16-28s，避免一卡一卡
      const stillIdle =
        expression === "idle" || !expressionToState(expression) || expression === "blink";
      if (stillIdle && !drag.current && !flying.current) {
        let pick = usePool[Math.floor(Math.random() * usePool.length)];
        if (pick === lastPick) pick = usePool[(usePool.indexOf(pick) + 1) % usePool.length];
        lastPick = pick;
        if (pick) setDisplayState(pick as StateId);
      }
      timer = window.setTimeout(step, 16000 + Math.random() * 12000);
    };
    timer = window.setTimeout(step, 12000);
    return () => { if (timer) window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expression, skin.autoStates]);

  useEffect(() => {
    return () => {
      if (actTimer.current) window.clearTimeout(actTimer.current);
    };
  }, []);

  // ---- 甩飞物理循环：直写 DOM，落定后 commit dock ----
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!flying.current || document.hidden) {
        last = now;
        return;
      }
      const el = shellRef.current;
      if (!el) return;
      const dt = (now - last) / 1000;
      last = now;
      const maxX = window.innerWidth - px;
      const maxY = window.innerHeight - px;
      const r = stepPhysics(phys.current, dt, { minX: 0, minY: 0, maxX, maxY });
      phys.current = r.state;
      el.style.left = `${r.state.x}px`;
      el.style.top = `${r.state.y}px`;
      el.style.right = "auto";
      el.style.bottom = "auto";

      // 撞墙：轻微旋转抖一下 + 冷却触发"哎哟"
      if (r.hit) {
        wobble.current = (r.hit === "x" || r.hit === "both" ? 7 : -7);
        if (performance.now() - hitCooldown.current > 500) {
          hitCooldown.current = performance.now();
          popTip(petChatter.hitWall());
          onHitWall?.();
        }
      }
      // 旋转抖动衰减
      if (wobble.current !== 0) {
        el.style.transform = `rotate(${wobble.current.toFixed(1)}deg)`;
        wobble.current *= 0.82;
        if (Math.abs(wobble.current) < 0.5) {
          wobble.current = 0;
          el.style.transform = "";
        }
      }

      if (r.settled) {
        flying.current = false;
        const final = { x: Math.round(r.state.x), y: Math.round(r.state.y) };
        setDock(final);
        savePetDock(final);
        lastReported.current = "";
        onPosition?.({ x: final.x, y: final.y, w: px, h: px });
        if (chatterOn) popTip(petChatter.landed());
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [px]);

  // 菜单外点关闭
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menu]);

  // ---- 拖拽：任何位置都能拖（拖=移动并落 free 定位 + 记住）；单击开聊 ----
  // 拖拽过程直写 DOM left/top（不 setState），只在释放时一次性 commit → 不触发逐帧 React 重渲染
  const draggable = skin.behaviors.includes("draggable");
  function onDown(e: React.PointerEvent) {
    // 只处理左键拖拽；右键留给菜单
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const el = shellRef.current;
    if (!el) return;
    // 每次按下清空轨迹，避免上一段拖拽残留影响甩速估算
    trail.current = [];
    const d0 = dock?.x ?? 0;
    const d1 = dock?.y ?? 0;
    drag.current = {
      id: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      dx0: d0,
      dy0: d1,
      moved: false,
    };
    el.setPointerCapture(e.pointerId);
    // 被抓住时冒一句（偶尔，避免每次都打扰）
    if (chatterOn && Math.random() < 0.6) popTip(petChatter.held());
  }
  function onMove(e: React.PointerEvent) {
    const d = drag.current;
    const el = shellRef.current;
    if (!d || d.id !== e.pointerId || !el) return;
    if (!draggable) return; // 关闭拖拽：不移动也不甩
    // 记录轨迹（甩飞速度估算）
    trail.current.push({ t: performance.now(), x: e.clientX, y: e.clientY });
    if (trail.current.length > 10) trail.current.shift();
    const nx = e.clientX - d.sx + d.dx0;
    const ny = e.clientY - d.sy + d.dy0;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 5) d.moved = true;
    if (d.moved) {
      const maxX = window.innerWidth - px;
      const maxY = window.innerHeight - px;
      const clamped = { x: Math.max(0, Math.min(maxX, nx)), y: Math.max(0, Math.min(maxY, ny)) };
      // 直写 DOM（合成后的定位是 left/top），避免每次 move setState
      el.style.left = `${clamped.x}px`;
      el.style.top = `${clamped.y}px`;
      el.style.right = "auto";
      el.style.bottom = "auto";
      lastDock.current = clamped;
    }
  }
  function onUp(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    // 右键释放不触发单击（聊天）
    const leftUp = e.button === 0 || e.button === -1 || e.pointerType !== "mouse";
    if (d.moved) {
      // 若上一段甩飞还在飞行中（未落定），这次释放只 commit dock，不重入飞行
      if (flying.current) {
        setDock(lastDock.current);
        savePetDock(lastDock.current);
        return;
      }
      // 甩飞判定：速度快且非 bottom 锚点。注意 reduced-motion 不挡"用户主动甩"——
      // 它只挡自主动画（闲置自动变形态），甩飞是用户直接操作应始终可用。
      const fling = flingVelocity(trail.current);
      const movable = position !== "bottom";
      if (fling.fast && movable) {
        const el = shellRef.current;
        if (el) {
          const r = el.getBoundingClientRect();
          phys.current = { x: r.x, y: r.y, vx: fling.vx, vy: fling.vy };
          flying.current = true;
          if (chatterOn) popTip(petChatter.thrown());
          return; // 交给物理循环，落定后 commit
        }
      }
      setDock(lastDock.current); // 普通拖拽：释放时 commit React state
      savePetDock(lastDock.current);
    } else if (leftUp) {
      onSingleClick();
    }
  }
  function onCtx(e: React.MouseEvent) {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  }

  // 注视跟随：窗口级 pointermove——鼠标在屏幕任何位置宠物都看过去（bloub 的 gaze 语义）
  // 节流 + 只在位移够大时更新，避免每 mousemove setState
  const lookTimer = useRef(0);
  const lastLook = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const el = shellRef.current;
      if (!el) return;
      if (flying.current || drag.current) return; // 飞行/拖拽时不跟随
      const now = performance.now();
      if (now - lookTimer.current < 50) return;
      const r = el.getBoundingClientRect();
      // 相对宠物中心归一（±1 = 半屏外）
      const dx = ((e.clientX - (r.x + r.width / 2)) / r.width) * 2;
      const dy = ((e.clientY - (r.y + r.height / 2)) / r.height) * 2;
      if (Math.hypot(dx - lastLook.current.x, dy - lastLook.current.y) < 0.1) return;
      lastLook.current = { x: dx, y: dy };
      lookTimer.current = now;
      setLook({
        yaw: Math.max(-34, Math.min(34, dx * 16)),
        pitch: Math.max(-28, Math.min(28, -dy * 13)),
        mix: 0.8,
        spin: 0,
        wander: 0.25,
      });
    };
    const onLeaveDoc = () => setLook(null);
    window.addEventListener("pointermove", onMove);
    document.addEventListener("pointerleave", onLeaveDoc);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeaveDoc);
    };
  }, [px]);

  // 位置样式：拖过后 dock 有值 → free；否则按 skin.position
  let style: React.CSSProperties;
  if (dock && position !== "bottom") {
    style = { left: dock.x, top: dock.y };
  } else if (position === "bottom") {
    style = { left: "50%", transform: "translateX(-50%)", bottom: 76 };
  } else {
    style = { right: 18, bottom: 18 };
  }

  const shellCls = [
    "pet-shell",
    `pet-${position}`,
    mode === "personal" ? "pet-personal" : "pet-work",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <div
        ref={shellRef}
        className={shellCls}
        style={{ ...style, width: px, height: px }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onContextMenu={onCtx}
        onDoubleClick={(e) => {
          e.preventDefault();
          if (chatterOn) popTip(petChatter.petted());
          onDoubleClick();
        }}
        title="轻宜 · 拖我到别处 · 双击逗逗我 · 右键菜单"
        aria-label="轻宜"
      >
        <BloubAvatar
          state={displayState}
          coat={coatKey}
          size={px}
          look={look}
          behaviors={{
            blink: skin.behaviors.includes("blink"),
            breathe: skin.behaviors.includes("breathe"),
          }}
        />
        {microTip && <div className="pet-microtip">{microTip}</div>}
        {unread > 0 && <span className="pet-unread">{unread > 9 ? "9+" : unread}</span>}
      </div>

      {menu && (
        <div className="pet-menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={() => { onMenu("chat"); setMenu(null); }}>💬 说说话</button>
          <button type="button" onClick={() => { onMenu("expression"); setMenu(null); }}>🎭 玩个动作</button>
          <button type="button" onClick={() => { onMenu("config"); setMenu(null); }}>⚙ 动作与设置</button>
          <div className="pet-menu-sep" />
          <button type="button" className="danger" onClick={() => { onMenu("hide"); setMenu(null); }}>🙈 隐藏轻宜</button>
          {dock && (
            <>
              <div className="pet-menu-sep" />
              <button type="button" onClick={() => { clearPetDock(); setDock(null); setMenu(null); }}>
                📍 回右下角
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
