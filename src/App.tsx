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
import AccountDialog from "./components/AccountDialog";
import type { AppData, Memo, Mode, SortMode, Task, VaultData, ViewFilter } from "./types";
import { filterTasks, isOverdue, loadTasks, makeTask, saveTasks, sortTasks } from "./lib/tasks";
import { loadWorkMemos, makeMemo, saveWorkMemos } from "./lib/memos";
import {
  createVault,
  hasVault,
  importVaultRecord,
  initialPersonalData,
  lockVault,
  saveVault,
  unlockVault,
  vaultRecord,
} from "./lib/vault";
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
import { parseQuickAdd } from "./lib/nlp";

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
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedMemoId, setSelectedMemoId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"task" | "memo" | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const [account, setAccount] = useState<{ username: string } | null>(null);
  const [accountKeySalt, setAccountKeySalt] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [accountReady, setAccountReady] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimer = useRef<number | null>(null);
  const remoteSaveTimer = useRef<number | null>(null);
  const notified = useRef<Set<string>>(new Set());

  useEffect(() => saveTasks("work", workTasks), [workTasks]);
  useEffect(() => saveWorkMemos(workMemos), [workMemos]);
  useEffect(() => {
    if (mode === "personal") {
      void saveVault({ tasks: personalTasks, memos: personalMemos });
    }
  }, [personalTasks, personalMemos, mode]);

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
      if (mode === "work") setWorkTasks((prev) => [task, ...prev]);
      else setPersonalTasks((prev) => [task, ...prev]);
    },
    [mode],
  );

  const updateTask = useCallback(
    (id: string, patch: Partial<Task>) => {
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
      const apply = (prev: Task[]) =>
        prev.map((task) =>
          task.id === id
            ? { ...task, completed: !task.completed, updatedAt: Date.now() }
            : task,
        );
      if (mode === "work") setWorkTasks(apply);
      else setPersonalTasks(apply);
    },
    [mode],
  );

  const deleteTask = useCallback(
    (task: Task) => {
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
      const targetMode = mode;
      if (targetMode === "work") {
        setWorkMemos((prev) => prev.filter((m) => m.id !== memo.id));
      } else {
        setPersonalMemos((prev) => prev.filter((m) => m.id !== memo.id));
      }
      if (selectedMemoId === memo.id) setSelectedMemoId(null);
      showToast("备忘已删除", "info", "撤销", () => {
        if (targetMode === "work") setWorkMemos((prev) => [memo, ...prev]);
        else setPersonalMemos((prev) => [memo, ...prev]);
      });
    },
    [mode, selectedMemoId, showToast],
  );

  const enterPersonalWithData = useCallback((data: VaultData) => {
    setPersonalTasks(data.tasks);
    setPersonalMemos(data.memos);
    setMode("personal");
    setPinState("idle");
    setPinError("");
    setView("today");
    setSelectedId(null);
    setSelectedMemoId(null);
  }, []);

  const requestPersonal = useCallback(async () => {
    if (mode === "personal") return;
    setPinError("");
    setPinState(hasVault() ? "enter" : "setup");
  }, [mode]);

  const lockPersonal = useCallback(() => {
    if (mode !== "personal") return;
    lockVault();
    setMode("work");
    setPersonalTasks([]);
    setPersonalMemos([]);
    setPinState("idle");
    setPinError("");
    setSelectedId(null);
    setSelectedMemoId(null);
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
      const data = initialPersonalData();
      await createVault(pin, data);
      enterPersonalWithData(data);
    },
    [enterPersonalWithData],
  );

  const handleEnterPin = useCallback(
    async (pin: string) => {
      const data = await unlockVault(pin);
      if (data) {
        enterPersonalWithData(data);
      } else {
        setPinError("访问码不正确");
      }
    },
    [enterPersonalWithData],
  );

  const handleAddTask = useCallback(
    (draft: TaskDraft) => {
      const rawTitle = draft.title.trim();
      if (rawTitle === "::vault" || rawTitle.startsWith("#个人")) {
        setDialog(null);
        void requestPersonal();
        return;
      }
      const parsed = parseQuickAdd(rawTitle, new Date());
      const task = makeTask({
        title: parsed.title,
        notes: draft.notes,
        priority: parsed.priority !== 3 ? parsed.priority : draft.priority,
        dueDate: draft.dueDate || parsed.dueDate,
        dueTime: draft.dueTime || parsed.dueTime,
        remindAt: draft.remindAt || parsed.remindAt,
      });
      addTask(task);
      setDialog(null);
      setView("all");
      setSelectedMemoId(null);
      setSelectedId(task.id);
      showToast("已添加");
    },
    [requestPersonal, addTask, showToast],
  );

  const handleAddMemo = useCallback(
    (text: string) => {
      const raw = text.trim();
      if (raw === "::vault" || raw.startsWith("#个人")) {
        setDialog(null);
        void requestPersonal();
        return;
      }
      const memo = makeMemo({ text: raw });
      if (mode === "work") setWorkMemos((prev) => [memo, ...prev]);
      else setPersonalMemos((prev) => [memo, ...prev]);
      setDialog(null);
      setSelectedId(null);
      setSelectedMemoId(memo.id);
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

  const visibleTasks = useMemo(() => {
    const now = new Date();
    return sortTasks(filterTasks(currentTasks, view, search, now), sortMode);
  }, [currentTasks, view, search, sortMode]);

  const visibleMemos = useMemo(() => {
    const query = search.trim().toLowerCase();
    return currentMemos
      .filter((memo) => !query || memo.text.toLowerCase().includes(query))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
  }, [currentMemos, search]);

  const selectedTask = currentTasks.find((task) => task.id === selectedId) ?? null;
  const selectedMemo = currentMemos.find((memo) => memo.id === selectedMemoId) ?? null;

  const handleSelectView = useCallback((next: ViewFilter) => {
    setView(next);
    if (next === "notes") setSelectedId(null);
    else setSelectedMemoId(null);
  }, []);

  const handleExport = useCallback(() => {
    const json = exportBackup(workTasks, workMemos, vaultRecord());
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
        setWorkTasks(backup.work.tasks);
        setWorkMemos(backup.work.memos);
        if (backup.personal) {
          importVaultRecord(JSON.stringify(backup.personal));
        }
        if (mode === "personal") lockPersonal();
        setView("all");
        showToast("已恢复备份");
      };
      reader.readAsText(file);
    },
    [mode, lockPersonal, showToast],
  );

  const handleSyncPush = useCallback(
    async (config: SyncConfig, passphrase: string) => {
      const backup = exportBackup(workTasks, workMemos, vaultRecord());
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
      setWorkTasks(backup.work.tasks);
      setWorkMemos(backup.work.memos);
      if (backup.personal) importVaultRecord(JSON.stringify(backup.personal));
      if (mode === "personal") lockPersonal();
      setSyncConfig(config);
      setView("all");
      return "已从同步服务器恢复";
    },
    [mode, lockPersonal],
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
      setAccount({ username });
      setAccountKeySalt(keySalt);
      setAccountPassword(password);
      setAccountReady(true);
      setAccountOpen(false);
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
        setWorkTasks(data.workTasks || []);
        setWorkMemos(data.workMemos || []);
        setPersonalTasks(data.personalTasks || []);
        setPersonalMemos(data.personalMemos || []);
      } else {
        const payload = await encryptAppData(collectAppData(), password, login.keySalt);
        await saveWorkspace(payload);
      }
      setAccount({ username });
      setAccountKeySalt(login.keySalt);
      setAccountPassword(password);
      setAccountReady(true);
      setAccountOpen(false);
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
    setAccount(null);
    setAccountKeySalt("");
    setAccountPassword("");
    setAccountReady(false);
    showToast("已退出账号");
  }, [showToast]);

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
      try {
        const workspace = await fetchWorkspace();
        if (!workspace?.data || !workspace.iv) return;
        const data = await decryptAppData(
          { iv: workspace.iv, data: workspace.data },
          accountPassword,
          accountKeySalt,
        );
        if (cancelled || !data) return;
        setWorkTasks(data.workTasks || []);
        setWorkMemos(data.workMemos || []);
        setPersonalTasks(data.personalTasks || []);
        setPersonalMemos(data.personalMemos || []);
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

  return (
    <div className="app-shell">
      <Sidebar
        mode={mode}
        view={view}
        counts={counts}
        onSelectView={handleSelectView}
        onToggleMode={handleToggleMode}
        onLock={lockPersonal}
        onExport={handleExport}
        onImport={handleImport}
        onSync={() => setSyncOpen(true)}
        accountName={account?.username ?? null}
        onOpenAccount={() => setAccountOpen(true)}
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
              onTogglePin={toggleMemoPin}
              onSelect={(memo) => {
                setSelectedId(null);
                setSelectedMemoId(memo.id);
              }}
              onDelete={deleteMemo}
            />
          ) : (
            <TaskList
              tasks={visibleTasks}
              selectedId={selectedId}
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
          onSave={(patch) => updateTask(selectedTask.id, patch)}
          onDelete={deleteTask}
          onClose={() => setSelectedId(null)}
        />
      )}

      {selectedMemo && (
        <MemoDrawer
          memo={selectedMemo}
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

      {accountOpen && (
        <AccountDialog
          onClose={() => setAccountOpen(false)}
          onLogin={handleLogin}
          onRegister={handleRegister}
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
