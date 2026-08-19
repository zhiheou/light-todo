// 轻量 Markdown 渲染器：无第三方依赖，先转义 HTML 注入再解析。
// 支持：h1-h3 标题、**粗体**、*斜体*、行内代码、链接、- [ ] / - [x] 复选框清单、
// 无序/有序列表、段落。输出 HTML 字符串 + 复选框 data-mid 索引（供勾选回调翻转原文）。

export interface MarkdownRender {
  html: string;
  /** 按出现顺序的复选框 mid 列表 */
  ids: string[];
}

const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);
}

// 只放行安全协议，阻止 javascript:/data:/vbscript: 等注入链接
function safeHref(url: string): string {
  return /^(https?:|mailto:|#)/i.test(url) ? url : "#";
}

// 行内解析（输入已转义）。顺序：行内代码 → 链接 → 粗体 → 斜体。
function inline(text: string): string {
  return text
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, label, url) => {
      const href = safeHref(url);
      return `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

export function renderMarkdown(text: string): MarkdownRender {
  const ids: string[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let inParagraph = false;
  let checkboxIndex = 0;

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };
  const closePara = () => {
    if (inParagraph) {
      html.push("</p>");
      inParagraph = false;
    }
  };

  for (const raw of lines) {
    const trimmed = escapeHtml(raw.trim()).trim();
    if (!trimmed) {
      closeList();
      closePara();
      continue;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      closeList();
      closePara();
      const level = heading[1].length;
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      closeList();
      closePara();
      html.push("<hr/>");
      continue;
    }

    const checkbox = trimmed.match(/^[-*]\s+\[([ xX])\]\s+(.*)$/);
    if (checkbox) {
      if (listType !== "ul") {
        closeList();
        closePara();
        html.push('<ul class="md-check">');
        listType = "ul";
      }
      const mid = String(checkboxIndex++);
      ids.push(mid);
      const checked = checkbox[1].toLowerCase() === "x";
      html.push(
        `<li><label class="md-check-item"><input type="checkbox" data-mid="${mid}"${
          checked ? " checked" : ""
        }/><span>${inline(checkbox[2])}</span></label></li>`,
      );
      continue;
    }

    const unordered = trimmed.match(/^[-*]\s+(.*)$/);
    if (unordered) {
      if (listType !== "ul") {
        closeList();
        closePara();
        html.push("<ul>");
        listType = "ul";
      }
      html.push(`<li>${inline(unordered[1])}</li>`);
      continue;
    }

    const ordered = trimmed.match(/^\d+\.\s+(.*)$/);
    if (ordered) {
      if (listType !== "ol") {
        closeList();
        closePara();
        html.push("<ol>");
        listType = "ol";
      }
      html.push(`<li>${inline(ordered[1])}</li>`);
      continue;
    }

    // 段落：空行分隔；单换行保留为软换行
    closeList();
    if (!inParagraph) {
      html.push("<p>");
      inParagraph = true;
    } else {
      html.push("<br/>");
    }
    html.push(inline(trimmed));
  }

  closeList();
  closePara();
  return { html: html.join(""), ids };
}

// 按 mid（出现顺序索引）翻转第 N 个复选框的 [ ]/[x]，返回新原文。
export function toggleCheckbox(text: string, mid: string): string {
  const target = Number(mid);
  if (!Number.isInteger(target) || target < 0) return text;
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let seen = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(/^(\s*[-*]\s+\[)([ xX])(\]\s*.*)$/);
    if (!match) continue;
    if (seen === target) {
      const next = match[2].toLowerCase() === "x" ? " " : "x";
      lines[i] = `${match[1]}${next}${match[3]}`;
      return lines.join("\n");
    }
    seen += 1;
  }
  return text;
}

// 剥离 Markdown 标记，用于列表标题/摘要展示。
export function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,3}\s+/gm, "")
    .replace(/^\s*[-*]\s+\[[ xX]\]\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

// 列表标题：首行（剥离标记）截断。
export function memoTitle(text: string, max = 24): string {
  const first = text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!first) return "未命名备忘";
  const stripped = stripMarkdown(first);
  return stripped.length > max ? `${stripped.slice(0, max)}…` : stripped;
}

// 列表摘要：全文剥离标记、折叠空白、截断。
export function memoSummary(text: string, max = 60): string {
  const stripped = stripMarkdown(text).replace(/\s+/g, " ").trim();
  if (!stripped) return "未命名备忘";
  return stripped.length > max ? `${stripped.slice(0, max)}…` : stripped;
}
