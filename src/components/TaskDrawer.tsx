import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { Priority, Task } from "../types";

interface TaskDrawerProps {
  task: Task;
  onSave: (patch: Partial<Task>) => void;
  onDelete: (task: Task) => void;
  onClose: () => void;
}

const PRIORITIES: Array<{ value: Priority; label: string }> = [
  { value: 1, label: "紧急" },
  { value: 2, label: "重要" },
  { value: 3, label: "普通" },
  { value: 4, label: "稍后" },
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function isoToLocalInput(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(value: string): string {
  return value ? new Date(value).toISOString() : "";
}

function defaultRemindAt(dueDate: string, dueTime: string): string {
  if (!dueDate || !dueTime) return "";
  return new Date(new Date(`${dueDate}T${dueTime}:00`).getTime() - 10 * 60 * 1000).toISOString();
}

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function TaskDrawer({ task, onSave, onDelete, onClose }: TaskDrawerProps) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes);
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [dueDate, setDueDate] = useState(task.dueDate);
  const [dueTime, setDueTime] = useState(task.dueTime);
  const [remindAt, setRemindAt] = useState(isoToLocalInput(task.remindAt));

  useEffect(() => {
    setTitle(task.title);
    setNotes(task.notes);
    setPriority(task.priority);
    setDueDate(task.dueDate);
    setDueTime(task.dueTime);
    setRemindAt(
      isoToLocalInput(task.remindAt) ||
        isoToLocalInput(defaultRemindAt(task.dueDate, task.dueTime)),
    );
  }, [task.id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleSave() {
    const finalDueDate = dueTime && !dueDate ? todayLocal() : dueDate;
    const finalRemindAt =
      remindAt || (finalDueDate && dueTime ? defaultRemindAt(finalDueDate, dueTime) : "");
    onSave({
      title: title.trim() || "未命名任务",
      notes,
      priority,
      dueDate: finalDueDate,
      dueTime,
      remindAt: localInputToIso(finalRemindAt),
    });
    onClose();
  }

  return (
    <div className="drawer" role="dialog" aria-label="编辑任务">
      <div className="drawer-head">
        <h2>编辑任务</h2>
        <button type="button" className="icon-button" aria-label="关闭" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <div className="field">
        <label htmlFor="task-title">标题</label>
        <input
          id="task-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="任务标题"
        />
      </div>

      <div className="field">
        <label htmlFor="task-notes">备注</label>
        <textarea
          id="task-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="补充说明"
        />
      </div>

      <div className="field">
        <label>优先级</label>
        <div className="priority-picker">
          {PRIORITIES.map((item) => (
            <button
              key={item.value}
              type="button"
              className={[`p${item.value}`, priority === item.value ? "active" : ""]
                .filter(Boolean)
                .join(" ")}
              onClick={() => setPriority(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label htmlFor="task-due-date">截止日期</label>
        <input
          id="task-due-date"
          type="date"
          value={dueDate}
          onChange={(event) => {
            const next = event.target.value;
            setDueDate(next);
            if (!remindAt && next && dueTime) {
              setRemindAt(isoToLocalInput(defaultRemindAt(next, dueTime)));
            }
          }}
        />
      </div>

      <div className="field">
        <label htmlFor="task-due-time">截止时间</label>
        <input
          id="task-due-time"
          type="time"
          value={dueTime}
          onChange={(event) => {
            const next = event.target.value;
            setDueTime(next);
            if (!remindAt && dueDate && next) {
              setRemindAt(isoToLocalInput(defaultRemindAt(dueDate, next)));
            }
          }}
        />
      </div>

      <div className="field">
        <label htmlFor="task-remind">提醒时间</label>
        <input
          id="task-remind"
          type="datetime-local"
          value={remindAt}
          onChange={(event) => setRemindAt(event.target.value)}
        />
      </div>

      <div className="drawer-actions">
        <button type="button" className="danger-button" onClick={() => onDelete(task)}>
          删除
        </button>
        <button type="button" className="primary-button" onClick={handleSave}>
          保存
        </button>
      </div>
    </div>
  );
}
