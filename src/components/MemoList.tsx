import { NotebookPen, Pencil, Pin, PinOff, Trash2 } from "lucide-react";
import type { Memo } from "../types";

interface MemoListProps {
  memos: Memo[];
  selectedId: string | null;
  onTogglePin: (id: string) => void;
  onSelect: (memo: Memo) => void;
  onDelete: (memo: Memo) => void;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MemoList({
  memos,
  selectedId,
  onTogglePin,
  onSelect,
  onDelete,
}: MemoListProps) {
  const sorted = [...memos].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt,
  );

  if (sorted.length === 0) {
    return (
      <div className="empty">
        <NotebookPen size={28} />
        <span>暂无备忘</span>
      </div>
    );
  }

  return (
    <div>
      {sorted.map((memo) => (
        <article
          key={memo.id}
          className={["memo-row", selectedId === memo.id ? "selected" : ""]
            .filter(Boolean)
            .join(" ")}
          onClick={() => onSelect(memo)}
        >
          <button
            type="button"
            className="pin-toggle"
            aria-label={memo.pinned ? "取消置顶" : "置顶"}
            onClick={(event) => {
              event.stopPropagation();
              onTogglePin(memo.id);
            }}
          >
            {memo.pinned ? <Pin size={15} /> : <PinOff size={15} />}
          </button>
          <div className="memo-main">
            <div className="memo-text">{memo.text}</div>
            <div className="task-meta">
              <span className="meta-chip">{formatTime(memo.updatedAt)}</span>
              {memo.pinned && <span className="meta-chip">置顶</span>}
            </div>
          </div>
          <div className="row-actions">
            <button
              type="button"
              aria-label="编辑"
              onClick={(event) => {
                event.stopPropagation();
                onSelect(memo);
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
                onDelete(memo);
              }}
            >
              <Trash2 size={15} />
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
