import { useRef, useState } from "react";
import { Bell, CheckCircle2, Circle, ListTodo, Pencil, Repeat, Trash2 } from "lucide-react";
import type { Priority, Task } from "../types";
import { formatCompletedAt, formatDue, isOverdue } from "../lib/tasks";
import { describeRepeat, shortRepeatLabel } from "../lib/repeat";

interface TaskListProps {
  tasks: Task[];
  selectedId: string | null;
  /** 详情模式：备注全文展示（不单行省略） */
  full?: boolean;
  /** 空态标题文案（默认"暂无任务"） */
  emptyText?: string;
  onToggle: (id: string) => void;
  onSelect: (task: Task) => void;
  onDelete: (task: Task) => void;
}

const PRIORITY_LABEL: Record<Priority, string> = {
  1: "紧急",
  2: "重要",
  3: "普通",
  4: "稍后",
};

export default function TaskList({
  tasks,
  selectedId,
  full = false,
  emptyText = "暂无任务",
  onToggle,
  onSelect,
  onDelete,
}: TaskListProps) {
  // v3.8 F 补漏：删除行收拢动画——标记 leaving，短暂播收起后真删（reduced-motion 直删）
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const leavingTimer = useRef<number | null>(null);
  const handleDelete = (task: Task) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onDelete(task);
      return;
    }
    setLeaving((prev) => new Set(prev).add(task.id));
    if (leavingTimer.current) window.clearTimeout(leavingTimer.current);
    leavingTimer.current = window.setTimeout(() => {
      setLeaving((prev) => {
        const next = new Set(prev);
        next.delete(task.id);
        return next;
      });
      onDelete(task);
    }, 200);
  };
  const isLeaving = (id: string) => leaving.has(id);

  if (tasks.length === 0) {
    return (
      <div className="empty">
        <ListTodo size={28} />
        <span>{emptyText}</span>
        {emptyText === "暂无任务" && (
          <span className="empty-hint">
            试试自然语言：<b>明天10点提交周报</b>、<b>每天8点提醒我打卡</b>、<b>每周一例会</b>
          </span>
        )}
      </div>
    );
  }

  return (
    <div>
      {tasks.map((task) => {
        const now = new Date();
        const due = formatDue(task, now);
        const overdue = isOverdue(task, now);
        const completedAt = formatCompletedAt(task, now);
        return (
          <article
            key={task.id}
            className={[
              "task-row",
              task.completed ? "done" : "",
              selectedId === task.id ? "selected" : "",
              isLeaving(task.id) ? "leaving" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => onSelect(task)}
            onDoubleClick={() => onSelect(task)}
          >
            <button
              type="button"
              className="check"
              aria-label={task.completed ? "标记为未完成" : "标记完成"}
              onClick={(event) => {
                event.stopPropagation();
                onToggle(task.id);
              }}
            >
              {/* v3.8 F：勾选图标随完成态翻转重挂一次，触发 pop 微动效（刷新不闪烁） */}
              <span key={task.completed ? "done" : "todo"} className="check-pop">
                {task.completed ? <CheckCircle2 size={18} /> : <Circle size={18} />}
              </span>
            </button>

            <div className="task-main">
              <div className="task-title-line">
                <span className="task-title">{task.title}</span>
                <span className={`priority p${task.priority}`}>{PRIORITY_LABEL[task.priority]}</span>
              </div>
              <div className="task-meta">
                {completedAt && (
                  <span className="meta-chip done-at">完成于 {completedAt}</span>
                )}
                {due && (
                  <span className={overdue ? "meta-chip overdue" : "meta-chip"}>
                    {overdue ? "已逾期" : due}
                  </span>
                )}
                {task.remindAt && (
                  <span className="meta-chip">
                    <Bell size={12} />
                    提醒
                  </span>
                )}
                {task.repeat && (
                  <span className="meta-chip repeat-chip" title={describeRepeat(task.repeat)}>
                    <Repeat size={12} />
                    {shortRepeatLabel(task.repeat)}
                  </span>
                )}
              </div>
              {task.notes && (
                <div className={full ? "task-note full" : "task-note"}>{task.notes}</div>
              )}
            </div>

            <div className="row-actions">
              <button
                type="button"
                aria-label="编辑"
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(task);
                }}
              >
                <Pencil size={15} />
              </button>
              <button
                type="button"
                className="danger"
                aria-label="删除"
                onClick={(event) => {
                  event.stopPropagation();
                  handleDelete(task);
                }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
