/**
 * Plain-text list editing helpers for the note editor.
 *
 * Notes are stored as Markdown-style plain text in `notes.body`, so list
 * formatting (`- item`, `1. item`, indentation) is persisted and restored
 * exactly as typed. These helpers implement editor behaviour on top of that:
 * Enter continues a list, Enter on an empty item exits it, Tab / Shift+Tab
 * indent and outdent, and toolbar buttons toggle list formatting.
 */

export type EditResult = {
  value: string;
  selectionStart: number;
  selectionEnd: number;
};

// indent, marker (bullet char or "12." / "12)"), spacing, content
export const LIST_ITEM_RE = /^([ \t]*)([-*+•]|\d{1,9}[.)])([ \t]+)(.*)$/;

const INDENT_FALLBACK = "   ";

type ParsedItem = {
  indent: string;
  marker: string;
  spacing: string;
  content: string;
  ordered: boolean;
  number: number;
  delimiter: string;
};

export function parseListItem(line: string): ParsedItem | null {
  const m = LIST_ITEM_RE.exec(line);
  if (!m) return null;
  const [, indent, marker, spacing, content] = m;
  const ordered = /\d/.test(marker);
  return {
    indent,
    marker,
    spacing,
    content,
    ordered,
    number: ordered ? parseInt(marker, 10) : 0,
    delimiter: ordered ? marker.slice(-1) : marker,
  };
}

function indentWidth(indent: string) {
  return indent.replace(/\t/g, "    ").length;
}

function lineBounds(value: string, pos: number) {
  const start = value.lastIndexOf("\n", pos - 1) + 1;
  const nl = value.indexOf("\n", pos);
  const end = nl === -1 ? value.length : nl;
  return { start, end };
}

/** Bounds covering every line touched by a selection. */
function selectedLinesBounds(value: string, selStart: number, selEnd: number) {
  const start = value.lastIndexOf("\n", selStart - 1) + 1;
  // A selection ending at the very start of a line shouldn't include that line.
  const effectiveEnd = selEnd > selStart && value[selEnd - 1] === "\n" ? selEnd - 1 : selEnd;
  const nl = value.indexOf("\n", effectiveEnd);
  const end = nl === -1 ? value.length : nl;
  return { start, end };
}

/**
 * Renumber ordered lists so items count up consecutively at each nesting
 * level. The first item of each list keeps its number (so a list can
 * intentionally start at e.g. 5); following siblings continue from it.
 * A blank line or an unindented paragraph ends the list.
 */
export function renumberLists(value: string): string {
  const lines = value.split("\n");
  // Stack of open lists: indent width and last number used (null = bullet list).
  const stack: { width: number; last: number | null }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") {
      stack.length = 0;
      continue;
    }
    const item = parseListItem(line);
    if (!item) {
      const w = indentWidth(line.match(/^[ \t]*/)?.[0] ?? "");
      // Indented continuation text keeps lists open; otherwise close deeper lists.
      while (stack.length && stack[stack.length - 1].width >= w) stack.pop();
      continue;
    }

    const w = indentWidth(item.indent);
    while (stack.length && stack[stack.length - 1].width > w) stack.pop();

    const top = stack[stack.length - 1];
    if (top && top.width === w) {
      if (item.ordered && top.last !== null) {
        const next = top.last + 1;
        if (next !== item.number) {
          lines[i] = `${item.indent}${next}${item.delimiter}${item.spacing}${item.content}`;
        }
        top.last = next;
      } else {
        // List type changed at this level: start a fresh list.
        top.last = item.ordered ? item.number : null;
      }
    } else {
      stack.push({ width: w, last: item.ordered ? item.number : null });
    }
  }

  return lines.join("\n");
}

/** Shift a caret position to account for renumbering changing line lengths. */
function withRenumber(value: string, caret: number): { value: string; caret: number } {
  const renumbered = renumberLists(value);
  if (renumbered === value) return { value, caret };
  // Map caret by line + column (renumbering only changes the marker width).
  const before = value.slice(0, caret);
  const lineIndex = before.split("\n").length - 1;
  const column = caret - (before.lastIndexOf("\n") + 1);
  const oldLine = value.split("\n")[lineIndex] ?? "";
  const newLines = renumbered.split("\n");
  const newLine = newLines[lineIndex] ?? "";
  const delta = newLine.length - oldLine.length;
  const oldItem = parseListItem(oldLine);
  const markerEnd = oldItem ? oldItem.indent.length + oldItem.marker.length : 0;
  const newColumn = column >= markerEnd ? column + delta : column;
  let offset = 0;
  for (let i = 0; i < lineIndex; i++) offset += newLines[i].length + 1;
  return { value: renumbered, caret: offset + Math.max(0, Math.min(newColumn, newLine.length)) };
}

