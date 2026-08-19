import { NotebookPen, Pencil, Pin, PinOff, Trash2, Link2 } from "lucide-react";
import type { Memo } from "../types";
import { memoSummary, memoTitle } from "../lib/markdown";

interface MemoListProps {
  memos: Memo[];
  selectedId: string | null;
  allTags: string[];
  activeTag: string | null;
  onFilterTag: (tag: string | null) => void;
  linkedCounts: Record<string, number>;
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
  allTags,
  activeTag,
  onFilterTag,
  linkedCounts,
  onTogglePin,
  onSelect,
  onDelete,
}: MemoListProps) {
  const sorted = [...memos].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt,
  );

  if (sorted.length === 0 && allTags.length === 0) {
    return (
      <div className="empty">
        <NotebookPen size={28} />
        <span>暂无备忘</span>
        <span className="empty-hint">
          支持 Markdown：<b># 标题</b>、<b>- [ ] 待办清单</b>、<b>**重点**</b>
        </span>
      </div>
    );
  }

  return (
    <div>
      {allTags.length > 0 && (
        <div className="tag-filter">
          <button
            type="button"
            className={activeTag === null ? "tag-filter-chip active" : "tag-filter-chip"}
            onClick={() => onFilterTag(null)}
          >
            全部
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              className={activeTag === tag ? "tag-filter-chip active" : "tag-filter-chip"}
              onClick={() => onFilterTag(activeTag === tag ? null : tag)}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="empty">
          <NotebookPen size={28} />
          <span>{activeTag ? `没有「#${activeTag}」标签的备忘` : "暂无备忘"}</span>
        </div>
      ) : (
        sorted.map((memo) => (
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
              <div className="memo-title">{memoTitle(memo.text)}</div>
              <div className="memo-summary">{memoSummary(memo.text, 80)}</div>
              <div className="task-meta">
                <span className="meta-chip">{formatTime(memo.updatedAt)}</span>
                {memo.pinned && <span className="meta-chip">置顶</span>}
                {(memo.tags ?? []).map((tag) => (
                  <span key={tag} className="meta-chip tag-meta">
                    #{tag}
                  </span>
                ))}
                {linkedCounts[memo.id] && (
                  <span className="meta-chip linked-meta">
                    <Link2 size={11} />
                    {linkedCounts[memo.id]} 个任务
                  </span>
                )}
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
        ))
      )}
    </div>
  );
}
