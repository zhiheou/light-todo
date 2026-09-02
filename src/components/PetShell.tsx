import { useEffect, useRef, useState } from "react";
import type { PetDock, PetExpressionId, PetSkin } from "../types";
import { BloubAvatar } from "./BloubAvatar";
import type { Look } from "../lib/bloub/engine";
import type { StateId } from "../lib/bloub/states";
import { actionToState, expressionToState } from "../lib/petBodyMap";
import { clearPetDock, loadPetDock, savePetDock } from "../lib/petSkin";

export type PetMenuAction = "chat" | "expression" | "studio" | "settings" | "hide";

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
}

const PX: Record<"s" | "m" | "l", number> = { s: 56, m: 76, l: 104 };

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
}: PetShellProps) {
  const px = PX[skin.size] ?? PX.m;
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [dock, setDock] = useState<PetDock | null>(() => loadPetDock());
  const [displayState, setDisplayState] = useState<StateId>(() => expressionToState(expression));
  const [look, setLook] = useState<Look | null>(null);
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

  const position = skin.position;

  // 主导表情变化 → 形变态（清掉一次性动作的返回定时）
  useEffect(() => {
    if (actTimer.current) window.clearTimeout(actTimer.current);
    actTimer.current = null;
    setDisplayState(expressionToState(expression));
  }, [expression]);

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

  useEffect(() => {
    return () => {
      if (actTimer.current) window.clearTimeout(actTimer.current);
    };
  }, []);

  // 菜单外点关闭
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menu]);

  // ---- 拖拽：任何位置都能拖（拖=移动并落 free 定位 + 记住）；单击开聊 ----
  function onDown(e: React.PointerEvent) {
    const el = shellRef.current;
    if (!el) return;
    drag.current = {
      id: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      dx0: dock?.x ?? 0,
      dy0: dock?.y ?? 0,
      moved: false,
    };
    el.setPointerCapture(e.pointerId);
  }
  function onMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const nx = e.clientX - d.sx + d.dx0;
    const ny = e.clientY - d.sy + d.dy0;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 5) d.moved = true;
    if (d.moved) {
      const maxX = window.innerWidth - px;
      const maxY = window.innerHeight - px;
      const clamped = { x: Math.max(0, Math.min(maxX, nx)), y: Math.max(0, Math.min(maxY, ny)) };
      setDock(clamped);
      // 记录最新落点供 onUp 持久化（避免闭包读到未提交的旧值）
      lastDock.current = clamped;
    }
  }
  function onUp(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (d.moved) {
      savePetDock(lastDock.current); // 持久化最终落点
    } else {
      onSingleClick();
    }
  }
  function onCtx(e: React.MouseEvent) {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  }

  // 注视跟随：鼠标在宠物上时轻微看过来
  function onOver(e: React.MouseEvent) {
    const el = shellRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = ((e.clientX - (r.x + r.width / 2)) / r.width) * 2;
    const dy = ((e.clientY - (r.y + r.height / 2)) / r.height) * 2;
    setLook({
      yaw: Math.max(-30, Math.min(30, dx * 26)),
      pitch: Math.max(-26, Math.min(26, -dy * 20)),
      mix: 0.85,
      spin: 0,
      wander: 0.2,
    });
  }
  function onLeave() {
    setLook(null);
  }

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
        onMouseMove={onOver}
        onMouseLeave={onLeave}
        onDoubleClick={(e) => {
          e.preventDefault();
          onDoubleClick();
        }}
        title="轻宜 · 拖我到别处 · 双击逗逗我 · 右键菜单"
        aria-label="轻宜"
      >
        <BloubAvatar state={displayState} coat={coatKey} size={px} look={look} />
        {unread > 0 && <span className="pet-unread">{unread > 9 ? "9+" : unread}</span>}
      </div>

      {menu && (
        <div className="pet-menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={() => { onMenu("chat"); setMenu(null); }}>💬 说说话</button>
          <button type="button" onClick={() => { onMenu("expression"); setMenu(null); }}>🎭 换个表情</button>
          <button type="button" onClick={() => { onMenu("studio"); setMenu(null); }}>🖌 表情动作馆</button>
          <button type="button" onClick={() => { onMenu("settings"); setMenu(null); }}>⚙ 皮肤与行为</button>
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