/**
 * Enter key inside a list item.
 * - Non-empty item: start a new item (next number / same bullet), splitting
 *   the text at the caret.
 * - Empty item: outdent one level if nested, otherwise exit the list
 *   (so pressing Enter twice leaves the list).
 * Returns null when the default newline behaviour should apply.
 */
export function handleListEnter(value: string, selStart: number, selEnd: number): EditResult | null {
  if (selStart !== selEnd) return null;
  const { start, end } = lineBounds(value, selStart);
  const line = value.slice(start, end);
  const item = parseListItem(line);
  if (!item) return null;

  const contentStart = start + item.indent.length + item.marker.length + item.spacing.length;
  if (selStart < contentStart) return null;

  if (item.content.trim() === "") {
    if (indentWidth(item.indent) > 0) {
      const res = outdentLines(value, selStart, selEnd);
      if (res) return res;
    }
    // Exit the list: clear the empty marker, leaving a blank line.
    const next = value.slice(0, start) + value.slice(end);
    return { value: next, selectionStart: start, selectionEnd: start };
  }

  const nextMarker = item.ordered ? `${item.number + 1}${item.delimiter}` : item.marker;
  const insertion = `\n${item.indent}${nextMarker}${item.spacing}`;
  const raw = value.slice(0, selStart) + insertion + value.slice(selStart).replace(/^[ \t]+/, "");
  const caret = selStart + insertion.length;
  const { value: renumbered, caret: mapped } = withRenumber(raw, caret);
  return { value: renumbered, selectionStart: mapped, selectionEnd: mapped };
}

/** Indent unit for nesting under the list item above (aligns with its text). */
function childIndentFor(lines: string[], index: number, currentIndent: string): string {
  const w = indentWidth(currentIndent);
  for (let i = index - 1; i >= 0; i--) {
    if (lines[i].trim() === "") break;
    const prev = parseListItem(lines[i]);
    if (!prev) continue;
    const pw = indentWidth(prev.indent);
    if (pw === w) return prev.indent + " ".repeat(prev.marker.length + prev.spacing.length);
    if (pw < w) break;
  }
  return currentIndent + INDENT_FALLBACK;
}

function parentIndentFor(lines: string[], index: number, currentIndent: string): string {
  const w = indentWidth(currentIndent);
  for (let i = index - 1; i >= 0; i--) {
    if (lines[i].trim() === "") break;
    const prev = parseListItem(lines[i]);
    if (!prev) continue;
    if (indentWidth(prev.indent) < w) return prev.indent;
  }
  return "";
}

/**
 * Apply `transform` to each selected line. `lines` is the whole document
 * (updated in place as lines change, so later lines see earlier edits) and
 * `index` is the absolute line index.
 */
function transformSelectedLines(
  value: string,
  selStart: number,
  selEnd: number,
  transform: (lines: string[], index: number) => string | null,
): EditResult | null {
  const { start, end } = selectedLinesBounds(value, selStart, selEnd);
  const allLines = value.split("\n");
  const firstLineIndex = value.slice(0, start).split("\n").length - 1;
  const block = value.slice(start, end).split("\n");

  let changed = false;
  let startShift = 0;
  const out = block.map((line, i) => {
    const index = firstLineIndex + i;
    const res = transform(allLines, index);
    if (res === null || res === line) return line;
    allLines[index] = res;
    changed = true;
    if (i === 0) {
      // Keep the caret on the same text: shift by the change before it.
      const col = selStart - start;
      const diff = res.length - line.length;
      startShift = col === 0 && diff < 0 ? 0 : Math.max(diff, -col);
    }
    return res;
  });
  if (!changed) return null;

  const newBlock = out.join("\n");
  const raw = value.slice(0, start) + newBlock + value.slice(end);
  const lengthDelta = newBlock.length - (end - start);
  const renumbered = renumberLists(raw);
  const finalDelta = renumbered.length - raw.length;
  const collapsed = selStart === selEnd;
  const newStart = Math.max(start, selStart + startShift);
  const newEnd = collapsed ? newStart : Math.max(newStart, selEnd + lengthDelta + finalDelta);
  return { value: renumbered, selectionStart: newStart, selectionEnd: newEnd };
}

/** Tab: nest the selected list item(s) one level deeper. */
export function indentLines(value: string, selStart: number, selEnd: number): EditResult | null {
  return transformSelectedLines(value, selStart, selEnd, (context, index) => {
    const item = parseListItem(context[index]);
    if (!item) return null;
    const newIndent = childIndentFor(context, index, item.indent);
    // A newly nested ordered item starts its own list at 1.
    const hasSiblingAtNewLevel = (() => {
      const nw = indentWidth(newIndent);
      for (let j = index - 1; j >= 0; j--) {
        if (context[j].trim() === "") return false;
        const prev = parseListItem(context[j]);
        if (!prev) continue;
        const pw = indentWidth(prev.indent);
        if (pw === nw) return prev.ordered === item.ordered;
        if (pw < nw) return false;
      }
      return false;
    })();
    const marker = item.ordered && !hasSiblingAtNewLevel ? `1${item.delimiter}` : item.marker;
    return `${newIndent}${marker}${item.spacing}${item.content}`;
  });
}

