import { useEffect, useRef, useState } from "react";
import type { Mode, Task, Memo } from "../types";
import { loadTasks, saveTasks } from "../lib/tasks";
import { loadWorkMemos, saveWorkMemos } from "../lib/memos";
import MascotAssistant from "./MascotAssistant";
import { answer, type BrainCtx } from "../lib/mascotBrain";
import { hasStoredSession, isDesktopApp, reportLoginState, startHitAreaHeartbeat } from "../lib/desktopBridge";

/**
 * 桌面版薄壳（Electron 用，v3.9）
 *
 * 只在 `?desktop=pet` 时渲染：整页透明，只放桌宠 + 聊天面板。
 * 桌宠本体由 MascotAssistant 内部渲染（不要再在这里加一个 PetShell，会叠成两只）。
 *
 * 数据：从 localStorage 读（桌面版首次需在线上域名登录一次以同步 E2EE 数据，
 *       之后本机有缓存即可用）。
 */
export default function DesktopPetApp({ mode = "work" }: { mode?: Mode }) {
  const [tasks, setTasks] = useState<Task[]>(() => loadTasks(mode as Mode));
  const [memos, setMemos] = useState<Memo[]>(() => loadWorkMemos());

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

  // v3.9.4 登录状态回报（关键：决定主进程显示桌宠还是弹登录窗）
  //
  // 这里**必须**报真实值，不能无条件 true。踩过的坑：
  // 无会话冷启动时，main.tsx 不报，本壳却无条件报 true → 主进程显示桌宠
  // + 6 秒兜底被"已收到回报"压掉 → 登录窗永远不弹，用户对着没数据的桌宠发呆。
  //
  // 会话存在 localStorage（同源同 partition 两个窗口共享），所以本窗口读得到。
  useEffect(() => {
    reportLoginState(hasStoredSession());
  }, []);

  // v3.9.11 可点区域的"心跳重发"：鼠标静止时也定期上报，
  // 防止主进程的接管判定停在旧值（表现为"点在按钮上却穿透"）。
  useEffect(() => {
    if (!isDesktopApp()) return;
    startHitAreaHeartbeat();
  }, []);

  /**
   * v3.9.11 🔴 删掉了页面侧的"穿透切换"控制器（原本在 onPointerMove 里调 setIgnoreMouseEvents）。
   *
   * 为什么必须删（用户反馈"右键那么多功能没有一个可以用的"，追查三天才找到的真根因）：
   * 主进程每 60ms 轮询一次鼠标位置，按**页面上报的完整可点区域**（宠物 ∪ 聊天面板 ∪ **右键菜单**）
   * 决定要不要接管鼠标 —— 这是 v3.9.7 之后唯一正确的判定源。
   * 而页面侧这段旧代码**只认 .pet-shell 和 .mascot-panel，不认 .pet-menu**，
   * 于是鼠标一移到右键菜单上就：
   *   页面 -> "不在宠物上" -> 设成穿透
   *   主进程（60ms 后）-> "菜单在可点区域内" -> 设成接管
   * 两边以 16Hz 互相覆盖。鼠标移动比 60ms 快得多 -> **页面赢** -> 一直处于穿透 ->
   * 点击直接穿到桌面 -> 用户看到的就是"点了没反应"。
   *
   * 现在只留主进程一个控制器（`startPetHoverWatch` + `pet-hitbox` 上报），
   * 页面只负责如实上报"哪些矩形可以点"（见 src/lib/desktopBridge.ts 的 registerHitArea）。
   */
  const rootRef = useRef<HTMLDivElement>(null);

  return (
    <div className="desktop-pet-root" ref={rootRef}>
      {/*
        桌宠只由 MascotAssistant 渲染一次。
        v3.9.4 修：此前这里额外渲染了一个 <PetShell>，而 MascotAssistant 内部也会渲染一个，
        两只像素级重叠 → 拖拽时"一只跟着走一只原地不动"、"隐藏轻宜"只藏掉一只（看起来像按钮失灵）。
        正确做法是只保留带完整对话/情绪状态的那一只（MascotAssistant 里的）。
      */}
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
