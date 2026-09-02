import { CheckCircle2, Clock3, ListTodo, Sparkles } from "lucide-react";
import type { Task, ViewFilter } from "../types";
import { isCompletedToday, isOverdue } from "../lib/tasks";
import TaskList from "./TaskList";

interface ReviewViewProps {
  tasks: Task[];
  selectedId: string | null;
  onToggle: (id: string) => void;
  onSelect: (task: Task) => void;
  onDelete: (task: Task) => void;
  /** 点击统计卡跳转对应视图（今日 / 全部） */
  onOpenList: (view: ViewFilter) => void;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function ReviewView({
  tasks,
  selectedId,
  onToggle,
  onSelect,
  onDelete,
  onOpenList,
}: ReviewViewProps) {
  const now = new Date();
  const today = dateKey(now);
  const tomorrowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const tomorrow = dateKey(tomorrowDate);

  let todayDone = 0;
  let todayOpen = 0;
  let overdue = 0;
  const tomorrowTasks: Task[] = [];

  for (const task of tasks) {
    if (task.completed && (isCompletedToday(task, now) || task.dueDate === today)) todayDone += 1;
    if (!task.completed && task.dueDate === today) todayOpen += 1;
    if (isOverdue(task, now)) overdue += 1;
    if (!task.completed && task.dueDate === tomorrow) tomorrowTasks.push(task);
  }

  const p1Tomorrow = tomorrowTasks.filter((task) => task.priority === 1);
  const suggestions: string[] = [];
  if (overdue > 0) suggestions.push(`今天还有 ${overdue} 项已逾期，建议优先处理。`);
  if (p1Tomorrow.length > 0) suggestions.push(`明天有 ${p1Tomorrow.length} 项高优先级任务，建议今晚提前准备。`);
  if (tomorrowTasks.length > 0) suggestions.push(`明天共 ${tomorrowTasks.length} 项待办，可提前排好顺序。`);
  if (todayOpen > 0) suggestions.push(`今天还有 ${todayOpen} 项未完成，可以尽快收尾。`);
  if (todayDone > 0) suggestions.push(`今天完成了 ${todayDone} 项，继续保持。`);
  if (suggestions.length === 0) suggestions.push("今天还没有完成记录，可以从一件小事开始。");

  const statCells: Array<{ icon: typeof ListTodo; value: number; label: string; to: ViewFilter }> = [
    { icon: CheckCircle2, value: todayDone, label: "今日完成", to: "today" },
    { icon: ListTodo, value: todayOpen, label: "今日未完成", to: "today" },
    { icon: Clock3, value: overdue, label: "已逾期", to: "today" },
    { icon: Sparkles, value: tomorrowTasks.length, label: "明日待办", to: "all" },
  ];

  return (
    <div className="review-view">
      <div className="review-summary">
        <div className="review-head">
          <Sparkles size={16} />
          <h2>今日智能回顾</h2>
        </div>
        <div className="stat-grid">
          {statCells.map((cell) => {
            const Icon = cell.icon;
            return (
              <button
                key={cell.label}
                type="button"
                className="stat-cell"
                onClick={() => onOpenList(cell.to)}
                title={`查看${cell.label}`}
              >
                <Icon size={15} />
                <span className="stat-value">{cell.value}</span>
                <span className="stat-label">{cell.label}</span>
              </button>
            );
          })}
        </div>
        <div className="suggestion-box">
          {suggestions.map((text) => (
            <p key={text}>{text}</p>
          ))}
        </div>
      </div>

      <div className="review-section">
        <div className="review-head">
          <ListTodo size={16} />
          <h2>明日待办</h2>
        </div>
        <TaskList
          tasks={tomorrowTasks}
          selectedId={selectedId}
          onToggle={onToggle}
          onSelect={onSelect}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
}