/** Shift+Tab: move the selected list item(s) up one nesting level. */
export function outdentLines(value: string, selStart: number, selEnd: number): EditResult | null {
  return transformSelectedLines(value, selStart, selEnd, (context, index) => {
    const item = parseListItem(context[index]);
    if (!item || indentWidth(item.indent) === 0) return null;
    const newIndent = parentIndentFor(context, index, item.indent);
    return `${newIndent}${item.marker}${item.spacing}${item.content}`;
  });
}

/**
 * Toolbar: toggle bullet or numbered formatting on the selected lines.
 * If every non-empty selected line is already that list type the markers are
 * removed; otherwise the lines are converted (preserving indentation).
 */
export function toggleList(
  value: string,
  selStart: number,
  selEnd: number,
  kind: "bullet" | "ordered",
): EditResult {
  const { start, end } = selectedLinesBounds(value, selStart, selEnd);
  const lines = value.slice(start, end).split("\n");
  const nonEmpty = lines.filter((l) => l.trim() !== "");
  const allMatch =
    nonEmpty.length > 0 &&
    nonEmpty.every((l) => {
      const it = parseListItem(l);
      return it && (kind === "ordered" ? it.ordered : !it.ordered);
    });

  let n = 0;
  const out = lines.map((line) => {
    const item = parseListItem(line);
    if (allMatch) {
      return item ? `${item.indent}${item.content}` : line;
    }
    if (line.trim() === "" && lines.length > 1) return line;
    const indent = item ? item.indent : line.match(/^[ \t]*/)?.[0] ?? "";
    const content = item ? item.content : line.slice(indent.length);
    n += 1;
    const marker = kind === "ordered" ? `${n}.` : "-";
    return `${indent}${marker} ${content}`;
  });

  const newBlock = out.join("\n");
  const raw = value.slice(0, start) + newBlock + value.slice(end);
  const renumbered = renumberLists(raw);
  const blockEnd = start + newBlock.length + (renumbered.length - raw.length);

  if (selStart === selEnd && lines.length === 1) {
    // Single caret: keep it on the same text (or after the new marker).
    const caret = Math.max(start, Math.min(blockEnd, blockEnd - (end - selStart)));
    return { value: renumbered, selectionStart: caret, selectionEnd: caret };
  }
  return { value: renumbered, selectionStart: start, selectionEnd: blockEnd };
}

/** Toolbar: toggle a line prefix such as "# " or "> " on the selected lines. */
export function toggleLinePrefix(
  value: string,
  selStart: number,
  selEnd: number,
  prefix: string,
): EditResult {
  const { start, end } = selectedLinesBounds(value, selStart, selEnd);
  const lines = value.slice(start, end).split("\n");
  const isHeading = /^#{1,6} $/.test(prefix);
  const headingRe = /^#{1,6} /;
  const all = lines.filter((l) => l.trim() !== "").every((l) => l.startsWith(prefix));

  const out = lines.map((line) => {
    if (line.trim() === "" && lines.length > 1) return line;
    if (all) return line.slice(prefix.length);
    const stripped = isHeading ? line.replace(headingRe, "") : line;
    return prefix + stripped;
  });

  const newBlock = out.join("\n");
  const next = value.slice(0, start) + newBlock + value.slice(end);
  const blockEnd = start + newBlock.length;
  if (selStart === selEnd && lines.length === 1) {
    const caret = Math.max(start, Math.min(blockEnd, blockEnd - (end - selStart)));
    return { value: next, selectionStart: caret, selectionEnd: caret };
  }
  return { value: next, selectionStart: start, selectionEnd: blockEnd };
}

/** Wrap the selection with inline markers (bold, italic, code, link...). */
export function wrapSelection(
  value: string,
  selStart: number,
  selEnd: number,
  before: string,
  after: string,
  placeholder: string,
): EditResult {
  const selected = value.slice(selStart, selEnd);
  // Toggle off when the selection is already wrapped.
  if (
    selected &&
    value.slice(selStart - before.length, selStart) === before &&
    value.slice(selEnd, selEnd + after.length) === after
  ) {
    const next = value.slice(0, selStart - before.length) + selected + value.slice(selEnd + after.length);
    return {
      value: next,
      selectionStart: selStart - before.length,
      selectionEnd: selEnd - before.length,
    };
  }
  const text = selected || placeholder;
  const next = value.slice(0, selStart) + before + text + after + value.slice(selEnd);
  return {
    value: next,
    selectionStart: selStart + before.length,
    selectionEnd: selStart + before.length + text.length,
  };
}
