import {
  CalendarDays,
  CheckCircle2,
  CircleDot,
  Cloud,
  Download,
  Info,
  ListTodo,
  LockKeyhole,
  LogOut,
  NotebookPen,
  Sparkles,
  Upload,
} from "lucide-react";
import { useState } from "react";
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
  onLogout,
}: SidebarProps) {
  const [infoOpen, setInfoOpen] = useState(false);

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
        <div className="backup-row">
          <button
            type="button"
            className="backup-button"
            title="导出为本地 JSON 备份文件"
            onClick={onExport}
          >
            <Download size={13} />
            备份
          </button>
          <button
            type="button"
            className="backup-button"
            title="登录账号自动云端同步（也可配置 WebDAV）"
            onClick={onSync}
          >
            <Cloud size={13} />
            同步
          </button>
          <label className="backup-button" title="从备份 JSON 文件导入">
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
        <button
          type="button"
          className="local-note"
          onClick={() => setInfoOpen((open) => !open)}
          aria-expanded={infoOpen}
        >
          <Info size={12} />
          本地加密存储
        </button>
        {infoOpen && (
          <div className="local-note-panel">
            <p className="panel-lead">
              登录账号后，任务和备忘录会自动端到端加密同步到云端——换设备登录即可继续，
              日常无需手动操作。
            </p>
            <ul>
              <li><b>备份</b>：把全部数据导出为一个文件。换浏览器或换账号前，或想留一份"快照"防止误删时用。</li>
              <li><b>同步</b>：除内置云端外，可把加密备份手动上传到自己的 WebDAV 网盘（坚果云/群晖），完全自控。</li>
              <li><b>恢复</b>：从备份文件把数据导回来，适合迁移或找回误删内容。</li>
            </ul>
            <p className="panel-tail">简单说：自动同步负责日常；备份/恢复负责迁移和兜底，平时放着不用管。</p>
          </div>
        )}
      </div>
    </aside>
  );
}
