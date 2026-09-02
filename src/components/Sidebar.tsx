import {
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  CircleDot,
  ListTodo,
  LockKeyhole,
  LogOut,
  NotebookPen,
  Sparkles,
  Target,
} from "lucide-react";
import type { Mode, ThemePrefs, ViewFilter } from "../types";
import AppearancePanel from "./AppearancePanel";

interface SidebarProps {
  mode: Mode;
  view: ViewFilter;
  counts: Record<ViewFilter, number>;
  onSelectView: (view: ViewFilter) => void;
  onToggleMode: () => void;
  onLock: () => void;
  accountName: string | null;
  onLogout: () => void;
  themePrefs: ThemePrefs;
  onThemeChange: (patch: Partial<ThemePrefs>) => void;
}

const NAV_ITEMS: Array<{ key: ViewFilter; label: string; icon: typeof CalendarDays }> = [
  { key: "today", label: "今日", icon: CalendarDays },
  { key: "calendar", label: "日历", icon: CalendarRange },
  { key: "goals", label: "目标", icon: Target },
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
  accountName,
  onLogout,
  themePrefs,
  onThemeChange,
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
          <span className="account-name">{accountName ?? ""}</span>
          <button type="button" className="account-button" onClick={onLogout}>
            <LogOut size={13} />
            退出
          </button>
        </div>
        {mode === "personal" && (
          <button type="button" className="lock-button" onClick={onLock}>
            <LockKeyhole size={14} />
            锁定
          </button>
        )}
        <AppearancePanel prefs={themePrefs} onChange={onThemeChange} />
      </div>
    </aside>
  );
}
