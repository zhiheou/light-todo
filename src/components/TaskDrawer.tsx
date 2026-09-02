import { useEffect, useRef, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import type { Dimension, Goal, Memo, Priority, RepeatRule, Task } from "../types";
import { memoTitle } from "../lib/markdown";
import { parseQuickAdd } from "../lib/nlp";

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

/** 快捷日期：只给常见选项，避免每次打开原生 date 选择器费劲 */
const DATE_CHIPS: Array<{ key: string; label: string }> = [
  { key: "today", label: "今天" },
  { key: "tomorrow", label: "明天" },
  { key: "dayAfter", label: "后天" },
  { key: "weekend", label: "周末" },
  { key: "nextMonday", label: "下周一" },
  { key: "nextMonth", label: "下月" },
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

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 计算每个快捷 chip 对应的日期字符串 */
function chipDate(key: string, now: Date): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (key === "today") return toDateKey(d);
  if (key === "tomorrow") {
    d.setDate(d.getDate() + 1);
    return toDateKey(d);
  }
  if (key === "dayAfter") {
    d.setDate(d.getDate() + 2);
    return toDateKey(d);
  }
  if (key === "weekend") {
    // 本周末 = 距离最近的周六（今天恰好周六则用今天）
    while (d.getDay() !== 6) d.setDate(d.getDate() + 1);
    return toDateKey(d);
  }
  if (key === "nextMonday") {
    // 从今天起算下周一（今天若是周一则跳到下周一）
    const delta = (1 - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + delta);
    return toDateKey(d);
  }
  if (key === "nextMonth") {
    // 下月 1 日（自动跨年）
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return toDateKey(next);
  }
  return "";
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
  /** 编辑标题时由 NLP 自动填了日期/时间 → 显示一条轻提示 */
  const [autoHint, setAutoHint] = useState("");
  /** 用户手动改过的字段：标题里的日期词不再覆盖 */
  const manual = useRef<Set<"dueDate" | "dueTime" | "remindAt">>(new Set());

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
    setAutoHint("");
    manual.current.clear();
  }, [task.id]);

  /** 关抽屉（点外部 / X / Esc / 跳备忘）：有改动先保存再关，不静默丢失 */
  function commitAndClose() {
    const patch = buildPatch();
    if (patch) onSave(patch);
    onClose();
  }

  /** 构造待保存补丁；若无改动返回 null */
  function buildPatch(): Partial<Task> | null {
    const finalDueDate = dueTime && !dueDate ? todayLocal() : dueDate;
    const finalRemindAt =
      remindAt || (finalDueDate && dueTime ? defaultRemindAt(finalDueDate, dueTime) : "");
    const next: Partial<Task> = {
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
    };
    const changed =
      next.title !== task.title ||
      next.notes !== task.notes ||
      next.priority !== task.priority ||
      next.dueDate !== task.dueDate ||
      next.dueTime !== task.dueTime ||
      next.remindAt !== task.remindAt ||
      (next.repeat ? JSON.stringify(next.repeat) !== JSON.stringify(task.repeat) : !!task.repeat) ||
      next.memoId !== (task.memoId ?? undefined) ||
      next.dimensionId !== (task.dimensionId ?? undefined) ||
      next.goalId !== (task.goalId ?? undefined);
    return changed ? next : null;
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") commitAndClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commitAndClose]);

  /** 编辑标题：含日期/时间词时自动填截止日期/时间（用户手动改过的不覆盖） */
  function handleTitleChange(value: string) {
    setTitle(value);
    const parsed = parseQuickAdd({ title: value, notes, now: new Date() });
    const parts: string[] = [];
    let touched = false;
    if (parsed.dueDate && !manual.current.has("dueDate")) {
      setDueDate(parsed.dueDate);
      parts.push(parsed.dueDate);
      touched = true;
    }
    if (parsed.dueTime && !manual.current.has("dueTime")) {
      setDueTime(parsed.dueTime);
      parts.push(parsed.dueTime);
      touched = true;
    }
    // 日期时间齐了且没设过提醒 → 自动补默认提醒（提前 10 分钟）
    const targetDate = manual.current.has("dueDate") ? dueDate : parsed.dueDate;
    const targetTime = manual.current.has("dueTime") ? dueTime : parsed.dueTime;
    if (
      touched &&
      !manual.current.has("remindAt") &&
      !remindAt &&
      targetDate &&
      targetTime
    ) {
      setRemindAt(isoToLocalInput(defaultRemindAt(targetDate, targetTime)));
    }
    setAutoHint(touched ? `已从标题识别：${parts.join(" ")}` : "");
  }

  /** 点击快捷日期 chip：显式选择，之后标题里的日期词不再覆盖该字段 */
  function applyChip(key: string) {
    const next = chipDate(key, new Date());
    if (!next) return;
    setDueDate(next);
    manual.current.add("dueDate");
    if (dueTime && !remindAt) setRemindAt(isoToLocalInput(defaultRemindAt(next, dueTime)));
  }

  // 关联备忘选择：按 updatedAt 倒序
  const memoOptions = [...memos].sort((a, b) => b.updatedAt - a.updatedAt);
  const linkedMemo = memoId ? memos.find((m) => m.id === memoId) ?? null : null;

  return (
    <>
      <div className="drawer-backdrop" onClick={commitAndClose} />
      <div className="drawer" role="dialog" aria-label="编辑任务">
        <div className="drawer-head">
          <h2>编辑任务</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="关闭"
            onClick={commitAndClose}
          >
            <X size={18} />
          </button>
        </div>

        <div className="field">
          <label htmlFor="task-title">标题</label>
          <input
            id="task-title"
            value={title}
            onChange={(event) => handleTitleChange(event.target.value)}
            placeholder="含日期/时间会自动识别，如「今天下午4点开会」"
          />
          {autoHint && <div className="nlp-hint">{autoHint}</div>}
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
          <div className="date-chips" role="group" aria-label="快捷日期">
            {DATE_CHIPS.map((chip) => (
              <button
                key={chip.key}
                type="button"
                className={dueDate === chipDate(chip.key, new Date()) ? "active" : ""}
                onClick={() => applyChip(chip.key)}
              >
                {chip.label}
              </button>
            ))}
          </div>
          <input
            id="task-due-date"
            type="date"
            value={dueDate}
            onChange={(event) => {
              const next = event.target.value;
              setDueDate(next);
              manual.current.add("dueDate");
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
              manual.current.add("dueTime");
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
            onChange={(event) => {
              setRemindAt(event.target.value);
              manual.current.add("remindAt");
            }}
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
                onClick={() => {
                  // 先保存任务改动再跳备忘，避免跳转后编辑丢失
                  commitAndClose();
                  onOpenMemo(linkedMemo.id);
                }}
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
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              const patch = buildPatch();
              if (patch) onSave(patch);
              onClose();
            }}
          >
            保存
          </button>
        </div>
      </div>
    </>
  );
}
