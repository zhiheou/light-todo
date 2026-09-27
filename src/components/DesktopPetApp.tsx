import { useEffect, useRef, useState } from "react";
import type { Mode, Task, Memo } from "../types";
import { loadTasks, loadTasksNoTombstoneBurn, noteTaskDeleted, saveTasks } from "../lib/tasks";
import { loadWorkMemos, saveWorkMemos } from "../lib/memos";
import { claimLocalData } from "../lib/syncLock";
import { getStoredSession } from "../lib/session";
import { computeDueReminders, loadNotified, saveNotified } from "../lib/reminder";
import MascotAssistant, { type MascotNudge } from "./MascotAssistant";
import { answer, type BrainCtx } from "../lib/mascotBrain";
import {
  hasStoredSession,
  isDesktopApp,
  reportLoginState,
  startAutoHitAreaScan,
  startHitAreaHeartbeat,
  startMouseHeldWatch,
} from "../lib/desktopBridge";

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

  /**
   * v3.9.22：本窗口**真的写数据时**，声明本机这份数据归当前账号。
   *
   * 为什么必须在这里认领：用户可能只开着桌宠、从没在主窗口登录过
   * （主窗口的会话过期后就是登录页）。主窗口登录时会判"本机数据是不是本账号的"——
   * 不认领的话，桌宠刚记的待办会被当成"上个账号的残留"清掉，本 bug 原样复发。
   *
   * 只在"从空变成有"时认领一次：不能每次写都认领，
   * 否则另一个账号登录后本窗口一写就把归属抢回来了。
   */
  const claimed = useRef(false);
  useEffect(() => {
    if (claimed.current || tasks.length === 0) return;
    const stored = getStoredSession();
    if (!stored) return;
    claimed.current = true;
    claimLocalData(stored.username);
  }, [tasks]);

  /**
   * v3.9.23 🔴 桌宠窗口自己负责到点提醒。
   *
   * 用户原话：「留桌宠，让桌宠提醒」—— 他只开着桌宠，主窗口是关着的。
   * 而提醒原来**只写在主窗口 App 里**（每 10 秒扫一次），桌宠窗口一行都没有：
   * 主窗口不在 = 提醒永远不响，不管待办上的时间设得多准。
   *
   * 弹两处，缺一不可：
   *   ① 桌宠嘴边的小气泡 —— 主窗口不在时，这是用户唯一看得见的东西
   *   ② 聊天里的一条消息 —— 错过了还能翻回去看（面板关着会记成未读小红点）
   *
   * 主窗口如果也开着，两边可能各弹一次 —— 靠同一份 `lighttodo:notified:v1:<空间>`
   * 去重：谁先弹谁登记。storage 事件有几百毫秒延迟，极端情况下会重复弹一次，
   * 但**不会漏**（宁可重复，不可漏掉）。
   */
  const notified = useRef<Set<string>>(new Set());
  const modeRef = useRef<Mode>(mode as Mode);
  modeRef.current = mode as Mode;
  const [nudges, setNudges] = useState<MascotNudge[]>([]);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  /**
   * v3.9.23：提醒气泡要**挨着桌宠**弹，不能丢在屏幕角落 ——
   * 桌宠窗口是全屏透明的，右下角一个小黑条跟桌宠离着老远，用户根本不会往那儿看。
   * 位置从 MascotAssistant 每次移动后上报的同一个键读（它自己也是从那儿恢复的）。
   */
  const [bubbleAt, setBubbleAt] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const read = () => {
      try {
        const raw = localStorage.getItem("lighttodo:pet-pos:v1");
        if (!raw) return;
        const p = JSON.parse(raw) as { x?: number; y?: number; w?: number; h?: number };
        if (typeof p.x !== "number" || typeof p.y !== "number") return;
        setBubbleAt({ x: p.x + (p.w ?? 0) + 12, y: p.y + (p.h ?? 0) / 2 - 16 });
      } catch {
        /* 没有位置记录就用兜底位置（CSS 里的右下角） */
      }
    };
    read();
    const timer = window.setInterval(read, 1000); // 桌宠会动，气泡跟着走
    return () => window.clearInterval(timer);
  }, []);
  /**
   * v3.9.23：删除授权跟主窗口用**同一份**本机记录（键名见 App.tsx 的 grantDeleteToAssistant）。
   * 两个窗口各存各的会出现"这边说授权过了、那边还问你要授权"。
   */
  const grantKey = `lighttodo:pet-delete-grant:v1.${mode}`;
  const [deleteGranted, setDeleteGranted] = useState(() => localStorage.getItem(grantKey) === "1");
  const grantDelete = () => {
    try {
      localStorage.setItem(grantKey, "1");
    } catch {
      /* 隐私模式等，忽略 */
    }
    setDeleteGranted(true);
  };
  useEffect(() => {
    // 主窗口那边授权了，这里也要跟着放开（storage 事件跨窗口可用）
    const onStorage = (e: StorageEvent) => {
      if (e.key !== grantKey) return;
      setDeleteGranted(localStorage.getItem(grantKey) === "1");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [grantKey]);
  useEffect(() => {
    notified.current = loadNotified(modeRef.current);
    const timer = window.setInterval(() => {
      const current = modeRef.current;
      // 每次都从磁盘现读：这样"刚在别处改了时间/勾了完成"立刻就生效
      const list = loadTasksNoTombstoneBurn(current);
      const due = computeDueReminders(list, notified.current, new Date());
      if (due.length === 0) return;
      for (const task of due) {
        const text = `⏰ 到点啦：${task.title}`;
        setToast({ id: Date.now() + Math.random(), text });
        setNudges((prev) => [...prev.slice(-4), { id: Date.now() + Math.random(), text }]);
        notified.current.add(task.id);
      }
      saveNotified(current, notified.current);
    }, 10000);
    return () => window.clearInterval(timer);
  }, []);

  /** 到点提醒的气泡：看一眼就够，8 秒自己走 */
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 8000);
    return () => window.clearTimeout(t);
  }, [toast]);

  // v3.9 与主窗口同步：主窗口改了数据（同源 localStorage）→ 本窗口跟着更新
  //
  // v3.9.22：**反方向也通了**。本窗口写盘时，浏览器自动给主窗口发 storage 事件，
  // 主窗口据此立刻重读（见 App.tsx 的跨窗口同步 effect）——
  // 否则用户刚在这里记的待办，会被主窗口 30 秒后的服务器拉取抹掉。
  // （同窗口自己写的不触发，所以不存在自激循环。）
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      /**
       * v3.9.23 🔴 必须是"读了不烧墓碑"的那个。
       *
       * `loadTasks` 会清掉内存里的墓碑（原来只有"新建空间"会用它，无所谓）；
       * 现在墓碑是**跨窗口防复活**的唯一凭据 —— 桌宠删掉一条 → 主窗口收到事件、
       * 把这个删除写进自己的内存墓碑 → 30 秒后拉取时挡掉服务器那份旧的。
       * 这里若用 `loadTasks`，事件一到墓碑就被烧了，拉取又把删掉的铺回来。
       */
      if (e.key === "lighttodo:work:v1") {
        setTasks(loadTasksNoTombstoneBurn(mode as Mode));
      } else if (e.key === "lighttodo:personal:v1") {
        if (mode === "personal") setTasks(loadTasksNoTombstoneBurn("personal"));
      } else if (e.key === "lighttodo:work-memos:v1") {
        setMemos(loadWorkMemos());
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
    startMouseHeldWatch(); // v3.9.13：按住鼠标键期间保持接管，防 mouseup 落到桌面
    // v3.9.17：自动扫描所有浮层（设置面板/菜单/召回按钮/聊天面板）并登记为可点击区域 ——
    // 治本：这类"漏登记导致点了没反应"已经犯过 4 次，不再靠人记得手动加。
    startAutoHitAreaScan();
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
        onDeleteTask={(t) => {
          // v3.9.23：删除要立墓碑 + 抬水位 —— 只把人从数组里拿掉的话，
          // 列表内容反而"变少了"，水位抬不动，主窗口下一次拉取就会把它复活。
          noteTaskDeleted(mode as Mode, t.id);
          setTasks((prev) => prev.filter((x) => x.id !== t.id));
        }}
        onToggleTask={(t) => {
          const at = Date.now();
          setTasks((prev) =>
            prev.map((x) => {
              if (x.id !== t.id) return x;
              const wasDone = x.completed;
              return {
                ...x,
                completed: !wasDone,
                // 少了这两个字段，主窗口 30 秒后的拉取会当成"没改过"整条盖回旧值
                completedAt: !wasDone ? at : undefined,
                updatedAt: at,
              };
            }),
          );
        }}
        onUpdateTask={(t, patch) => {
          const at = Date.now();
          setTasks((prev) =>
            prev.map((x) => (x.id === t.id ? { ...x, ...patch, updatedAt: at } : x)),
          );
        }}
        /**
         * v3.9.23 🔴 这两个不能写死。
         *
         * 写死 `deleteGranted` + 空实现，等于让桌宠窗口**永远处于"已授权"状态**：
         * 用户在桌宠里说「删掉买牛奶」→ 它不回"首次要授权"那句 → 直接进确认 →
         * 用户回「删」→ 真的删了，**而授权从来没被记下来**。
         * 更糟的是主窗口的授权状态是从 localStorage 读的（还是"未授权"），
         * 用户在主窗口再删一次，又会被要求授权一遍 —— 两边行为对不上，像失灵。
         * 现在两个窗口读写同一份本机授权，行为一致。
         */
        deleteGranted={deleteGranted}
        onGrantDelete={grantDelete}
        nudges={nudges}
      />
      {/* 到点提醒的气泡：跟着桌宠走，看一眼就够 */}
      {toast && (
        <div
          className="pet-remind-bubble"
          role="status"
          style={bubbleAt ? { left: bubbleAt.x, top: bubbleAt.y } : undefined}
        >
          {toast.text}
        </div>
      )}
      {/* 让桌宠能回答"今天有什么"（复用同一套大脑） */}
      <span hidden>{answer("你好", ctx).text}</span>
      <span hidden>{memos.length}</span>
    </div>
  );
}
