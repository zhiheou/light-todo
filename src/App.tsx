import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search } from "lucide-react";
import Sidebar from "./components/Sidebar";
import TaskList from "./components/TaskList";
import TaskDrawer from "./components/TaskDrawer";
import MemoList from "./components/MemoList";
import MemoDrawer from "./components/MemoDrawer";
import ReviewView from "./components/ReviewView";
import PinGate from "./components/PinGate";
import AddDialog, { type TaskDraft } from "./components/AddDialog";
import SyncDialog from "./components/SyncDialog";
import LoginGate from "./components/LoginGate";
import type { AppData, Memo, Mode, SortMode, Task, ViewFilter } from "./types";
import {
  filterTasks,
  isCompletedToday,
  isOverdue,
  loadTasks,
  makeTask,
  nextTaskInstance,
  normalizeTasks,
  saveTasks,
  sortTasks,
  toggleCompleted,
} from "./lib/tasks";
import { loadWorkMemos, makeMemo, normalizeMemos, saveWorkMemos } from "./lib/memos";
import {
  hasPersonalLock,
  savePersonalLock,
  verifyPersonalLock,
} from "./lib/personalLock";
import { exportBackup, parseBackup } from "./lib/backup";
import { pushSync, pullSync, setSyncConfig, type SyncConfig } from "./lib/sync";
import { encryptBackup, decryptBackup } from "./lib/syncCrypto";
import {
  decryptAppData,
  encryptAppData,
  fetchWorkspace,
  loginAccount,
  logoutAccount,
  newKeySalt,
  registerAccount,
  saveWorkspace,
} from "./lib/account";
import {
  clearStoredSession,
  getStoredSession,
  isNetworkError,
  saveStoredSession,
} from "./lib/session";

interface ToastState {
  id: number;
  message: string;
  kind: "info" | "danger";
  action?: { label: string; run: () => void };
}

function dateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 顶栏视图偏好：显示/隐藏已完成、精简/详情。本地持久化，不随账号同步。
const VIEW_PREFS_KEY = "lighttodo:view-prefs:v1";

interface ViewPrefs {
  showCompleted: boolean;
  showFullInfo: boolean;
}

