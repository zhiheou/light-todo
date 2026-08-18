import {
  CalendarDays,
  CheckCircle2,
  CircleDot,
  Cloud,
  Download,
  ListTodo,
  LockKeyhole,
  LogOut,
  NotebookPen,
  Sparkles,
  Upload,
  UserRound,
} from "lucide-react";
import type { Mode, ViewFilter } from "../types";

interface SidebarProps {
  mode: Mode;
  view: ViewFilter;
  counts: { today: number; all: number; done: number; notes: number; review: number };
  onSelectView: (view: ViewFilter) => void;
  onToggleMode: () => void;
  onLock: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onSync: () => void;
  accountName: string | null;
  onOpenAccount: () => void;
  onLogout: () => void;
}

const NAV_ITEMS: Array<{ key: ViewFilter; label: string; icon: typeof CalendarDays }> = [
  { key: "today", label: "今日", icon: CalendarDays },
  { key: "review", label: "回顾", icon: Sparkles },
  { key: "all", label: "全部", icon: ListTodo },
  { key: "done", label: "已完成", icon: CheckCircle2 },
  { key: "notes", label: "备忘录", icon: NotebookPen },
];

export default function Sidebar({
  mode,
  view,
  counts,
  onSelectView,
  onToggleMode,
  onLock,
  onExport,
  onImport,
  onSync,
  accountName,
  onOpenAccount,
  onLogout,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <ListTodo size={18} />
        <span>轻待办</span>
        <button
          type="button"
          className={mode === "personal" ? "mode-dot personal" : "mode-dot"}
          aria-label={mode === "personal" ? "返回工作模式" : "切换空间"}
          onClick={onToggleMode}
        >
          <CircleDot size={15} />
        </button>
      </div>

      <nav className="nav-list">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              type="button"
              className={view === item.key ? "nav-item active" : "nav-item"}
              onClick={() => onSelectView(item.key)}
            >
              <Icon size={16} />
              <span>{item.label}</span>
              <span className="count">{counts[item.key]}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-foot">
        <div className="account-row">
          {accountName ? (
            <>
              <span className="account-name">{accountName}</span>
              <button type="button" className="account-button" onClick={onLogout}>
                <LogOut size={13} />
                退出
              </button>
            </>
          ) : (
            <button type="button" className="account-button" onClick={onOpenAccount}>
              <UserRound size={14} />
              登录账号
            </button>
          )}
        </div>
        {mode === "personal" && (
          <button type="button" className="lock-button" onClick={onLock}>
            <LockKeyhole size={14} />
            锁定
          </button>
        )}
        <div className="backup-row">
          <button type="button" className="backup-button" onClick={onExport}>
            <Download size={13} />
            备份
          </button>
          <button type="button" className="backup-button" onClick={onSync}>
            <Cloud size={13} />
            同步
          </button>
          <label className="backup-button">
            <Upload size={13} />
            恢复
            <input
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onImport(file);
                event.target.value = "";
              }}
            />
          </label>
        </div>
        <span className="local-note">本地加密存储</span>
      </div>
    </aside>
  );
}
