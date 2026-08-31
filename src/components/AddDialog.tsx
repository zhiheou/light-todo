import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Repeat, X } from "lucide-react";
import type { Dimension, Goal, Priority, RepeatRule } from "../types";
import { parseQuickAdd } from "../lib/nlp";
import { describeRepeat, shortRepeatLabel } from "../lib/repeat";

export interface TaskDraft {
  title: string;
  notes: string;
  priority: Priority;
  dueDate: string;
  dueTime: string;
  remindAt: string;
  repeat: RepeatRule | null;
  dimensionId?: string;
  goalId?: string;
}

interface AddDialogProps {
  kind: "task" | "memo";
  onSubmitTask: (draft: TaskDraft) => void;
  onSubmitMemo: (text: string) => void;
  onClose: () => void;
  dimensions?: Dimension[];
  goals?: Goal[];
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

// 截止日期显示（今天/明天/N月N日 [+ HH:MM]）
function dueChipLabel(dueDate: string, dueTime: string, now: Date): string {
  if (!dueDate) return "";
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const tomorrowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const tomorrow = `${tomorrowDate.getFullYear()}-${pad(tomorrowDate.getMonth() + 1)}-${pad(tomorrowDate.getDate())}`;
  const [, m, d] = dueDate.split("-").map(Number);
  const dateLabel = dueDate === today ? "今天" : dueDate === tomorrow ? "明天" : `${m}月${d}日`;
  return dueTime ? `${dateLabel} ${dueTime}` : dateLabel;
}

// 提醒时间显示（HH:MM 或 明天 HH:MM）
function remindChipLabel(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const tomorrowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const tomorrowKey = `${tomorrowDate.getFullYear()}-${pad(tomorrowDate.getMonth() + 1)}-${pad(tomorrowDate.getDate())}`;
  const label = key === todayKey ? "今天" : key === tomorrowKey ? "明天" : "";
  return `${label ? label + " " : ""}${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AddDialog({
  kind,
  onSubmitTask,
  onSubmitMemo,
  onClose,
  dimensions = [],
  goals = [],
}: AddDialogProps) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState<Priority>(3);
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [remindAt, setRemindAt] = useState("");
  const [repeat, setRepeat] = useState<RepeatRule | null>(null);
  const [dimensionId, setDimensionId] = useState("");
  const [goalId, setGoalId] = useState("");
  const [memoText, setMemoText] = useState("");
  // 用户手动改过的字段：NLP 不再覆盖
  const manual = useRef<Set<"dueDate" | "dueTime" | "remindAt" | "repeat" | "priority">>(new Set());

  const parsed = useMemo(() => parseQuickAdd({ title, notes, now: new Date() }), [title, notes]);

  useEffect(() => {
    if (!manual.current.has("dueDate")) setDueDate(parsed.dueDate);
    if (!manual.current.has("dueTime")) setDueTime(parsed.dueTime);
    if (!manual.current.has("remindAt"))
      setRemindAt(parsed.remindAt ? isoToLocalInput(parsed.remindAt) : "");
    if (!manual.current.has("repeat")) setRepeat(parsed.repeat);
    if (!manual.current.has("priority")) setPriority(parsed.priority);
  }, [parsed]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleTaskSubmit() {
    const finalRemindAt =
      remindAt ||
      (dueDate && dueTime ? defaultRemindAt(dueDate, dueTime) : "");
    onSubmitTask({
      title: parsed.title || title.trim() || "未命名任务",
      notes,
      priority,
      dueDate,
      dueTime,
      remindAt: localInputToIso(finalRemindAt),
      repeat,
      dimensionId: dimensionId || undefined,
      goalId: goalId || undefined,
    });
  }

  const hasParsed = Boolean(parsed.repeat || parsed.dueDate || parsed.remindAt || parsed.priority !== 3);

  return (
    <div className="modal-overlay">
      <div className="modal-box" role="dialog" aria-label={kind === "task" ? "添加任务" : "添加备忘"}>
        <div className="modal-head">
          <h2>{kind === "task" ? "添加任务" : "添加备忘"}</h2>
          <button type="button" className="icon-button" aria-label="关闭" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {kind === "task" ? (
          <>
            <div className="field">
              <label htmlFor="add-title">标题</label>
              <input
                id="add-title"
                autoFocus
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && title.trim()) {
                    event.preventDefault();
                    handleTaskSubmit();
                  }
                }}
                placeholder="例如：明天10点提交周报"
              />
            </div>

            <div className="field">
              <label htmlFor="add-notes">备注</label>
              <textarea
                id="add-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="补充说明（也能识别日期时间，例如：每周一上午9点例会）"
              />
            </div>

            {hasParsed && (
              <div className="nlp-preview">
                {parsed.repeat && (
                  <span className="nlp-chip" title={describeRepeat(parsed.repeat)}>
                    <Repeat size={11} />
                    循环 {shortRepeatLabel(parsed.repeat)}
                  </span>
                )}
                {parsed.dueDate && (
                  <span className="nlp-chip">截止 {dueChipLabel(parsed.dueDate, parsed.dueTime, new Date())}</span>
                )}
                {parsed.remindAt && <span className="nlp-chip">提醒 {remindChipLabel(parsed.remindAt)}</span>}
                {parsed.priority !== 3 && (
                  <span className="nlp-chip">优先级 {PRIORITIES.find((p) => p.value === parsed.priority)?.label}</span>
                )}
              </div>
            )}
            {!hasParsed && !parsed.title && (
              <div className="nlp-hint">
                输入一句话，自动识别日期/时间/循环/优先级。<br />
                <b>明天10点交周报</b> · <b>每天8点半提醒我喝水</b> · <b>每周一例会</b> ·{" "}
                <b>每月15号交房租</b> · <b>每隔3天浇花</b>
                <br />
                加 <b>紧急</b>/<b>重要</b>/<b>稍后</b> 可指定优先级
              </div>
            )}

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
                    onClick={() => {
                      manual.current.add("priority");
                      setPriority(item.value);
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label htmlFor="add-due-date">截止日期</label>
              <input
                id="add-due-date"
                type="date"
                value={dueDate}
                onChange={(event) => {
                  manual.current.add("dueDate");
                  const next = event.target.value;
                  setDueDate(next);
                  if (!manual.current.has("remindAt") && next && dueTime) {
                    setRemindAt(isoToLocalInput(defaultRemindAt(next, dueTime)));
                  }
                }}
              />
            </div>

            <div className="field">
              <label htmlFor="add-due-time">截止时间</label>
              <input
                id="add-due-time"
                type="time"
                value={dueTime}
                onChange={(event) => {
                  manual.current.add("dueTime");
                  const next = event.target.value;
                  setDueTime(next);
                  if (!manual.current.has("remindAt") && dueDate && next) {
                    setRemindAt(isoToLocalInput(defaultRemindAt(dueDate, next)));
                  }
                }}
              />
            </div>

            <div className="field">
              <label htmlFor="add-remind">提醒时间</label>
              <input
                id="add-remind"
                type="datetime-local"
                value={remindAt}
                onChange={(event) => {
                  manual.current.add("remindAt");
                  setRemindAt(event.target.value);
                }}
              />
            </div>

            <div className="field">
              <label htmlFor="add-repeat">重复</label>
              <select
                id="add-repeat"
                value={repeat?.freq ?? "none"}
                onChange={(event) => {
                  manual.current.add("repeat");
                  const value = event.target.value;
                  if (value === "none") {
                    setRepeat(null);
                  } else if (value === "weekly") {
                    setRepeat({ freq: "weekly", interval: 1, weekday: new Date().getDay() });
                  } else if (value === "monthly") {
                    setRepeat({ freq: "monthly", interval: 1, dayOfMonth: new Date().getDate() });
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
                      onClick={() => {
                        manual.current.add("repeat");
                        setRepeat({ ...repeat, weekday: idx });
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {repeat?.freq === "monthly" && (
              <div className="field">
                <label htmlFor="add-repeat-day">每月的几号</label>
                <input
                  id="add-repeat-day"
                  type="number"
                  min={1}
                  max={31}
                  value={repeat.dayOfMonth ?? new Date().getDate()}
                  onChange={(event) => {
                    manual.current.add("repeat");
                    const day = Math.min(31, Math.max(1, Number(event.target.value) || 1));
                    setRepeat({ ...repeat, dayOfMonth: day });
                  }}
                />
              </div>
            )}

            {repeat?.freq === "interval" && (
              <div className="field">
                <label htmlFor="add-repeat-interval">每隔几天</label>
                <input
                  id="add-repeat-interval"
                  type="number"
                  min={1}
                  value={repeat.interval}
                  onChange={(event) => {
                    manual.current.add("repeat");
                    const n = Math.max(1, Number(event.target.value) || 1);
                    setRepeat({ ...repeat, interval: n });
                  }}
                />
              </div>
            )}

            <div className="field-row">
              {dimensions.length > 0 && (
                <div className="field">
                  <label htmlFor="add-dimension">维度</label>
                  <select
                    id="add-dimension"
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
                  <label htmlFor="add-goal">目标</label>
                  <select
                    id="add-goal"
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

            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={onClose}>
                取消
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={!title.trim()}
                onClick={handleTaskSubmit}
              >
                <Plus size={15} />
                添加任务
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="field">
              <label htmlFor="add-memo">内容</label>
              <textarea
                id="add-memo"
                className="memo-textarea"
                autoFocus
                value={memoText}
                onChange={(event) => setMemoText(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                    event.preventDefault();
                    if (memoText.trim()) onSubmitMemo(memoText);
                  }
                }}
                placeholder="记录一些零散的小事情"
              />
            </div>

            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={onClose}>
                取消
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={!memoText.trim()}
                onClick={() => onSubmitMemo(memoText)}
              >
                <Plus size={15} />
                添加备忘
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
