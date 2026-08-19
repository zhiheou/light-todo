import { useEffect, useState } from "react";
import { Pin, PinOff, X, X as CloseTag } from "lucide-react";
import type { Memo, Task } from "../types";
import Markdown from "./Markdown";
import { toggleCheckbox } from "../lib/markdown";

interface MemoDrawerProps {
  memo: Memo;
  linkedTasks: Task[];
  onOpenTask: (id: string) => void;
  onSave: (patch: Partial<Memo>) => void;
  onDelete: (memo: Memo) => void;
  onClose: () => void;
}

function splitTags(input: string): string[] {
  return input
    .split(/[,，\s]+/)
    .map((tag) => tag.replace(/^#/, "").trim())
    .filter(Boolean);
}

export default function MemoDrawer({
  memo,
  linkedTasks,
  onOpenTask,
  onSave,
  onDelete,
  onClose,
}: MemoDrawerProps) {
  const [text, setText] = useState(memo.text);
  const [pinned, setPinned] = useState(memo.pinned);
  const [tags, setTags] = useState<string[]>(memo.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [tab, setTab] = useState<"edit" | "preview">("edit");

  useEffect(() => {
    setText(memo.text);
    setPinned(memo.pinned);
    setTags(memo.tags ?? []);
    setTagInput("");
    setTab("edit");
  }, [memo.id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function addTag(raw: string) {
    const [first, ...rest] = splitTags(raw);
    if (first) {
      setTags((prev) => (prev.includes(first) ? prev : [...prev, first]));
    }
    // 回车/逗号分隔多标签：都加进去
    for (const t of rest) {
      setTags((prev) => (prev.includes(t) ? prev : [...prev, t]));
    }
    setTagInput("");
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag));
  }

  return (
    <div className="drawer" role="dialog" aria-label="编辑备忘">
      <div className="drawer-head">
        <h2>编辑备忘</h2>
        <button type="button" className="icon-button" aria-label="关闭" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <div className="memo-tabs" role="tablist" aria-label="备忘编辑方式">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "edit"}
          className={tab === "edit" ? "active" : ""}
          onClick={() => setTab("edit")}
        >
          编辑
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "preview"}
          className={tab === "preview" ? "active" : ""}
          onClick={() => setTab("preview")}
        >
          预览
        </button>
      </div>

      {tab === "edit" ? (
        <div className="field">
          <label htmlFor="memo-text">内容</label>
          <textarea
            id="memo-text"
            className="memo-textarea"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="支持 Markdown：# 标题、- [ ] 清单、**粗体**、`代码`"
            autoFocus
          />
        </div>
      ) : (
        <div className="field">
          <label>预览</label>
          <div className="memo-preview">
            <Markdown
              text={text}
              onToggleCheckbox={(mid) => {
                // 翻转本地文本并立即持久化（保存到 memo）
                const nextText = toggleCheckbox(text, mid);
                setText(nextText);
                onSave({ text: nextText });
              }}
            />
          </div>
        </div>
      )}

      <div className="field">
        <label htmlFor="memo-tags">标签</label>
        {tags.length > 0 && (
          <div className="tag-list">
            {tags.map((tag) => (
              <span key={tag} className="tag-chip">
                #{tag}
                <button
                  type="button"
                  aria-label={`移除标签 ${tag}`}
                  onClick={() => removeTag(tag)}
                >
                  <CloseTag size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
        <input
          id="memo-tags"
          value={tagInput}
          onChange={(event) => setTagInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              if (tagInput.trim()) addTag(tagInput);
            }
          }}
          onBlur={() => {
            if (tagInput.trim()) addTag(tagInput);
          }}
          placeholder="输入标签，回车或逗号添加"
        />
      </div>

      <button
        type="button"
        className={pinned ? "pin-state active" : "pin-state"}
        onClick={() => setPinned((value) => !value)}
      >
        {pinned ? <Pin size={14} /> : <PinOff size={14} />}
        置顶
      </button>

      {linkedTasks.length > 0 && (
        <div className="linked-tasks">
          <label>
            被 {linkedTasks.length} 个任务引用
          </label>
          {linkedTasks.map((task) => (
            <button
              key={task.id}
              type="button"
              className="linked-task"
              onClick={() => onOpenTask(task.id)}
              title="跳转到任务"
            >
              {task.completed ? "✓ " : ""}
              {task.title || "未命名任务"}
              {task.dueDate ? ` · 截止 ${task.dueDate}` : ""}
            </button>
          ))}
        </div>
      )}

      <div className="drawer-actions">
        <button type="button" className="danger-button" onClick={() => onDelete(memo)}>
          删除
        </button>
        <button
          type="button"
          className="primary-button"
          onClick={() => {
            onSave({ text: text.trim() || "未命名备忘", pinned, tags });
            onClose();
          }}
        >
          保存
        </button>
      </div>
    </div>
  );
}
