import { useEffect, useRef, useState } from "react";
import type {
  PetCoatKey,
  PetDock,
  PetExpressionId,
  PetFrame,
  PetSkin,
} from "../types";
import { AvatarV2 } from "./AvatarV2";
import { createPetEngine, type EngineHandle } from "../lib/petEngine";
import { loadPetDock, savePetDock } from "../lib/petSkin";

export type PetMenuAction = "chat" | "expression" | "studio" | "settings" | "hide";

export interface PetShellProps {
  mode: "work" | "personal";
  skin: PetSkin;
  /** 当前主导表情（idle/thinking/typing/...） */
  expression: PetExpressionId;
  /** 一次性动作：给一个 key 触发（PetShell 内部 playExpression） */
  actKey?: number;
  /** 聊天面板是否打开 */
  chatOpen?: boolean;
  /** 待播放的一次性动作 id（每次 actKey 变化触发一次） */
  actId?: PetExpressionId | null;
  unread?: number;
  coatKey: PetCoatKey;
  onMenu: (action: PetMenuAction) => void;
  onSingleClick: () => void;
  onDoubleClick: () => void;
}

const PX: Record<"s" | "m" | "l", number> = { s: 46, m: 64, l: 86 };

export default function PetShell({
  mode,
  skin,
  expression,
  actId,
  actKey = 0,
  chatOpen,
  unread = 0,
  coatKey,
  onMenu,
  onSingleClick,
  onDoubleClick,
}: PetShellProps) {
  const px = PX[skin.size] ?? PX.m;
  const [frame, setFrame] = useState<PetFrame | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [dock, setDock] = useState<PetDock | null>(() => loadPetDock());
  const drag = useRef<{
    id: number;
    sx: number;
    sy: number;
    dx0: number;
    dy0: number;
    moved: boolean;
  } | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<EngineHandle | null>(null);
  if (!engineRef.current) {
    engineRef.current = createPetEngine({ shape: skin.shape });
  }

  // 引擎帧订阅
  useEffect(() => {
    const eng = engineRef.current!;
    const off = eng.onFrame(setFrame);
    eng.start();
    return () => {
      off();
      eng.stop();
    };
  }, []);

  // 主导表情喂给引擎
  useEffect(() => {
    engineRef.current?.setInput({ expression });
  }, [expression]);

  // 一次性动作
  useEffect(() => {
    if (actId && actKey > 0) {
      engineRef.current?.playExpression(actId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actKey]);

  // 菜单外点关闭
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menu]);

  const position = skin.position;

  // 拖拽 / 单击（拖拽仅 free 模式；单击任何模式都开聊天）
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
    // 只有 free 模式才捕获后续移动（拖拽），否则放走给 click
    if (position === "free") el.setPointerCapture(e.pointerId);
  }
  function onMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (position !== "free") return;
    const nx = e.clientX - d.sx + d.dx0;
    const ny = e.clientY - d.sy + d.dy0;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 5) d.moved = true;
    if (d.moved) {
      const maxX = window.innerWidth - px;
      const maxY = window.innerHeight - px;
      setDock({ x: Math.max(0, Math.min(maxX, nx)), y: Math.max(0, Math.min(maxY, ny)) });
    }
  }
  function onUp(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (d.moved) {
      savePetDock(dock); // 位置持久化
    } else if (position === "free") {
      onSingleClick(); // 自由模式：未移动 = 单击
    }
    // 非 free：交给 onClick（下方）
  }
  function onDbl(e: React.MouseEvent) {
    e.preventDefault();
    onDoubleClick();
  }
  function onCtx(e: React.MouseEvent) {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  }
  // 非 free（corner/bottom）：单击直接开聊天（不参与拖拽，由 onClick 兜底）
  function onClickFallback() {
    if (position !== "free") onSingleClick();
  }

  // 位置样式
  let style: React.CSSProperties;
  if (position === "free" && dock) {
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
    chatOpen ? "pet-with-panel" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      {frame && (
        <div
          ref={shellRef}
          className={shellCls}
          style={style}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onClick={onClickFallback}
          onDoubleClick={onDbl}
          onContextMenu={onCtx}
          title="轻宜 · 拖我到别处 · 双击逗逗我 · 右键菜单"
          aria-label="轻宜"
        >
          <AvatarV2 frame={frame} size={px} coat={coatKey} />
          {unread > 0 && <span className="pet-unread">{unread > 9 ? "9+" : unread}</span>}
        </div>
      )}
      {menu && (
        <div className="pet-menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={() => { onMenu("chat"); setMenu(null); }}>💬 说说话</button>
          <button type="button" onClick={() => { onMenu("expression"); setMenu(null); }}>🎭 换个表情</button>
          <button type="button" onClick={() => { onMenu("studio"); setMenu(null); }}>🖌 表情动作馆</button>
          <button type="button" onClick={() => { onMenu("settings"); setMenu(null); }}>⚙ 皮肤与行为</button>
          <div className="pet-menu-sep" />
          <button type="button" className="danger" onClick={() => { onMenu("hide"); setMenu(null); }}>🙈 隐藏轻宜</button>
        </div>
      )}
    </>
  );
}
