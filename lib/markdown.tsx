import React from "react";
import { LIST_ITEM_RE } from "./list-editing";

/**
 * Lightweight, safe renderer for note bodies.
 * Produces React elements (never raw HTML), so user content cannot inject
 * markup. Supports headings, nested bullet/numbered lists, quotes, rules,
 * paragraphs, and inline **bold**, *italic*, <u>underline</u>, `code` and
 * [links](https://...).
 */

type ListNode = {
  ordered: boolean;
  start: number;
  width: number;
  items: { content: string[]; children: ListNode[] }[];
};

type Block =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; lines: string[] }
  | { type: "quote"; lines: string[] }
  | { type: "hr" }
  | { type: "list"; list: ListNode };

const widthOf = (s: string) => s.replace(/\t/g, "    ").length;

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let stack: ListNode[] = [];

  const closeLists = () => {
    stack = [];
  };

  for (const line of lines) {
    if (line.trim() === "") {
      closeLists();
      blocks.push({ type: "paragraph", lines: [] }); // paragraph separator marker
      continue;
    }

    const item = LIST_ITEM_RE.exec(line);
    if (item) {
      const [, indent, marker, , content] = item;
      const ordered = /\d/.test(marker);
      const w = widthOf(indent);

      while (stack.length && stack[stack.length - 1].width > w) stack.pop();
      let top = stack[stack.length - 1];

      if (top && top.width === w && top.ordered !== ordered) {
        // Same level, different list type: start a sibling list.
        stack.pop();
        top = stack[stack.length - 1];
        const sibling: ListNode = { ordered, start: ordered ? parseInt(marker, 10) : 1, width: w, items: [] };
        if (top && top.items.length) top.items[top.items.length - 1].children.push(sibling);
        else blocks.push({ type: "list", list: sibling });
        stack.push(sibling);
        top = sibling;
      } else if (!top || top.width < w) {
        const list: ListNode = { ordered, start: ordered ? parseInt(marker, 10) : 1, width: w, items: [] };
        if (top && top.items.length) top.items[top.items.length - 1].children.push(list);
        else blocks.push({ type: "list", list });
        stack.push(list);
        top = list;
      }

      top.items.push({ content: [content], children: [] });
      continue;
    }

    // Indented text directly under a list item continues that item.
    const lineIndent = widthOf(line.match(/^[ \t]*/)?.[0] ?? "");
    if (stack.length && lineIndent > 0) {
      const top = stack[stack.length - 1];
      top.items[top.items.length - 1]?.content.push(line.trim());
      continue;
    }
    closeLists();

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length as 1 | 2 | 3, text: heading[2] });
      continue;
    }

    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ type: "hr" });
      continue;
    }

    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote) {
      const last = blocks[blocks.length - 1];
      if (last && last.type === "quote") last.lines.push(quote[1]);
      else blocks.push({ type: "quote", lines: [quote[1]] });
      continue;
    }

    const last = blocks[blocks.length - 1];
    if (last && last.type === "paragraph" && last.lines.length) last.lines.push(line);
    else blocks.push({ type: "paragraph", lines: [line] });
  }

  return blocks.filter((b) => b.type !== "paragraph" || b.lines.length > 0);
}

function safeHref(url: string): string | null {
  const trimmed = url.trim();
  if (/^(https?:\/\/|mailto:)/i.test(trimmed)) return trimmed;
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
  return null;
}

const INLINE_RULES: { re: RegExp; render: (m: RegExpExecArray, key: string) => React.ReactNode }[] = [
  { re: /`([^`\n]+)`/, render: (m, key) => <code key={key}>{m[1]}</code> },
  {
    re: /\[([^\]\n]+)\]\(([^)\s]+)\)/,
    render: (m, key) => {
      const href = safeHref(m[2]);
      return href ? (
        <a key={key} href={href} target="_blank" rel="noopener noreferrer nofollow">
          {renderInline(m[1], key)}
        </a>
      ) : (
        <React.Fragment key={key}>{m[0]}</React.Fragment>
      );
    },
  },
  { re: /\*\*([^*\n]+?)\*\*/, render: (m, key) => <strong key={key}>{renderInline(m[1], key)}</strong> },
  { re: /__([^_\n]+?)__/, render: (m, key) => <strong key={key}>{renderInline(m[1], key)}</strong> },
  { re: /<u>(.+?)<\/u>/, render: (m, key) => <u key={key}>{renderInline(m[1], key)}</u> },
  { re: /(?<![*\w])\*(?!\s)([^*\n]+?)\*(?!\w)/, render: (m, key) => <em key={key}>{renderInline(m[1], key)}</em> },
  { re: /(?<![_\w])_(?!\s)([^_\n]+?)_(?!\w)/, render: (m, key) => <em key={key}>{renderInline(m[1], key)}</em> },
];

export function renderInline(text: string, keyPrefix = "i"): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let rest = text;
  let n = 0;
  while (rest) {
    let best: { idx: number; m: RegExpExecArray; rule: (typeof INLINE_RULES)[number] } | null = null;
    for (const rule of INLINE_RULES) {
      const m = rule.re.exec(rest);
      if (m && (best === null || m.index < best.idx)) best = { idx: m.index, m, rule };
    }
    if (!best) {
      out.push(rest);
      break;
    }
    if (best.idx > 0) out.push(rest.slice(0, best.idx));
    out.push(best.rule.render(best.m, `${keyPrefix}-${n++}`));
    rest = rest.slice(best.idx + best.m[0].length);
  }
  return out;
}

function withBreaks(lines: string[], key: string): React.ReactNode[] {
  return lines.flatMap((l, i) => {
    const parts = renderInline(l, `${key}-${i}`);
    return i === 0 ? parts : [<br key={`${key}-br-${i}`} />, ...parts];
  });
}

function renderList(list: ListNode, key: string): React.ReactNode {
  const items = list.items.map((it, i) => (
    <li key={`${key}-${i}`}>
      {withBreaks(it.content, `${key}-${i}`)}
      {it.children.map((child, c) => renderList(child, `${key}-${i}-${c}`))}
    </li>
  ));
  return list.ordered ? (
    <ol key={key} start={list.start !== 1 ? list.start : undefined}>
      {items}
    </ol>
  ) : (
    <ul key={key}>{items}</ul>
  );
}

export function NoteContent({
  source,
  className = "",
  compact = false,
}: {
  source: string;
  className?: string;
  compact?: boolean;
}) {
  const blocks = parseBlocks(source);
  return (
    <div className={`note-prose ${compact ? "note-prose-compact" : ""} ${className}`}>
      {blocks.map((b, i) => {
        const key = `b${i}`;
        switch (b.type) {
          case "heading": {
            const Tag = (`h${b.level}` as "h1" | "h2" | "h3");
            return <Tag key={key}>{renderInline(b.text, key)}</Tag>;
          }
          case "hr":
            return <hr key={key} />;
          case "quote":
            return <blockquote key={key}>{withBreaks(b.lines, key)}</blockquote>;
          case "list":
            return renderList(b.list, key);
          default:
            return <p key={key}>{withBreaks(b.lines, key)}</p>;
        }
      })}
    </div>
  );
}

/** Plain-text excerpt with Markdown syntax removed (for list rows / search). */
export function plainExcerpt(source: string): string {
  return source
    .replace(/<\/?u>/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^[ \t]*#{1,6}\s+/gm, "")
    .replace(/^[ \t]*>\s?/gm, "")
    .replace(/[*_`]{1,2}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
