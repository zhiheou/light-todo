import { useEffect, useState } from "react";
import type { Mode, Task, Memo } from "../types";
import { loadTasks } from "../lib/tasks";
import { loadWorkMemos } from "../lib/memos";
import PetShell from "./PetShell";
import MascotAssistant from "./MascotAssistant";
import { loadPetSkin } from "../lib/petSkin";
import { answer, type BrainCtx } from "../lib/mascotBrain";

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

  const ctx: BrainCtx = { tasks, persona: mode as "work" | "personal" };

  return (
    <div className="desktop-pet-root">
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
