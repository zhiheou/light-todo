import { CalendarDays, ListTodo, Menu, NotebookPen } from "lucide-react";
import type { ViewFilter } from "../types";

interface MobileTabBarProps {
  view: ViewFilter;
  counts: Record<ViewFilter, number>;
  menuOpen: boolean;
  onSelectView: (view: ViewFilter) => void;
  onOpenMenu: () => void;
}

const TABS: Array<{ key: "today" | "all" | "notes"; label: string; icon: typeof CalendarDays }> = [
  { key: "today", label: "今日", icon: CalendarDays },
  { key: "all", label: "全部", icon: ListTodo },
  { key: "notes", label: "备忘", icon: NotebookPen },
];

/** 移动端底部 TabBar：今日 / 全部 / 备忘 / 更多（更多打开抽屉菜单） */
export default function MobileTabBar({
  view,
  counts,
  menuOpen,
  onSelectView,
  onOpenMenu,
}: MobileTabBarProps) {
  return (
    <nav className="mobile-tabbar" aria-label="移动端导航">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const count = counts[tab.key];
        return (
          <button
            key={tab.key}
            type="button"
            className={view === tab.key ? "active" : ""}
            onClick={() => onSelectView(tab.key)}
          >
            <span className="tab-icon">
              <Icon size={19} />
              {count > 0 && <i className="tab-badge">{count}</i>}
            </span>
            <span>{tab.label}</span>
          </button>
        );
      })}
      <button type="button" className={menuOpen ? "active" : ""} onClick={onOpenMenu}>
        <span className="tab-icon">
          <Menu size={19} />
        </span>
        <span>更多</span>
      </button>
    </nav>
  );
}
