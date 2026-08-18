import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import type { Priority } from "../types";

export interface TaskDraft {
  title: string;
  notes: string;
  priority: Priority;
  dueDate: string;
  dueTime: string;
  remindAt: string;
}

interface AddDialogProps {
  kind: "task" | "memo";
  onSubmitTask: (draft: TaskDraft) => void;
  onSubmitMemo: (text: string) => void;
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

export default function AddDialog({
  kind,
  onSubmitTask,
  onSubmitMemo,
  onClose,
}: AddDialogProps) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState<Priority>(3);
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [remindAt, setRemindAt] = useState("");
  const [memoText, setMemoText] = useState("");

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
      title,
      notes,
      priority,
      dueDate,
      dueTime,
      remindAt: localInputToIso(finalRemindAt),
    });
  }

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
                placeholder="例如：明天 10:00 提交周报 高"
              />
            </div>

            <div className="field">
              <label htmlFor="add-notes">备注</label>
              <textarea
                id="add-notes"
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
              <label htmlFor="add-due-date">截止日期</label>
              <input
                id="add-due-date"
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
              <label htmlFor="add-due-time">截止时间</label>
              <input
                id="add-due-time"
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
              <label htmlFor="add-remind">提醒时间</label>
              <input
                id="add-remind"
                type="datetime-local"
                value={remindAt}
                onChange={(event) => setRemindAt(event.target.value)}
              />
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
