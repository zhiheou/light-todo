import { useEffect, useMemo, useRef } from "react";
import { renderMarkdown } from "../lib/markdown";

interface MarkdownProps {
  text: string;
  /** 预览态允许勾选复选框；编辑态传 undefined 禁用点击 */
  onToggleCheckbox?: (mid: string) => void;
}

export default function Markdown({ text, onToggleCheckbox }: MarkdownProps) {
  const { html } = useMemo(() => renderMarkdown(text), [text]);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target instanceof HTMLInputElement && target.type === "checkbox" && target.dataset.mid) {
        if (!onToggleCheckbox) {
          // 非可交互态：阻止默认勾选行为，保持只读预览
          event.preventDefault();
          return;
        }
        onToggleCheckbox(target.dataset.mid);
      }
    };
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, [onToggleCheckbox]);

  // 供外部判断是否有可渲染内容（空文本渲染空）
  if (!text.trim()) return null;

  return (
    <div className="markdown-body" ref={rootRef} dangerouslySetInnerHTML={{ __html: html }} />
  );
}
