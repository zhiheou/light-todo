import { useEffect, useState } from "react";
import { Pin, PinOff, X } from "lucide-react";
import type { Memo } from "../types";

interface MemoDrawerProps {
  memo: Memo;
  onSave: (patch: Partial<Memo>) => void;
  onDelete: (memo: Memo) => void;
  onClose: () => void;
}

export default function MemoDrawer({ memo, onSave, onDelete, onClose }: MemoDrawerProps) {
  const [text, setText] = useState(memo.text);
  const [pinned, setPinned] = useState(memo.pinned);

  useEffect(() => {
    setText(memo.text);
    setPinned(memo.pinned);
  }, [memo.id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="drawer" role="dialog" aria-label="编辑备忘">
      <div className="drawer-head">
        <h2>编辑备忘</h2>
        <button type="button" className="icon-button" aria-label="关闭" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <div className="field">
        <label htmlFor="memo-text">内容</label>
        <textarea
          id="memo-text"
          className="memo-textarea"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="记录一些零散的小事情"
          autoFocus
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

      <div className="drawer-actions">
        <button type="button" className="danger-button" onClick={() => onDelete(memo)}>
          删除
        </button>
        <button
          type="button"
          className="primary-button"
          onClick={() => {
            onSave({ text: text.trim() || "未命名备忘", pinned });
            onClose();
          }}
        >
          保存
        </button>
      </div>
    </div>
  );
}
