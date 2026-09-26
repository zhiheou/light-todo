import { useCallback, useEffect, useRef, useState } from "react";
import type { Mode, Task, Memo } from "../types";
import { loadTasks, saveTasks } from "../lib/tasks";
import { loadWorkMemos, saveWorkMemos } from "../lib/memos";
import PetShell from "./PetShell";
import MascotAssistant from "./MascotAssistant";
import { loadPetSkin } from "../lib/petSkin";
import { answer, type BrainCtx } from "../lib/mascotBrain";
import { reportLoginState } from "../lib/desktopBridge";

/**
 * 桌面版薄壳（Electron 用，v3.9）
 *
 * 只在 `?desktop=pet` 时渲染：整页透明，只放桌宠 + 聊天面板。
 * 复用全部现有组件（PetShell / MascotAssistant / bloub 引擎），零重写。
 *
 * 数据：从 localStorage 读（桌面版首次需在线上域名登录一次以同步 E2EE 数据，
 *       之后本机有缓存即可用）。
 */
export default function DesktopPetApp({ mode = "work" }: { mode?: Mode }) {
  const [tasks, setTasks] = useState<Task[]>(() => loadTasks(mode as Mode));
  const [memos, setMemos] = useState<Memo[]>(() => loadWorkMemos());
  const [skin] = useState(() => loadPetSkin(mode as Mode));

  // 桌面模式：整页透明（Electron 才能看到"只有宠物"）
  useEffect(() => {
    document.documentElement.classList.add("desktop-pet-mode");
    document.body.style.background = "transparent";
    const root = document.getElementById("root");
    if (root) root.style.background = "transparent";
    return () => {
      document.documentElement.classList.remove("desktop-pet-mode");
    };
  }, []);

  // v3.9 数据落盘：任务/备忘变化即写本机（否则关掉桌宠窗口，刚记的就没了）
  useEffect(() => {
    saveTasks(mode as Mode, tasks);
  }, [tasks, mode]);
  useEffect(() => {
    saveWorkMemos(memos);
  }, [memos]);

  // v3.9 与主窗口同步：主窗口改了数据（同源 localStorage）→ 本窗口跟着更新
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "lighttodo:work:v1" || e.key === "lighttodo:personal:v1") {
        setTasks(loadTasks(mode as Mode));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [mode]);

  const ctx: BrainCtx = { tasks, persona: mode as "work" | "personal" };

  // v3.9.4 登录状态回报：主进程据此决定显示桌宠还是弹登录窗。
  // 本壳只在已登录时被 App 渲染，所以直接报 true。
  useEffect(() => {
    reportLoginState(true);
  }, []);

  // v3.9 桌面版关键：鼠标穿透动态切换
  // 默认整窗穿透（透明区域不挡其他程序）；鼠标进入宠物像素范围时接管，移出立即恢复穿透。
  // 不做这个的话：宠物的点击/拖拽全部收不到（主进程建窗时就设了全窗穿透）。
  // 注：主进程另有 60ms 轮询做同一件事（更可靠），这里是页面侧的第一道响应，两者不冲突。
  const rootRef = useRef<HTMLDivElement>(null);
  const petAPI = (window as unknown as { petAPI?: {
    setIgnoreMouseEvents: (b: boolean) => void;
    moveWindow: (dx: number, dy: number) => void;
    openMainWindow: () => void;
    closeMainWindow: () => void;
    setPetSize: (px: number) => void;
    reportLogin: (b: boolean) => void;
  } }).petAPI;
  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!petAPI) return;
      const t = e.target as HTMLElement;
      // 命中宠物本体或对话面板 → 接管鼠标；否则穿透
      const hit = !!(t.closest(".pet-shell") || t.closest(".mascot-panel"));
      petAPI.setIgnoreMouseEvents(!hit);
    },
    [petAPI],
  );

  return (
    <div className="desktop-pet-root" ref={rootRef} onPointerMove={onPointerMove}>
      <PetShell
        mode={mode as Mode}
        skin={skin}
        expression="idle"
        coatKey={skin.coat}
        onMenu={(a) => {
          if (a === "chat") window.dispatchEvent(new CustomEvent("pet-open-chat"));
        }}
        onSingleClick={() => window.dispatchEvent(new CustomEvent("pet-open-chat"))}
        onDoubleClick={() => void 0}
      />
      {/* 聊天面板复用现有组件（智能回答全在 MascotAssistant 里） */}
      <MascotAssistant
        mode={mode as Mode}
        tasks={tasks}
        onAddTask={(draft) => {
          const t: Task = {
            id: crypto.randomUUID(),
            title: draft.title,
            notes: draft.notes,
            priority: draft.priority,
            dueDate: draft.dueDate,
            dueTime: draft.dueTime,
            remindAt: draft.remindAt,
            repeat: draft.repeat ?? undefined,
            completed: false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          setTasks((prev) => [t, ...prev]);
        }}
        onAddMemo={(text) => setMemos((prev) => [{ id: crypto.randomUUID(), text, pinned: false, createdAt: Date.now(), updatedAt: Date.now() }, ...prev])}
        onOpenTask={() => void 0}
        onDeleteTask={(t) => setTasks((prev) => prev.filter((x) => x.id !== t.id))}
        onToggleTask={(t) => setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, completed: !x.completed } : x)))}
        onUpdateTask={(t, patch) => setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...patch } : x)))}
        deleteGranted
        onGrantDelete={() => void 0}
        nudges={[]}
      />
      {/* 让桌宠能回答"今天有什么"（复用同一套大脑） */}
      <span hidden>{answer("你好", ctx).text}</span>
      <span hidden>{memos.length}</span>
    </div>
  );
}