function loadViewPrefs(): ViewPrefs {
  const defaults: ViewPrefs = { showCompleted: true, showFullInfo: false };
  try {
    const raw = localStorage.getItem(VIEW_PREFS_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<ViewPrefs>;
    return {
      showCompleted: typeof parsed.showCompleted === "boolean" ? parsed.showCompleted : defaults.showCompleted,
      showFullInfo: typeof parsed.showFullInfo === "boolean" ? parsed.showFullInfo : defaults.showFullInfo,
    };
  } catch {
    return defaults;
  }
}

function saveViewPrefs(prefs: ViewPrefs): void {
  try {
    localStorage.setItem(VIEW_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage 不可用时静默失败，仅本次会话内生效
  }
}

export default function App() {
  const [mode, setMode] = useState<Mode>("work");
  const [workTasks, setWorkTasks] = useState<Task[]>(() => loadTasks("work"));
  const [workMemos, setWorkMemos] = useState<Memo[]>(() => loadWorkMemos());
  const [personalTasks, setPersonalTasks] = useState<Task[]>([]);
  const [personalMemos, setPersonalMemos] = useState<Memo[]>([]);
  const [pinState, setPinState] = useState<"idle" | "setup" | "enter">("idle");
  const [pinError, setPinError] = useState("");
  const [view, setView] = useState<ViewFilter>("today");
  const [sortMode, setSortMode] = useState<SortMode>("priority");
  const [viewPrefs, setViewPrefs] = useState<ViewPrefs>(() => loadViewPrefs());
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedMemoId, setSelectedMemoId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"task" | "memo" | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const [account, setAccount] = useState<{ username: string } | null>(null);
  const [accountKeySalt, setAccountKeySalt] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [accountReady, setAccountReady] = useState(false);
  const [authState, setAuthState] = useState<"booting" | "gate" | "in">("booting");
  const [authError, setAuthError] = useState("");
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimer = useRef<number | null>(null);
  const remoteSaveTimer = useRef<number | null>(null);
  const notified = useRef<Set<string>>(new Set());
  // 本地最后编辑时间：pull 拉取时若已被本地更新盖过则丢弃旧服务端数据，避免覆盖用户刚做的修改
  const lastLocalEdit = useRef(0);
  const lastPullStarted = useRef(0);

  useEffect(() => saveTasks("work", workTasks), [workTasks]);
  useEffect(() => saveWorkMemos(workMemos), [workMemos]);

  const currentTasks = mode === "work" ? workTasks : personalTasks;
  const currentMemos = mode === "work" ? workMemos : personalMemos;
  const currentTasksRef = useRef(currentTasks);
  useEffect(() => {
    currentTasksRef.current = currentTasks;
  }, [currentTasks]);

  const showToast = useCallback(
    (
      message: string,
      kind: "info" | "danger" = "info",
      actionLabel?: string,
      action?: () => void,
    ) => {
      setToast({
        id: Date.now(),
        message,
        kind,
        action: action && actionLabel ? { label: actionLabel, run: action } : undefined,
      });
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
      toastTimer.current = window.setTimeout(() => setToast(null), 6000);
    },
    [],
  );

  const addTask = useCallback(
    (task: Task) => {
      lastLocalEdit.current = Date.now();
      if (mode === "work") setWorkTasks((prev) => [task, ...prev]);
      else setPersonalTasks((prev) => [task, ...prev]);
    },
    [mode],
  );

  const updateTask = useCallback(
    (id: string, patch: Partial<Task>) => {
      lastLocalEdit.current = Date.now();
      const apply = (prev: Task[]) =>
        prev.map((task) =>
          task.id === id ? { ...task, ...patch, updatedAt: Date.now() } : task,
        );
      if (mode === "work") setWorkTasks(apply);
      else setPersonalTasks(apply);
    },
    [mode],
  );

  const toggleTask = useCallback(
    (id: string) => {
      lastLocalEdit.current = Date.now();
      const now = new Date();
      // 未完成→完成 的循环任务必然生成下一实例，可提前确定以弹出提示
      const target = currentTasksRef.current.find((task) => task.id === id);
      const spawned =
        target && !target.completed && target.repeat ? nextTaskInstance(target, now) : null;
      const apply = (prev: Task[]) => toggleCompleted(prev, id, now).tasks;
      if (mode === "work") setWorkTasks(apply);
      else setPersonalTasks(apply);
      if (spawned) {
        showToast(
          `已完成「${spawned.title}」，已生成下一实例`,
          "info",
          "打开",
          () => {
            setSelectedMemoId(null);
            setSelectedId(spawned.id);
          },
        );
      }
    },
    [mode, showToast],
  );

  const deleteTask = useCallback(
    (task: Task) => {
      lastLocalEdit.current = Date.now();
      const targetMode = mode;
      if (targetMode === "work") {
        setWorkTasks((prev) => prev.filter((t) => t.id !== task.id));
      } else {
        setPersonalTasks((prev) => prev.filter((t) => t.id !== task.id));
      }
      if (selectedId === task.id) setSelectedId(null);
      showToast("任务已删除", "info", "撤销", () => {
        if (targetMode === "work") setWorkTasks((prev) => [task, ...prev]);
        else setPersonalTasks((prev) => [task, ...prev]);
      });
    },
    [mode, selectedId, showToast],
  );

  const updateMemo = useCallback(
    (id: string, patch: Partial<Memo>) => {
      lastLocalEdit.current = Date.now();
      const apply = (prev: Memo[]) =>
        prev.map((memo) =>
          memo.id === id ? { ...memo, ...patch, updatedAt: Date.now() } : memo,
        );
      if (mode === "work") setWorkMemos(apply);
      else setPersonalMemos(apply);
    },
    [mode],
  );

  const toggleMemoPin = useCallback(
    (id: string) => {
      lastLocalEdit.current = Date.now();
      const apply = (prev: Memo[]) =>
        prev.map((memo) =>
          memo.id === id ? { ...memo, pinned: !memo.pinned, updatedAt: Date.now() } : memo,
        );
      if (mode === "work") setWorkMemos(apply);
      else setPersonalMemos(apply);
    },
    [mode],
  );

  const deleteMemo = useCallback(
    (memo: Memo) => {
      lastLocalEdit.current = Date.now();
      const targetMode = mode;
      // 记录引用该备忘的任务 id，撤销时恢复引用（避免撤销后关联丢失）
      const referencingIds = new Set<string>();
      for (const t of targetMode === "work" ? workTasks : personalTasks) {
        if (t.memoId === memo.id) referencingIds.add(t.id);
      }
      const clearTaskRef = (prev: Task[]) =>
        prev.map((task) =>
          task.memoId === memo.id ? { ...task, memoId: undefined, updatedAt: Date.now() } : task,
        );
      if (targetMode === "work") {
        setWorkMemos((prev) => prev.filter((m) => m.id !== memo.id));
        setWorkTasks(clearTaskRef);
      } else {
        setPersonalMemos((prev) => prev.filter((m) => m.id !== memo.id));
        setPersonalTasks(clearTaskRef);
      }
      if (selectedMemoId === memo.id) setSelectedMemoId(null);
      showToast("备忘已删除", "info", "撤销", () => {
        const restoreRef = (prev: Task[]) =>
          prev.map((task) =>
            referencingIds.has(task.id) ? { ...task, memoId: memo.id } : task,
          );
        if (targetMode === "work") {
          setWorkMemos((prev) => [memo, ...prev]);
          setWorkTasks(restoreRef);
        } else {
          setPersonalMemos((prev) => [memo, ...prev]);
          setPersonalTasks(restoreRef);
        }
      });
    },
    [mode, selectedMemoId, showToast, workTasks, personalTasks],
  );

  const enterPersonal = useCallback(() => {
    setMode("personal");
    setPinState("idle");
    setPinError("");
    setView("today");
    setSelectedId(null);
    setSelectedMemoId(null);
    setActiveTag(null);
  }, []);

  const requestPersonal = useCallback(async () => {
    if (mode === "personal") return;
    setPinError("");
    // 进入个人空间一律要求本机访问码：首次先设置，之后输入
    if (hasPersonalLock()) setPinState("enter");
    else setPinState("setup");
  }, [mode]);

  const lockPersonal = useCallback(() => {
    if (mode !== "personal") return;
    setMode("work");
    setPinState("idle");
    setPinError("");
    setSelectedId(null);
    setSelectedMemoId(null);
    setActiveTag(null);
    setView("today");
    notified.current.clear();
    showToast("已锁定");
  }, [mode, showToast]);

  const handleToggleMode = useCallback(() => {
    if (mode === "personal") lockPersonal();
    else void requestPersonal();
  }, [mode, lockPersonal, requestPersonal]);

  const handleSetupPin = useCallback(
    async (pin: string) => {
      await savePersonalLock(pin);
      // 在个人空间内设码 → 设完即锁定回工作空间；在工作空间设码 → 直接进入
      if (mode === "personal") lockPersonal();
      else enterPersonal();
    },
    [mode, enterPersonal, lockPersonal],
  );

  const handleEnterPin = useCallback(
    async (pin: string) => {
      const ok = await verifyPersonalLock(pin);
      if (ok) {
        enterPersonal();
      } else {
        setPinError("访问码不正确");
      }
    },
    [enterPersonal],
  );

  const handleAddTask = useCallback(
    (draft: TaskDraft) => {
      const rawTitle = draft.title.trim();
      if (rawTitle === "::vault") {
        setDialog(null);
        void requestPersonal();
        return;
      }
      const task = makeTask({
        title: rawTitle || "未命名任务",
        notes: draft.notes,
        priority: draft.priority,
        dueDate: draft.dueDate,
        dueTime: draft.dueTime,
        remindAt: draft.remindAt,
        repeat: draft.repeat ?? undefined,
      });
      addTask(task);
      setDialog(null);
      setView("all");
      setSelectedMemoId(null);
      setSelectedId(null);
      showToast("已添加");
    },
    [requestPersonal, addTask, showToast],
  );

  const handleAddMemo = useCallback(
    (text: string) => {
      const raw = text.trim();
      if (raw === "::vault") {
        setDialog(null);
        void requestPersonal();
        return;
      }
      const memo = makeMemo({ text: raw });
      if (mode === "work") setWorkMemos((prev) => [memo, ...prev]);
      else setPersonalMemos((prev) => [memo, ...prev]);
      // 新增只加入列表，不自动打开右侧编辑抽屉（要编辑时点行即可）
      setDialog(null);
      setSelectedId(null);
      setSelectedMemoId(null);
      setActiveTag(null);
      showToast("已记录");
    },
    [mode, requestPersonal, showToast],
  );

  const counts = useMemo(() => {
    const now = new Date();
    const today = dateKey(now);
    let todayCount = 0;
    let allCount = 0;
    let doneCount = 0;
    for (const task of currentTasks) {
      if (task.completed) {
        doneCount += 1;
        continue;
      }
      allCount += 1;
      if (task.dueDate && (task.dueDate === today || isOverdue(task, now))) {
        todayCount += 1;
      }
    }
    return {
      today: todayCount,
      all: allCount,
      done: doneCount,
      notes: currentMemos.length,
      review: currentTasks.filter((task) => {
        if (task.completed || !task.dueDate) return false;
        const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        return task.dueDate === dateKey(tomorrow);
      }).length,
    };
  }, [currentTasks, currentMemos]);

  useEffect(() => saveViewPrefs(viewPrefs), [viewPrefs]);

  const visibleTasks = useMemo(() => {
    const now = new Date();
    return sortTasks(filterTasks(currentTasks, view, search, now, { showCompleted: viewPrefs.showCompleted }), sortMode);
  }, [currentTasks, view, search, sortMode, viewPrefs.showCompleted]);

  // 今日视图：分「今日待办」与「今日已完成」两组，已完成默认保留展示
  const todayGroups = useMemo(() => {
    const query = search.trim().toLowerCase();
    const open: Task[] = [];
    const done: Task[] = [];
    const now = new Date();
    const today = dateKey(now);
    for (const task of currentTasks) {
      if (query) {
        const haystack = `${task.title} ${task.notes}`.toLowerCase();
        if (!haystack.includes(query)) continue;
      }
      if (task.completed) {
        if (isCompletedToday(task, now) || task.dueDate === today) done.push(task);
      } else if (isOverdue(task, now) || task.dueDate === today) {
        open.push(task);
      }
    }
    return { open: sortTasks(open, sortMode), done: sortTasks(done, sortMode) };
  }, [currentTasks, search, sortMode]);

  const visibleMemos = useMemo(() => {
    const query = search.trim().toLowerCase();
    return currentMemos
      .filter((memo) => !query || memo.text.toLowerCase().includes(query))
      .filter((memo) => !activeTag || (memo.tags ?? []).includes(activeTag))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
  }, [currentMemos, search, activeTag]);

  // 当前空间全部标签（去重，供过滤条）
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const memo of currentMemos) {
      for (const tag of memo.tags ?? []) set.add(tag);
    }
    return Array.from(set);
  }, [currentMemos]);

  // memoId → 被多少任务引用（备忘列表徽标 / 关联展示）
  const linkedCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const task of currentTasks) {
      if (task.memoId) counts[task.memoId] = (counts[task.memoId] ?? 0) + 1;
    }
    return counts;
  }, [currentTasks]);

  const selectedTask = currentTasks.find((task) => task.id === selectedId) ?? null;
  const selectedMemo = currentMemos.find((memo) => memo.id === selectedMemoId) ?? null;
  // 备忘抽屉：被当前空间哪些任务引用
  const linkedTasks = useMemo(() => {
    if (!selectedMemo) return [];
    return currentTasks.filter((task) => task.memoId === selectedMemo.id);
  }, [currentTasks, selectedMemo]);

  const openMemo = useCallback((memoId: string) => {
    setView("notes");
    setSelectedId(null);
    setSelectedMemoId(memoId);
  }, []);

  const openTask = useCallback((taskId: string) => {
    setView("all");
    setSelectedMemoId(null);
    setSelectedId(taskId);
  }, []);

  const handleSelectView = useCallback((next: ViewFilter) => {
    setView(next);
    if (next === "notes") setSelectedId(null);
    else setSelectedMemoId(null);
  }, []);

  const handleExport = useCallback(() => {
    const json = exportBackup(workTasks, workMemos, null);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `light-todo-backup-${dateKey(new Date())}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("备份已导出");
  }, [workTasks, workMemos, showToast]);

  const handleImport = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result ?? "");
        const backup = parseBackup(text);
        if (!backup) {
          showToast("备份文件无效", "danger");
          return;
        }
        setWorkTasks(normalizeTasks(backup.work.tasks));
        setWorkMemos(normalizeMemos(backup.work.memos));
        // 先锁定再提示，避免「已锁定」toast 覆盖「旧版个人空间需重新录入」提示
        if (mode === "personal") lockPersonal();
        if (backup.personal) {
          showToast("已恢复备份（旧版个人空间数据需重新录入，访问码加密与账号加密不互通）");
        } else {
          showToast("已恢复备份");
        }
        setView("all");
      };
      reader.readAsText(file);
    },
    [mode, lockPersonal, showToast],
  );

  const handleSyncPush = useCallback(
    async (config: SyncConfig, passphrase: string) => {
      const backup = exportBackup(workTasks, workMemos, null);
      const encrypted = await encryptBackup(backup, passphrase);
      await pushSync(config, encrypted);
      setSyncConfig(config);
      return "已上传到同步服务器";
    },
    [workTasks, workMemos],
  );

  const handleSyncPull = useCallback(
    async (config: SyncConfig, passphrase: string) => {
      const encrypted = await pullSync(config);
      const backupText = await decryptBackup(encrypted, passphrase);
      if (!backupText) throw new Error("同步口令不正确或文件已损坏");
      const backup = parseBackup(backupText);
      if (!backup) throw new Error("同步文件格式无效");
      setWorkTasks(normalizeTasks(backup.work.tasks));
      setWorkMemos(normalizeMemos(backup.work.memos));
      // 先锁定再提示，避免「已锁定」toast 覆盖「旧版个人空间需重新录入」提示
      if (mode === "personal") lockPersonal();
      if (backup.personal) {
        showToast("已从同步服务器恢复（旧版个人空间数据需重新录入，访问码加密与账号加密不互通）");
      } else {
        showToast("已从同步服务器恢复");
      }
      setSyncConfig(config);
      setView("all");
      return "已从同步服务器恢复";
    },
    [mode, lockPersonal, showToast],
  );

  const collectAppData = useCallback((): AppData => {
    return {
      workTasks,
      workMemos,
      personalTasks,
      personalMemos,
      updatedAt: Date.now(),
    };
  }, [workTasks, workMemos, personalTasks, personalMemos]);

  const handleRegister = useCallback(
    async (username: string, password: string) => {
      const keySalt = newKeySalt();
      const payload = await encryptAppData(collectAppData(), password, keySalt);
      await registerAccount(username, password, { keySalt, ...payload });
      saveStoredSession({ username, password, keySalt });
      setAccount({ username });
      setAccountKeySalt(keySalt);
      setAccountPassword(password);
      setAccountReady(true);
      setAuthState("in");
      setView("all");
      showToast("账号已创建，数据已加密同步");
    },
    [collectAppData, showToast],
  );

  const handleLogin = useCallback(
    async (username: string, password: string) => {
      const login = await loginAccount(username, password);
      const workspace = await fetchWorkspace();
      if (workspace?.data && workspace.iv) {
        const data = await decryptAppData(
          { iv: workspace.iv, data: workspace.data },
          password,
          login.keySalt,
        );
        if (!data) throw new Error("数据解密失败，请确认账号密码正确");
        setWorkTasks(normalizeTasks(data.workTasks || []));
        setWorkMemos(normalizeMemos(data.workMemos || []));
        setPersonalTasks(normalizeTasks(data.personalTasks || []));
        setPersonalMemos(normalizeMemos(data.personalMemos || []));
      } else {
        const payload = await encryptAppData(collectAppData(), password, login.keySalt);
        await saveWorkspace(payload);
      }
      saveStoredSession({ username, password, keySalt: login.keySalt });
      setAccount({ username });
      setAccountKeySalt(login.keySalt);
      setAccountPassword(password);
      setAccountReady(true);
      setAuthState("in");
      setView("all");
      showToast("登录成功，数据已同步");
    },
    [collectAppData, showToast],
  );

  const handleLogout = useCallback(async () => {
    try {
      await logoutAccount();
    } catch {
      // session may already be invalid
    }
    clearStoredSession();
    localStorage.removeItem("lighttodo:work:v1");
    localStorage.removeItem("lighttodo:work-memos:v1");
    setAccount(null);
    setAccountKeySalt("");
    setAccountPassword("");
    setAccountReady(false);
    setAuthState("gate");
    setMode("work");
    setPersonalTasks([]);
    setPersonalMemos([]);
    setPinState("idle");
    setPinError("");
    setSearch("");
    setActiveTag(null);
    showToast("已退出账号");
  }, [showToast]);

  // 挂载时恢复会话：有 sessionStorage → 自动登录；无 → 进门禁。
  useEffect(() => {
    const stored = getStoredSession();
    if (!stored) {
      setAuthState("gate");
      return;
    }
    handleLogin(stored.username, stored.password)
      .catch((err) => {
        if (isNetworkError(err)) {
          // 网络/代理问题：保留会话，提示重试
          setAuthError("网络异常，无法连接服务器，请稍后重试");
          setAuthState("gate");
        } else {
          clearStoredSession();
          setAuthState("gate");
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!account || !accountReady || !accountKeySalt || !accountPassword) return;
    if (remoteSaveTimer.current) window.clearTimeout(remoteSaveTimer.current);
    remoteSaveTimer.current = window.setTimeout(() => {
      void encryptAppData(collectAppData(), accountPassword, accountKeySalt)
        .then((payload) => saveWorkspace(payload))
        .catch(() => showToast("自动同步失败", "danger"));
    }, 800);
    return () => {
      if (remoteSaveTimer.current) window.clearTimeout(remoteSaveTimer.current);
    };
  }, [
    workTasks,
    workMemos,
    personalTasks,
    personalMemos,
    account,
    accountReady,
    accountKeySalt,
    accountPassword,
    collectAppData,
    showToast,
  ]);

  useEffect(() => {
    if (!account || !accountReady || !accountKeySalt || !accountPassword) return;
    let cancelled = false;
    const pull = async () => {
      lastPullStarted.current = Date.now();
      try {
        const workspace = await fetchWorkspace();
        if (!workspace?.data || !workspace.iv) return;
        // 拉取期间本地已有编辑：丢弃这次旧数据，避免覆盖用户刚做的修改
        if (lastLocalEdit.current > lastPullStarted.current) return;
        const data = await decryptAppData(
          { iv: workspace.iv, data: workspace.data },
          accountPassword,
          accountKeySalt,
        );
        if (cancelled || !data) return;
        if (lastLocalEdit.current > lastPullStarted.current) return;
        // 服务端数据比本地最后编辑更旧：本地改得更新，丢弃拉取结果
        if (typeof data.updatedAt === "number" && data.updatedAt < lastLocalEdit.current) return;
        setWorkTasks(normalizeTasks(data.workTasks || []));
        setWorkMemos(normalizeMemos(data.workMemos || []));
        setPersonalTasks(normalizeTasks(data.personalTasks || []));
        setPersonalMemos(normalizeMemos(data.personalMemos || []));
      } catch {
        // keep current data on transient network failures
      }
    };
    const timer = window.setInterval(() => void pull(), 30000);
    const onFocus = () => void pull();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [account, accountReady, accountKeySalt, accountPassword]);

  useEffect(() => {
    if (mode !== "personal") return;
    let timer: number | undefined;
    const arm = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => lockPersonal(), 5000);
    };
    const disarm = () => window.clearTimeout(timer);
    const onVisibility = () => {
      if (document.hidden) lockPersonal();
    };
    window.addEventListener("blur", arm);
    window.addEventListener("focus", disarm);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", arm);
      window.removeEventListener("focus", disarm);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearTimeout(timer);
    };
  }, [mode, lockPersonal]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.altKey && event.key.toLowerCase() === "escape") {
        lockPersonal();
      }
      if (event.ctrlKey && event.shiftKey && event.altKey && event.key.toLowerCase() === "p") {
        void requestPersonal();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lockPersonal, requestPersonal]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      for (const task of currentTasksRef.current) {
        if (task.completed || !task.remindAt) continue;
        if (new Date(task.remindAt).getTime() <= now && !notified.current.has(task.id)) {
          notified.current.add(task.id);
          showToast(`提醒：${task.title}`);
        }
      }
    }, 10000);
    return () => window.clearInterval(timer);
  }, [showToast]);

  const viewTitle =
    view === "today"
      ? "今日"
      : view === "all"
        ? "全部"
        : view === "done"
          ? "已完成"
          : view === "notes"
            ? "备忘录"
            : "每日回顾";

  if (authState !== "in") {
    return (
      <LoginGate
        booting={authState === "booting"}
        error={authError}
        onLogin={async (username, password) => {
          setAuthError("");
          await handleLogin(username, password);
        }}
        onRegister={async (username, password) => {
          setAuthError("");
          await handleRegister(username, password);
        }}
      />
    );
  }

  return (
    <div className="app-shell">
      <Sidebar
        mode={mode}
        view={view}
        counts={counts}
        onSelectView={handleSelectView}
        onToggleMode={handleToggleMode}
        onLock={() => {
          // 未设本机访问码时，先引导设置（锁定前设码才有意义）
          if (mode === "personal" && !hasPersonalLock()) {
            setPinState("setup");
            setPinError("");
            return;
          }
          lockPersonal();
        }}
        onExport={handleExport}
        onImport={handleImport}
        onSync={() => setSyncOpen(true)}
        accountName={account?.username ?? null}
        onLogout={() => void handleLogout()}
      />

      <main className="main">
        <header className="topbar">
          <div className="topbar-row">
            <h1 className="view-title">{viewTitle}</h1>
            {view !== "notes" && (
              <div className="segmented" role="group" aria-label="排序方式">
                <button
                  type="button"
                  className={sortMode === "priority" ? "active" : ""}
                  onClick={() => setSortMode("priority")}
                >
                  优先级
                </button>
                <button
                  type="button"
                  className={sortMode === "due" ? "active" : ""}
                  onClick={() => setSortMode("due")}
                >
                  截止日期
                </button>
              </div>
            )}
            {view !== "notes" && view !== "review" && (
              <div className="view-options" role="group" aria-label="视图选项">
                <div className="segmented" role="group" aria-label="是否显示已完成">
                  <button
                    type="button"
                    className={viewPrefs.showCompleted ? "active" : ""}
                    title="在今日/全部视图中同时显示已完成任务"
                    onClick={() => setViewPrefs((prev) => ({ ...prev, showCompleted: true }))}
                  >
                    显示已完成
                  </button>
                  <button
                    type="button"
                    className={!viewPrefs.showCompleted ? "active" : ""}
                    title="隐藏已完成任务"
                    onClick={() => setViewPrefs((prev) => ({ ...prev, showCompleted: false }))}
                  >
                    隐藏
                  </button>
                </div>
                <div className="segmented" role="group" aria-label="信息展示密度">
                  <button
                    type="button"
                    className={viewPrefs.showFullInfo ? "active" : ""}
                    title="展示任务全部信息（备注全文）"
                    onClick={() => setViewPrefs((prev) => ({ ...prev, showFullInfo: true }))}
                  >
                    详情
                  </button>
                  <button
                    type="button"
                    className={!viewPrefs.showFullInfo ? "active" : ""}
                    title="精简展示（备注单行省略）"
                    onClick={() => setViewPrefs((prev) => ({ ...prev, showFullInfo: false }))}
                  >
                    精简
                  </button>
                </div>
              </div>
            )}
            <div className="search-box">
              <Search size={15} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索"
                aria-label="搜索"
              />
            </div>
            <button
              type="button"
              className="add-button"
              aria-label={view === "notes" ? "添加备忘" : "添加任务"}
              onClick={() => setDialog(view === "notes" ? "memo" : "task")}
            >
              <Plus size={18} />
            </button>
          </div>
        </header>

        <section className="list-pane">
          {view === "review" ? (
            <ReviewView
              tasks={currentTasks}
              selectedId={selectedId}
              onToggle={toggleTask}
              onSelect={(task) => {
                setSelectedMemoId(null);
                setSelectedId(task.id);
              }}
              onDelete={deleteTask}
            />
          ) : view === "notes" ? (
            <MemoList
              memos={visibleMemos}
              selectedId={selectedMemoId}
              allTags={allTags}
              activeTag={activeTag}
              onFilterTag={setActiveTag}
              linkedCounts={linkedCounts}
              onTogglePin={toggleMemoPin}
              onSelect={(memo) => {
                setSelectedId(null);
                setSelectedMemoId(memo.id);
              }}
              onDelete={deleteMemo}
            />
          ) : view === "today" ? (
            <div className="today-sections">
              <div className="today-section">
                <div className="section-head">
                  <h2>今日待办</h2>
                  <span className="section-count">{todayGroups.open.length}</span>
                </div>
                <TaskList
                  tasks={todayGroups.open}
                  selectedId={selectedId}
                  full={viewPrefs.showFullInfo}
                  emptyText="今天没有待办"
                  onToggle={toggleTask}
                  onSelect={(task) => {
                    setSelectedMemoId(null);
                    setSelectedId(task.id);
                  }}
                  onDelete={deleteTask}
                />
              </div>
              {viewPrefs.showCompleted && todayGroups.done.length > 0 && (
                <div className="today-section done-section">
                  <div className="section-head">
                    <h2>今日已完成</h2>
                    <span className="section-count">{todayGroups.done.length}</span>
                  </div>
                  <TaskList
                    tasks={todayGroups.done}
                    selectedId={selectedId}
                    full={viewPrefs.showFullInfo}
                    onToggle={toggleTask}
                    onSelect={(task) => {
                      setSelectedMemoId(null);
                      setSelectedId(task.id);
                    }}
                    onDelete={deleteTask}
                  />
                </div>
              )}
            </div>
          ) : (
            <TaskList
              tasks={visibleTasks}
              selectedId={selectedId}
              full={viewPrefs.showFullInfo}
              onToggle={toggleTask}
              onSelect={(task) => {
                setSelectedMemoId(null);
                setSelectedId(task.id);
              }}
              onDelete={deleteTask}
            />
          )}
        </section>
      </main>

      {selectedTask && (
        <TaskDrawer
          task={selectedTask}
          memos={currentMemos}
          onOpenMemo={openMemo}
          onSave={(patch) => updateTask(selectedTask.id, patch)}
          onDelete={deleteTask}
          onClose={() => setSelectedId(null)}
        />
      )}

      {selectedMemo && (
        <MemoDrawer
          memo={selectedMemo}
          linkedTasks={linkedTasks}
          onOpenTask={openTask}
          onSave={(patch) => updateMemo(selectedMemo.id, patch)}
          onDelete={deleteMemo}
          onClose={() => setSelectedMemoId(null)}
        />
      )}

      {dialog && (
        <AddDialog
          kind={dialog}
          onSubmitTask={handleAddTask}
          onSubmitMemo={handleAddMemo}
          onClose={() => setDialog(null)}
        />
      )}

      {syncOpen && (
        <SyncDialog
          onClose={() => setSyncOpen(false)}
          onPush={handleSyncPush}
          onPull={handleSyncPull}
        />
      )}

      {pinState !== "idle" && (
        <PinGate
          kind={pinState}
          error={pinError}
          onCancel={() => {
            setPinState("idle");
            setPinError("");
          }}
          onSubmit={pinState === "setup" ? handleSetupPin : handleEnterPin}
        />
      )}

      {toast && (
        <div className={toast.kind === "danger" ? "toast danger" : "toast"}>
          <span>{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              onClick={() => {
                toast.action?.run();
                setToast(null);
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
