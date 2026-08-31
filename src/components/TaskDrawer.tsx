import { useEffect, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import type { Dimension, Goal, Memo, Priority, RepeatRule, Task } from "../types";
import { memoTitle } from "../lib/markdown";

interface TaskDrawerProps {
  task: Task;
  memos: Memo[];
  dimensions?: Dimension[];
  goals?: Goal[];
  onOpenMemo: (id: string) => void;
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

export default function TaskDrawer({
  task,
  memos,
  dimensions = [],
  goals = [],
  onOpenMemo,
  onSave,
  onDelete,
  onClose,
}: TaskDrawerProps) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes);
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [dueDate, setDueDate] = useState(task.dueDate);
  const [dueTime, setDueTime] = useState(task.dueTime);
  const [remindAt, setRemindAt] = useState(isoToLocalInput(task.remindAt));
  const [repeat, setRepeat] = useState<RepeatRule | null>(task.repeat ?? null);
  const [memoId, setMemoId] = useState(task.memoId ?? "");
  const [dimensionId, setDimensionId] = useState(task.dimensionId ?? "");
  const [goalId, setGoalId] = useState(task.goalId ?? "");

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
    setRepeat(task.repeat ?? null);
    setMemoId(task.memoId ?? "");
    setDimensionId(task.dimensionId ?? "");
    setGoalId(task.goalId ?? "");
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
      repeat: repeat ?? undefined,
      memoId: memoId || undefined,
      dimensionId: dimensionId || undefined,
      goalId: goalId || undefined,
    });
    onClose();
  }

  // 关联备忘选择：按 updatedAt 倒序
  const memoOptions = [...memos].sort((a, b) => b.updatedAt - a.updatedAt);
  const linkedMemo = memoId ? memos.find((m) => m.id === memoId) ?? null : null;

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

      <div className="field">
        <label htmlFor="task-repeat">重复</label>
        <select
          id="task-repeat"
          value={repeat?.freq ?? "none"}
          onChange={(event) => {
            const value = event.target.value;
            if (value === "none") {
              setRepeat(null);
            } else if (value === "weekly") {
              setRepeat({ freq: "weekly", interval: 1, weekday: task.dueDate ? new Date(`${task.dueDate}T00:00:00`).getDay() : new Date().getDay() });
            } else if (value === "monthly") {
              setRepeat({ freq: "monthly", interval: 1, dayOfMonth: task.dueDate ? Number(task.dueDate.split("-")[2]) : new Date().getDate() });
            } else {
              setRepeat({ freq: value as "daily" | "weekday" | "interval", interval: 1 });
            }
          }}
        >
          <option value="none">不循环</option>
          <option value="daily">每天</option>
          <option value="weekday">每个工作日</option>
          <option value="weekly">每周</option>
          <option value="monthly">每月</option>
          <option value="interval">每隔 N 天</option>
        </select>
      </div>

      {repeat?.freq === "weekly" && (
        <div className="field">
          <label>星期</label>
          <div className="weekday-picker">
            {["日", "一", "二", "三", "四", "五", "六"].map((label, idx) => (
              <button
                key={label}
                type="button"
                className={repeat.weekday === idx ? "active" : ""}
                onClick={() => setRepeat({ ...repeat, weekday: idx })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {repeat?.freq === "monthly" && (
        <div className="field">
          <label htmlFor="task-repeat-day">每月的几号</label>
          <input
            id="task-repeat-day"
            type="number"
            min={1}
            max={31}
            value={repeat.dayOfMonth ?? 1}
            onChange={(event) => {
              const day = Math.min(31, Math.max(1, Number(event.target.value) || 1));
              setRepeat({ ...repeat, dayOfMonth: day });
            }}
          />
        </div>
      )}

      {repeat?.freq === "interval" && (
        <div className="field">
          <label htmlFor="task-repeat-interval">每隔几天</label>
          <input
            id="task-repeat-interval"
            type="number"
            min={1}
            value={repeat.interval}
            onChange={(event) => {
              const n = Math.max(1, Number(event.target.value) || 1);
              setRepeat({ ...repeat, interval: n });
            }}
          />
        </div>
      )}

      <div className="field">
        <label htmlFor="task-memo">关联备忘</label>
        <select
          id="task-memo"
          value={memoId}
          onChange={(event) => setMemoId(event.target.value)}
        >
          <option value="">无</option>
          {memoOptions.map((memo) => (
            <option key={memo.id} value={memo.id}>
              {memoTitle(memo.text)}
            </option>
          ))}
        </select>
        {linkedMemo && (
          <div className="linked-memo">
            <div className="linked-memo-text">
              <b>{memoTitle(linkedMemo.text)}</b>
              <span className="linked-memo-snippet">{linkedMemo.text.slice(0, 60)}</span>
            </div>
            <button
              type="button"
              className="icon-button"
              title="打开备忘"
              onClick={() => onOpenMemo(linkedMemo.id)}
            >
              <ExternalLink size={14} />
            </button>
          </div>
        )}
        {memoId && !linkedMemo && (
          <div className="linked-memo missing">
            <span>备忘已删除</span>
            <button type="button" className="secondary-button small" onClick={() => setMemoId("")}>
              清除关联
            </button>
          </div>
        )}
      </div>

      <div className="field-row">
        {dimensions.length > 0 && (
          <div className="field">
            <label htmlFor="task-dimension">维度</label>
            <select
              id="task-dimension"
              value={dimensionId}
              onChange={(event) => setDimensionId(event.target.value)}
            >
              <option value="">不指定</option>
              {dimensions.map((dim) => (
                <option key={dim.id} value={dim.id}>
                  {dim.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {goals.length > 0 && (
          <div className="field">
            <label htmlFor="task-goal">目标</label>
            <select
              id="task-goal"
              value={goalId}
              onChange={(event) => setGoalId(event.target.value)}
            >
              <option value="">不指定</option>
              {goals.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.title}
                </option>
              ))}
            </select>
          </div>
        )}
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
