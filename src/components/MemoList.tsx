import { useState } from "react";
import { ArrowRightToLine, NotebookPen, Pencil, Pin, Trash2, Link2 } from "lucide-react";
import type { Memo } from "../types";
import { memoSummary } from "../lib/markdown";

/** 从文本里抽出 `#标签`（无空格标签），如"买牛奶 #生活" → text=买牛奶, tags=[生活] */
function splitInlineTags(input: string): { text: string; tags: string[] } {
  const tags = Array.from(input.matchAll(/#([^\s#]+)/g)).map((m) => m[1]);
  const text = input.replace(/#[^\s#]+/g, "").trim();
  return { text, tags };
}

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
  /** v3.8 G：顶部"随手记…"回车成卡；支持行内 #tag */
  onQuickAdd?: (text: string, tags?: string[]) => void;
  /** v3.9 收件箱：把一条备忘"转为待办"（App 用 NLP 解析成任务并移出） */
  onConvertToTask?: (memo: Memo) => void;
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
  onQuickAdd,
  onConvertToTask,
}: MemoListProps) {
  const [draft, setDraft] = useState("");
  const submitQuick = () => {
    const raw = draft.trim();
    if (!raw) return;
    const { text, tags } = splitInlineTags(raw);
    if (!text && tags.length === 0) return; // 只有 # 没有内容
    onQuickAdd?.(text || raw, tags.length > 0 ? tags : undefined);
    setDraft("");
  };

  const sorted = [...memos].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt,
  );

  if (sorted.length === 0 && allTags.length === 0 && !onQuickAdd) {
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
      {onQuickAdd && (
        <div className="memo-quickadd">
          <NotebookPen size={16} />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitQuick();
              }
            }}
            placeholder="随手记…（支持 #标签，回车成卡）"
            aria-label="随手记"
            maxLength={500}
          />
        </div>
      )}
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
            className={["memo-card", selectedId === memo.id ? "selected" : ""]
              .filter(Boolean)
              .join(" ")}
            onClick={() => onSelect(memo)}
          >
            {/* 操作区：置顶/转待办/编辑/删除 收进卡右上，平时低调、悬停浮出 */}
            <div className="memo-card-ops">
              <button
                type="button"
                className={memo.pinned ? "pin-toggle on" : "pin-toggle"}
                aria-label={memo.pinned ? "取消置顶" : "置顶"}
                onClick={(event) => {
                  event.stopPropagation();
                  onTogglePin(memo.id);
                }}
              >
                <Pin size={14} />
              </button>
              {onConvertToTask && (
                <button
                  type="button"
                  className="memo-totask"
                  title="转为待办"
                  aria-label="转为待办"
                  onClick={(event) => {
                    event.stopPropagation();
                    onConvertToTask(memo);
                  }}
                >
                  <ArrowRightToLine size={14} />
                </button>
              )}
              <button
                type="button"
                aria-label="编辑"
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(memo);
                }}
              >
                <Pencil size={14} />
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
                <Trash2 size={14} />
              </button>
            </div>

            {/* 正文：整段自然显示，卡片高度随内容走（短=小卡，长=大卡） */}
            <div className="memo-card-text">{memoSummary(memo.text, 240)}</div>

            <div className="memo-card-meta">
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
          </article>
        ))
      )}
    </div>
  );
}
