"use client";

import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { Note, NoteColor } from "@/lib/types";
import {
  IconArchive,
  IconArchiveRestore,
  IconBold,
  IconBookOpen,
  IconCheck,
  IconClock,
  IconCloudCheck,
  IconCloudOff,
  IconCode,
  IconDownload,
  IconIndent,
  IconItalic,
  IconLink,
  IconListBullet,
  IconListOrdered,
  IconMoreHorizontal,
  IconOutdent,
  IconPalette,
  IconPenLine,
  IconPin,
  IconQuote,
  IconRedo,
  IconSave,
  IconShare,
  IconStar,
  IconTrash,
  IconUnderline,
  IconUndo,
  IconX,
} from "./icons";
import { createNote, updateNote, deleteNote } from "@/app/actions";
import { ExportModal } from "./export-modal";
import { ShareModal } from "./share-modal";
import { isBlank, validateNote } from "@/lib/note-validation";
import { requestNotificationPermission } from "@/lib/reminders";
import {
  EditResult,
  handleListEnter,
  indentLines,
  outdentLines,
  toggleLinePrefix,
  toggleList,
  wrapSelection,
} from "@/lib/list-editing";
import { NoteContent } from "@/lib/markdown";

interface NoteEditorProps {
  note: Note;
  onClose: () => void;
  onUpdate: (updated: Note) => void;
  onDelete: (id: number) => void;
}

type Snapshot = { title: string; body: string; selStart: number; selEnd: number };

export const NOTE_COLORS: { name: NoteColor; label: string; swatch: string }[] = [
  { name: "default", label: "Default", swatch: "var(--surface)" },
  { name: "violet", label: "Violet", swatch: "#8b5cf6" },
  { name: "sky", label: "Sky", swatch: "#0ea5e9" },
  { name: "emerald", label: "Emerald", swatch: "#10b981" },
  { name: "amber", label: "Amber", swatch: "#f59e0b" },
  { name: "rose", label: "Rose", swatch: "#f43f5e" },
  { name: "slate", label: "Slate", swatch: "#64748b" },
];

/** ISO timestamp -> value for <input type="datetime-local"> in local time. */
function toLocalInputValue(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Closes a popover when clicking outside of it. */
function useDismiss(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, onClose]);
  return ref;
}

function ToolbarButton({
  onClick,
  title,
  active = false,
  disabled = false,
  children,
}: {
  onClick: () => void;
  title: string;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      // Keep focus (and the selection) in the textarea when clicking.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex h-8 min-w-8 shrink-0 items-center justify-center rounded-lg px-1.5 text-[13px] font-semibold transition-colors duration-150 disabled:pointer-events-none disabled:opacity-30 ${
        active ? "bg-accent-soft text-accent-text" : "text-muted hover:bg-hover hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

function HeaderIconButton({
  onClick,
  title,
  active = false,
  tone = "default",
  children,
}: {
  onClick: () => void;
  title: string;
  active?: boolean;
  tone?: "default" | "danger";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-150 ${
        active
          ? "bg-accent-soft text-accent-text"
          : tone === "danger"
            ? "text-muted hover:bg-danger-soft hover:text-danger"
            : "text-muted hover:bg-hover hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

function MenuItem({
  icon,
  onSelect,
  children,
}: {
  icon: React.ReactNode;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-fg transition-colors hover:bg-hover"
    >
      <span className="text-muted">{icon}</span>
      {children}
    </button>
  );
}

const Divider = () =><div className="mx-1 h-5 w-px shrink-0 bg-line" aria-hidden="true" />;

export function NoteEditor({
  note: initialNote,
  onClose,
  onUpdate,
  onDelete,
}: NoteEditorProps) {
  const [note, setNote] = useState<Note>(initialNote);
  const [title, setTitle] = useState(initialNote.title);
  const [body, setBody] = useState(initialNote.body);
  const [color, setColor] = useState<NoteColor>(initialNote.color || "default");
  const [reminderAt, setReminderAt] = useState<string>(initialNote.reminder_at || "");
  const [mode, setMode] = useState<"write" | "preview">("write");
  // Distraction-free: chrome fades while typing, returns on mouse movement.
  const [isTyping, setIsTyping] = useState(false);

  // Save state (shared by auto-save and the Save button)
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "offline">("saved");
  const [lastSavedTime, setLastSavedTime] = useState<Date | null>(null);
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Feedback specific to the manual Save button
  const [manualSave, setManualSave] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [isClosing, setIsClosing] = useState(false);
  // Set when a save was blocked by validation, so the message also shows for
  // notes the user hasn't edited yet (e.g. pressing Save on an empty draft).
  const [saveBlocked, setSaveBlocked] = useState(false);

  // Reminder popover draft + validation
  const [reminderDraft, setReminderDraft] = useState("");
  const [reminderMin, setReminderMin] = useState("");
  const [reminderError, setReminderError] = useState<string | null>(null);
  const [reminderSaving, setReminderSaving] = useState(false);

  // Modals / popovers
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showReminderPicker, setShowReminderPicker] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const colorRef = useDismiss(showColorPicker, useCallback(() => setShowColorPicker(false), []));
  const reminderRef = useDismiss(showReminderPicker, useCallback(() => setShowReminderPicker(false), []));
  const moreRef = useDismiss(showMoreMenu, useCallback(() => setShowMoreMenu(false), []));

  // Undo / redo history (typing is grouped into bursts)
  const historyRef = useRef<{ stack: Snapshot[]; index: number; lastPush: number }>({
    stack: [{ title: initialNote.title, body: initialNote.body, selStart: 0, selEnd: 0 }],
    index: 0,
    lastPush: 0,
  });
  const [{ canUndo, canRedo }, setHistoryFlags] = useState({ canUndo: false, canRedo: false });
  const syncHistoryFlags = () => {
    const h = historyRef.current;
    setHistoryFlags({ canUndo: h.index > 0, canRedo: h.index < h.stack.length - 1 });
  };

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const isDirtyRef = useRef(false);
  // Incremented on every edit; a save only clears "unsaved" if no edits
  // happened while it was in flight.
  const editVersionRef = useRef(0);
  // Latest saved note (so queued saves use the real id after a create).
  const noteRef = useRef<Note>(initialNote);
  // Saves run one at a time to avoid races (e.g. creating a note twice).
  const saveQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSelection = useRef<{ start: number; end: number } | null>(null);

  const markDirty = () => {
    isDirtyRef.current = true;
    editVersionRef.current += 1;
    setHasUnsaved(true);
  };

  // Keep note synchronized if parent updates it
  useEffect(() => {
    setNote(initialNote);
    // Never go back to a temporary (unsaved) id once the note has a real one.
    if (!(noteRef.current.id > 0 && initialNote.id <= 0)) noteRef.current = initialNote;
  }, [initialNote]);

  // Focus the title for brand-new, untitled notes; otherwise the body.
  useEffect(() => {
    if (isBlank(initialNote.title) || (initialNote.title === "Untitled Note" && isBlank(initialNote.body))) {
      titleRef.current?.select();
    } else {
      const ta = textareaRef.current;
      if (ta) {
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      }
    }
    // Only on open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-grow the textarea and restore a pending selection after edits.
  useLayoutEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
    if (pendingSelection.current) {
      const { start, end } = pendingSelection.current;
      pendingSelection.current = null;
      ta.focus();
      ta.setSelectionRange(start, end);
    }
  }, [body, mode]);

  const pushHistory = (snapshot: Snapshot, coalesce: boolean) => {
    const h = historyRef.current;
    const now = Date.now();
    const stack = h.stack.slice(0, h.index + 1);
    if (coalesce && now - h.lastPush < 600 && stack.length > 1) {
      stack[stack.length - 1] = snapshot;
    } else {
      stack.push(snapshot);
      if (stack.length > 100) stack.shift();
    }
    h.stack = stack;
    h.index = stack.length - 1;
    h.lastPush = coalesce ? now : 0;
    syncHistoryFlags();
  };

  const restoreSnapshot = (s: Snapshot) => {
    setTitle(s.title);
    setBody(s.body);
    pendingSelection.current = { start: s.selStart, end: s.selEnd };
    markDirty();
    syncHistoryFlags();
  };

  const handleUndo = () => {
    const h = historyRef.current;
    if (h.index > 0) {
      h.index -= 1;
      h.lastPush = 0;
      restoreSnapshot(h.stack[h.index]);
    }
  };

  const handleRedo = () => {
    const h = historyRef.current;
    if (h.index < h.stack.length - 1) {
      h.index += 1;
      h.lastPush = 0;
      restoreSnapshot(h.stack[h.index]);
    }
  };

  type SaveResult =
    | { ok: true }
    | { ok: false; error: string; invalid?: boolean; field?: "note" | "title" };

  // Perform save to Supabase (queued so only one save runs at a time).
  // Validation runs first: empty notes and titles without a letter are never
  // sent to the server (manual save, auto-save and pin/colour/etc. alike).
  const performSave = useCallback(
    (overrideFields?: Partial<Note>): Promise<SaveResult> => {
      const version = editVersionRef.current;
      const validation = validateNote(
        overrideFields?.title !== undefined ? overrideFields.title : title,
        overrideFields?.body !== undefined ? overrideFields.body : body,
      );
      if (!validation.ok) {
        setSaveBlocked(true);
        return Promise.resolve({ ok: false, error: validation.error, invalid: true, field: validation.field });
      }
      setSaveBlocked(false);
      const payload = {
        // A blank title with content is stored as "Untitled".
        title: validation.title,
        body: validation.body,
        color: overrideFields?.color !== undefined ? overrideFields.color : color,
        is_pinned: overrideFields?.is_pinned !== undefined ? overrideFields.is_pinned : note.is_pinned,
        is_favorite: overrideFields?.is_favorite !== undefined ? overrideFields.is_favorite : note.is_favorite,
        is_archived: overrideFields?.is_archived !== undefined ? overrideFields.is_archived : note.is_archived,
        reminder_at: overrideFields?.reminder_at !== undefined ? overrideFields.reminder_at : reminderAt || null,
      };

      const run = async (): Promise<SaveResult> => {
        setSaveStatus("saving");
        try {
          const current = noteRef.current;
          let res;
          let saved: Note;
          if (current.id <= 0) {
            res = await createNote(payload);
            if (!res.success || !res.data) throw new Error(res.error || "Could not create the note.");
            saved = { ...current, ...(res.data as Note) };
          } else {
            res = await updateNote(current.id, payload);
            if (!res.success) throw new Error(res.error || "Could not save the note.");
            saved = { ...current, ...payload, updated_at: new Date().toISOString() };
          }
          noteRef.current = saved;
          setNote(saved);
          onUpdate(saved);
          setSaveStatus("saved");
          setSaveError(null);
          setLastSavedTime(new Date());
          if (editVersionRef.current === version) {
            isDirtyRef.current = false;
            setHasUnsaved(false);
          }
          return { ok: true };
        } catch (err) {
          const message =
            err instanceof Error && err.message ? err.message : "Couldn't reach the server. Check your connection.";
          setSaveStatus("offline");
          setSaveError(message);
          return { ok: false, error: message };
        }
      };

      const next = saveQueueRef.current.then(run, run);
      saveQueueRef.current = next;
      return next;
    },
    [body, color, note, onUpdate, reminderAt, title],
  );

  // Debounced auto-save
  useEffect(() => {
    if (!isDirtyRef.current) return;

    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      if (isDirtyRef.current) performSave();
    }, 1000);

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    };
  }, [title, body, color, reminderAt, performSave]);

  // Manual save (Save button / Ctrl+S) — runs immediately, independent of the
  // auto-save timer, and gives explicit success / failure feedback.
  const handleManualSave = async () => {
    if (manualSave === "saving") return;
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    if (manualFeedbackTimerRef.current) clearTimeout(manualFeedbackTimerRef.current);
    setManualSave("saving");
    const result = await performSave();
    setManualSave(result.ok ? "success" : "error");
    if (!result.ok && result.invalid) {
      if (result.field === "title") titleRef.current?.focus();
      else if (isBlank(title)) titleRef.current?.focus();
    }
    manualFeedbackTimerRef.current = setTimeout(
      () => setManualSave("idle"),
      result.ok ? 2200 : 5000,
    );
  };

  // Close safely: save pending changes first; if that fails, ask before
  // discarding them.
  const handleClose = async () => {
    if (isClosing) return;
    if (isDirtyRef.current) {
      setIsClosing(true);
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      const result = await performSave();
      setIsClosing(false);
      if (!result.ok) {
        const isNewDraft = noteRef.current.id <= 0;
        if (result.invalid && result.field === "note" && isNewDraft) {
          // A brand-new note with nothing in it: just discard it, nothing is lost.
        } else {
          const message = result.invalid
            ? isNewDraft
              ? `${result.error}\n\nClose and discard this note?`
              : `${result.error}\n\nClose without saving? Your last saved version will be kept.`
            : `Your latest changes couldn't be saved:\n${result.error}\n\nClose anyway and lose them?`;
          if (!confirm(message)) {
            if (result.invalid && result.field === "title") titleRef.current?.focus();
            return;
          }
        }
        isDirtyRef.current = false;
      }
    } else {
      // Let any in-flight save finish before unmounting.
      await saveQueueRef.current;
    }
    onClose();
  };

  // Keyboard: Ctrl/Cmd+S saves, Escape closes (modals handle their own Escape first).
  const handleEscape = () => {
    if (showReminderPicker || showColorPicker || showMoreMenu) {
      setShowReminderPicker(false);
      setShowColorPicker(false);
      setShowMoreMenu(false);
      return;
    }
    handleClose();
  };
  const handleManualSaveRef = useRef(handleManualSave);
  const handleEscapeRef = useRef(handleEscape);
  useEffect(() => {
    handleManualSaveRef.current = handleManualSave;
    handleEscapeRef.current = handleEscape;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleManualSaveRef.current();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleEscapeRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Warn before leaving the page (refresh, tab close) with unsaved changes.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // Last-resort flush if the editor unmounts some other way with pending edits.
  const performSaveRef = useRef(performSave);
  useEffect(() => {
    performSaveRef.current = performSave;
  }, [performSave]);
  useEffect(() => {
    return () => {
      if (isDirtyRef.current) performSaveRef.current();
      if (manualFeedbackTimerRef.current) clearTimeout(manualFeedbackTimerRef.current);
    };
  }, []);

  // ---- Reminder -------------------------------------------------------------

  const validateReminder = (value: string): string | null => {
    if (!value) return "Choose a date and time.";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "Enter a valid date and time.";
    if (d.getTime() < Date.now()) return "Reminders can't be in the past. Choose a future date and time.";
    return null;
  };

  const openReminderPicker = () => {
    if (showReminderPicker) {
      setShowReminderPicker(false);
      return;
    }
    setReminderMin(toLocalInputValue(new Date().toISOString()));
    setReminderDraft(reminderAt ? toLocalInputValue(reminderAt) : "");
    setReminderError(null);
    setShowReminderPicker(true);
  };

  const applyReminder = async () => {
    const error = validateReminder(reminderDraft);
    if (error) {
      setReminderError(error);
      return;
    }
    // Ask for notification permission here, while we're inside the user's
    // click (browsers ignore permission requests made without a gesture).
    void requestNotificationPermission();
    const iso = new Date(reminderDraft).toISOString();
    const previous = reminderAt;
    setReminderSaving(true);
    setReminderAt(iso);
    markDirty();
    const result = await performSave({ reminder_at: iso });
    setReminderSaving(false);
    if (result.ok) {
      setShowReminderPicker(false);
    } else {
      // Don't show a reminder that wasn't stored (or keep retrying it).
      setReminderAt(previous);
      setReminderError(`Couldn't save the reminder: ${result.error}`);
    }
  };

  const clearReminder = async () => {
    const previous = reminderAt;
    setReminderAt("");
    setReminderError(null);
    markDirty();
    setReminderSaving(true);
    const result = await performSave({ reminder_at: null });
    setReminderSaving(false);
    if (result.ok) {
      setReminderDraft("");
      setShowReminderPicker(false);
    } else {
      setReminderAt(previous);
      setReminderError(`Couldn't remove the reminder: ${result.error}`);
    }
  };

  // ---- Body editing ---------------------------------------------------------

  const applyEdit = (result: EditResult | null) => {
    if (!result) return false;
    setBody(result.value);
    markDirty();
    pendingSelection.current = { start: result.selectionStart, end: result.selectionEnd };
    pushHistory(
      { title, body: result.value, selStart: result.selectionStart, selEnd: result.selectionEnd },
      false,
    );
    return true;
  };

  const withSelection = (fn: (value: string, start: number, end: number) => EditResult | null) => {
    if (mode !== "write") setMode("write");
    const ta = textareaRef.current;
    const start = ta ? ta.selectionStart : body.length;
    const end = ta ? ta.selectionEnd : body.length;
    return applyEdit(fn(body, start, end));
  };

  const formatBold = () => withSelection((v, s, e) => wrapSelection(v, s, e, "**", "**", "bold text"));
  const formatItalic = () => withSelection((v, s, e) => wrapSelection(v, s, e, "*", "*", "italic text"));
  const formatUnderline = () => withSelection((v, s, e) => wrapSelection(v, s, e, "<u>", "</u>", "underlined"));
  const formatCode = () => withSelection((v, s, e) => wrapSelection(v, s, e, "`", "`", "code"));
  const formatLink = () =>
    withSelection((v, s, e) => {
      const r = wrapSelection(v, s, e, "[", "](https://)", "link text");
      // Select the URL part when wrapping existing text so it can be typed over.
      if (s !== e) {
        const urlStart = r.selectionEnd + 2;
        return { ...r, selectionStart: urlStart, selectionEnd: urlStart + 8 };
      }
      return r;
    });
  const formatHeading = (level: 1 | 2 | 3) =>
    withSelection((v, s, e) => toggleLinePrefix(v, s, e, `${"#".repeat(level)} `));
  const formatQuote = () => withSelection((v, s, e) => toggleLinePrefix(v, s, e, "> "));
  const formatBullets = () => withSelection((v, s, e) => toggleList(v, s, e, "bullet"));
  const formatNumbers = () => withSelection((v, s, e) => toggleList(v, s, e, "ordered"));
  const formatIndent = () => withSelection(indentLines);
  const formatOutdent = () => withSelection(outdentLines);

  const handleBodyKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    const ta = e.currentTarget;
    const mod = e.metaKey || e.ctrlKey;
    if (!mod && !e.altKey && (e.key.length === 1 || e.key === "Enter" || e.key === "Backspace")) {
      if (!isTyping) setIsTyping(true);
    }

    if (e.key === "Enter" && !e.shiftKey && !mod && !e.altKey) {
      if (applyEdit(handleListEnter(ta.value, ta.selectionStart, ta.selectionEnd))) e.preventDefault();
      return;
    }

    if (e.key === "Tab" && !mod && !e.altKey) {
      const fn = e.shiftKey ? outdentLines : indentLines;
      // Only capture Tab on list lines so keyboard navigation still works elsewhere.
      if (applyEdit(fn(ta.value, ta.selectionStart, ta.selectionEnd))) e.preventDefault();
      return;
    }

    if (!mod) return;
    const key = e.key.toLowerCase();
    if (key === "z" && !e.shiftKey) {
      e.preventDefault();
      handleUndo();
    } else if ((key === "z" && e.shiftKey) || key === "y") {
      e.preventDefault();
      handleRedo();
    } else if (key === "b") {
      e.preventDefault();
      formatBold();
    } else if (key === "i") {
      e.preventDefault();
      formatItalic();
    } else if (key === "u") {
      e.preventDefault();
      formatUnderline();
    } else if (key === "k") {
      e.preventDefault();
      formatLink();
    } else if (e.shiftKey && e.code === "Digit7") {
      e.preventDefault();
      formatNumbers();
    } else if (e.shiftKey && e.code === "Digit8") {
      e.preventDefault();
      formatBullets();
    }
  };

  // ---- Note actions ---------------------------------------------------------

  const handleTogglePin = () => {
    const newPinned = !note.is_pinned;
    setNote((prev) => ({ ...prev, is_pinned: newPinned }));
    performSave({ is_pinned: newPinned });
  };

  const handleToggleFavorite = () => {
    const newFav = !note.is_favorite;
    setNote((prev) => ({ ...prev, is_favorite: newFav }));
    performSave({ is_favorite: newFav });
  };

  const handleToggleArchive = () => {
    const newArchived = !note.is_archived;
    setNote((prev) => ({ ...prev, is_archived: newArchived }));
    performSave({ is_archived: newArchived });
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this note?")) return;
    if (noteRef.current.id <= 0) {
      // Never saved: nothing to delete on the server.
      isDirtyRef.current = false;
      onClose();
      return;
    }
    const res = await deleteNote(noteRef.current.id);
    if (res.success) {
      isDirtyRef.current = false;
      onDelete(noteRef.current.id);
      onClose();
    }
  };

  const liveValidation = validateNote(title, body);
  const validationMessage =
    !liveValidation.ok && (hasUnsaved || saveBlocked) ? liveValidation : null;

  const wordCount = body.trim() ? body.trim().split(/\s+/).length : 0;

  const statusLabel =
    saveStatus === "saving"
      ? "Saving…"
      : validationMessage
        ? "Not saved — fix to save"
        : saveStatus === "offline"
        ? "Not saved"
        : hasUnsaved
          ? "Unsaved changes"
          : lastSavedTime
            ? `Saved at ${lastSavedTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
            : "All changes saved";

  return (
    <div
      className="fixed inset-0 z-40 flex bg-bg animate-fade-in"
      onMouseMove={() => {
        if (isTyping) setIsTyping(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title || "Note editor"}
        className={`flex h-full w-full flex-col overflow-hidden animate-slide-up note-color-${color}`}
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <header className={`flex h-14 shrink-0 items-center justify-between gap-2 border-b border-line px-2 sm:px-5 ${isTyping ? "opacity-30 hover:opacity-100 focus-within:opacity-100" : "opacity-100"} transition-opacity duration-500`}>
          <div className="flex min-w-0 items-center gap-1">
            <HeaderIconButton onClick={handleClose} title="Close editor (Esc)">
              {isClosing ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-line-strong border-t-accent" />
              ) : (
                <IconX size={18} />
              )}
            </HeaderIconButton>

            <span
              className={`ml-1 flex items-center gap-1.5 truncate rounded-full px-2.5 py-1 text-[11px] font-medium ${
                saveStatus === "offline"
                  ? "bg-danger-soft text-danger"
                  : (hasUnsaved || validationMessage) && saveStatus !== "saving"
                    ? "text-warning"
                    : "text-subtle"
              }`}
              aria-live="polite"
            >
              {saveStatus === "saving" ? (
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-warning" />
              ) : saveStatus === "offline" ? (
                <IconCloudOff size={13} />
              ) : hasUnsaved || validationMessage ? (
                <span className="h-1.5 w-1.5 rounded-full bg-warning" />
              ) : (
                <IconCloudCheck size={13} className="text-success" />
              )}
              <span className="hidden truncate sm:inline">{statusLabel}</span>
            </span>
          </div>

          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={handleManualSave}
              disabled={manualSave === "saving"}
              title="Save now (Ctrl+S)"
              aria-label="Save note"
              className={`mr-1 flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold shadow-soft transition-all duration-150 active:scale-[0.97] disabled:cursor-wait ${
                manualSave === "success"
                  ? "bg-success/15 text-success ring-1 ring-success/30"
                  : manualSave === "error"
                    ? "bg-danger-soft text-danger ring-1 ring-danger/30"
                    : "bg-accent text-accent-fg hover:bg-accent-hover"
              }`}
            >
              {manualSave === "saving" ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : manualSave === "success" ? (
                <IconCheck size={15} />
              ) : manualSave === "error" ? (
                <IconCloudOff size={15} />
              ) : (
                <IconSave size={15} />
              )}
              <span className="hidden sm:inline">
                {manualSave === "saving"
                  ? "Saving…"
                  : manualSave === "success"
                    ? "Saved"
                    : manualSave === "error"
                      ? "Retry"
                      : "Save"}
              </span>
            </button>
            <HeaderIconButton
              onClick={handleTogglePin}
              title={note.is_pinned ? "Unpin note" : "Pin note"}
              active={note.is_pinned}
            >
              <IconPin size={16} />
            </HeaderIconButton>
            <HeaderIconButton
              onClick={handleToggleFavorite}
              title={note.is_favorite ? "Remove from favorites" : "Add to favorites"}
              active={note.is_favorite}
            >
              <IconStar size={16} filled={note.is_favorite} />
            </HeaderIconButton>

            {/* Reminder */}
            <div className="relative" ref={reminderRef}>
              <HeaderIconButton
                onClick={openReminderPicker}
                title="Set reminder"
                active={Boolean(reminderAt)}
              >
                <IconClock size={16} />
              </HeaderIconButton>
              {showReminderPicker && (
                <div className="absolute right-0 top-full z-30 mt-2 w-72 rounded-xl border border-line bg-elevated p-4 shadow-float animate-pop">
                  <div className="text-xs font-semibold text-fg">Reminder</div>
                  <p className="mt-0.5 text-[11px] leading-snug text-subtle">
                    Pick a future date and time. You&apos;ll be notified while DAVELE is open in a tab.
                  </p>
                  <form
                    className="mt-3"
                    noValidate
                    onSubmit={(e) => {
                      e.preventDefault();
                      applyReminder();
                    }}
                  >
                    <input
                      type="datetime-local"
                      value={reminderDraft}
                      min={reminderMin}
                      aria-label="Reminder date and time"
                      aria-invalid={Boolean(reminderError)}
                      aria-describedby={reminderError ? "reminder-error" : undefined}
                      onChange={(e) => {
                        setReminderDraft(e.target.value);
                        setReminderError(e.target.value ? validateReminder(e.target.value) : null);
                      }}
                      className={`w-full rounded-lg border bg-sunken px-2.5 py-2 text-xs text-fg outline-none transition focus:ring-2 ${
                        reminderError
                          ? "border-danger focus:border-danger focus:ring-danger/25"
                          : "border-line focus:border-accent focus:ring-accent-ring"
                      }`}
                    />
                    {reminderError && (
                      <p id="reminder-error" role="alert" className="mt-2 text-[11px] font-medium leading-snug text-danger">
                        {reminderError}
                      </p>
                    )}
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="submit"
                        disabled={reminderSaving || !reminderDraft || Boolean(reminderError)}
                        className="flex-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {reminderSaving ? "Saving…" : reminderAt ? "Update reminder" : "Set reminder"}
                      </button>
                      {reminderAt && (
                        <button
                          type="button"
                          onClick={clearReminder}
                          className="rounded-lg px-3 py-1.5 text-xs font-medium text-danger transition hover:bg-danger-soft"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </form>
                </div>
              )}
            </div>

            {/* Colour */}
            <div className="relative" ref={colorRef}>
              <HeaderIconButton onClick={() => setShowColorPicker((v) => !v)} title="Note colour">
                <IconPalette size={16} />
              </HeaderIconButton>
              {showColorPicker && (
                <div className="absolute right-0 top-full z-30 mt-2 rounded-xl border border-line bg-elevated p-3 shadow-float animate-pop">
                  <div className="mb-2 text-xs font-semibold text-fg">Colour</div>
                  <div className="flex gap-2">
                    {NOTE_COLORS.map((c) => (
                      <button
                        key={c.name}
                        type="button"
                        onClick={() => {
                          setColor(c.name);
                          setShowColorPicker(false);
                          markDirty();
                          performSave({ color: c.name });
                        }}
                        title={c.label}
                        aria-label={c.label}
                        style={{ background: c.swatch }}
                        className={`h-7 w-7 rounded-full border border-line-strong transition-transform duration-150 hover:scale-110 ${
                          color === c.name ? "ring-2 ring-accent ring-offset-2 ring-offset-elevated" : ""
                        }`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* More */}
            <div className="relative" ref={moreRef}>
              <HeaderIconButton onClick={() => setShowMoreMenu((v) => !v)} title="More actions">
                <IconMoreHorizontal size={18} />
              </HeaderIconButton>
              {showMoreMenu && (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-30 mt-2 w-56 overflow-hidden rounded-xl border border-line bg-elevated p-1.5 shadow-float animate-pop"
                >
                  <MenuItem
                    icon={<IconShare size={15} />}
                    onSelect={() => {
                      setShowMoreMenu(false);
                      setIsShareOpen(true);
                    }}
                  >
                    Share
                  </MenuItem>
                  <MenuItem
                    icon={<IconDownload size={15} />}
                    onSelect={() => {
                      setShowMoreMenu(false);
                      setIsExportOpen(true);
                    }}
                  >
                    Export
                  </MenuItem>
                  <MenuItem
                    icon={note.is_archived ? <IconArchiveRestore size={15} /> : <IconArchive size={15} />}
                    onSelect={() => {
                      setShowMoreMenu(false);
                      handleToggleArchive();
                    }}
                  >
                    {note.is_archived ? "Restore from archive" : "Archive"}
                  </MenuItem>
                  <div className="my-1 h-px bg-line" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setShowMoreMenu(false);
                      handleDelete();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-danger transition-colors hover:bg-danger-soft"
                  >
                    <IconTrash size={15} />
                    Delete note
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {saveStatus === "offline" && saveError && (
          <div
            role="alert"
            className="flex shrink-0 items-center justify-between gap-3 border-b border-danger/25 bg-danger-soft px-4 py-2 text-xs text-danger animate-slide-up sm:px-6"
          >
            <span className="min-w-0 truncate">
              <span className="font-semibold">Couldn&apos;t save.</span> {saveError}
            </span>
            <button
              type="button"
              onClick={handleManualSave}
              className="shrink-0 rounded-md px-2 py-1 font-semibold underline-offset-2 hover:underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* ── Writing surface ────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[46rem] px-5 pb-32 pt-10 sm:px-10 sm:pt-16">
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                markDirty();
                pushHistory({ title: e.target.value, body, selStart: 0, selEnd: 0 }, true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  setMode("write");
                  pendingSelection.current = { start: 0, end: 0 };
                  textareaRef.current?.focus();
                  textareaRef.current?.setSelectionRange(0, 0);
                }
              }}
              placeholder="Untitled"
              aria-label="Note title"
              aria-invalid={validationMessage?.field === "title"}
              aria-describedby={validationMessage ? "note-validation" : undefined}
              className="w-full bg-transparent text-[30px] font-semibold leading-tight tracking-[-0.02em] text-fg outline-none placeholder:text-subtle sm:text-[38px]"
            />

            {/* Meta */}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-subtle">
              <span>
                Edited{" "}
                {new Date(note.updated_at || note.created_at).toLocaleDateString([], {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
              {reminderAt && (
                <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 font-medium text-accent-text">
                  <IconClock size={11} />
                  {new Date(reminderAt).toLocaleString([], {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
              {note.is_archived && (
                <span className="rounded-full bg-hover px-2 py-0.5 font-medium text-muted">Archived</span>
              )}
            </div>

            {validationMessage && (
              <p
                id="note-validation"
                role="alert"
                className="mt-3 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[13px] font-medium leading-snug text-warning animate-pop"
              >
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-warning" aria-hidden="true" />
                <span>
                  {validationMessage.error}
                  <span className="font-normal text-muted"> Nothing will be saved until this is fixed.</span>
                </span>
              </p>
            )}

            {/* Formatting toolbar */}
            <div className={`sticky top-0 z-10 -mx-2 mt-6 pt-2 sm:-mx-3 ${isTyping ? "pointer-events-none opacity-0" : "opacity-100"} transition-opacity duration-500`}>
              <div
                role="toolbar"
                aria-label="Formatting"
                className="flex items-center gap-0.5 overflow-x-auto rounded-xl border border-line bg-elevated/90 p-1 shadow-soft backdrop-blur-md"
              >
                <ToolbarButton onClick={handleUndo} title="Undo (Ctrl+Z)" disabled={!canUndo}>
                  <IconUndo size={16} />
                </ToolbarButton>
                <ToolbarButton onClick={handleRedo} title="Redo (Ctrl+Shift+Z)" disabled={!canRedo}>
                  <IconRedo size={16} />
                </ToolbarButton>
                <Divider />
                <ToolbarButton onClick={() => formatHeading(1)} title="Heading 1">H1</ToolbarButton>
                <ToolbarButton onClick={() => formatHeading(2)} title="Heading 2">H2</ToolbarButton>
                <ToolbarButton onClick={() => formatHeading(3)} title="Heading 3">H3</ToolbarButton>
                <Divider />
                <ToolbarButton onClick={formatBold} title="Bold (Ctrl+B)">
                  <IconBold size={16} />
                </ToolbarButton>
                <ToolbarButton onClick={formatItalic} title="Italic (Ctrl+I)">
                  <IconItalic size={16} />
                </ToolbarButton>
                <ToolbarButton onClick={formatUnderline} title="Underline (Ctrl+U)">
                  <IconUnderline size={16} />
                </ToolbarButton>
                <Divider />
                <ToolbarButton onClick={formatBullets} title="Bulleted list (Ctrl+Shift+8)">
                  <IconListBullet size={16} />
                </ToolbarButton>
                <ToolbarButton onClick={formatNumbers} title="Numbered list (Ctrl+Shift+7)">
                  <IconListOrdered size={16} />
                </ToolbarButton>
                <ToolbarButton onClick={formatOutdent} title="Decrease indent (Shift+Tab)">
                  <IconOutdent size={16} />
                </ToolbarButton>
                <ToolbarButton onClick={formatIndent} title="Increase indent (Tab)">
                  <IconIndent size={16} />
                </ToolbarButton>
                <Divider />
                <ToolbarButton onClick={formatQuote} title="Quote">
                  <IconQuote size={15} />
                </ToolbarButton>
                <ToolbarButton onClick={formatCode} title="Inline code">
                  <IconCode size={16} />
                </ToolbarButton>
                <ToolbarButton onClick={formatLink} title="Link (Ctrl+K)">
                  <IconLink size={16} />
                </ToolbarButton>

                <div className="ml-auto flex shrink-0 items-center gap-0.5 rounded-lg bg-sunken p-0.5 pl-0.5">
                  <button
                    type="button"
                    onClick={() => setMode("write")}
                    aria-pressed={mode === "write"}
                    className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-all ${
                      mode === "write" ? "bg-elevated text-fg shadow-soft" : "text-subtle hover:text-fg"
                    }`}
                  >
                    <IconPenLine size={13} />
                    <span className="hidden sm:inline">Write</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("preview")}
                    aria-pressed={mode === "preview"}
                    className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-all ${
                      mode === "preview" ? "bg-elevated text-fg shadow-soft" : "text-subtle hover:text-fg"
                    }`}
                  >
                    <IconBookOpen size={13} />
                    <span className="hidden sm:inline">Preview</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Content */}
            {mode === "write" ? (
              <textarea
                ref={textareaRef}
                value={body}
                onChange={(e) => {
                  setBody(e.target.value);
                  markDirty();
                  pushHistory(
                    {
                      title,
                      body: e.target.value,
                      selStart: e.target.selectionStart,
                      selEnd: e.target.selectionEnd,
                    },
                    true,
                  );
                }}
                onKeyDown={handleBodyKeyDown}
                placeholder={"Start writing…\n\nType “- ” for a bulleted list or “1. ” for a numbered list."}
                aria-label="Note content"
                spellCheck
                className="mt-7 block min-h-[50vh] w-full resize-none overflow-hidden bg-transparent text-[17px] leading-[1.85] text-fg outline-none placeholder:text-subtle"
              />
            ) : (
              <div className="mt-6 min-h-[45vh] text-[16px] animate-fade-in">
                {body.trim() ? (
                  <NoteContent source={body} />
                ) : (
                  <p className="text-subtle">Nothing to preview yet.</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Footer ─────────────────────────────────────────────── */}
        <footer className={`flex h-10 shrink-0 items-center justify-between gap-4 border-t border-line px-4 text-[11px] text-subtle sm:px-6 ${isTyping ? "opacity-30" : "opacity-100"} transition-opacity duration-500`}>
          <span>
            {wordCount} {wordCount === 1 ? "word" : "words"} · {body.length} characters
          </span>
          <span className="hidden md:inline">
            <kbd className="font-sans">Enter</kbd> continues lists · press twice to exit ·{" "}
            <kbd className="font-sans">Tab</kbd> to indent
          </span>
        </footer>
      </div>

      <ExportModal note={note} isOpen={isExportOpen} onClose={() => setIsExportOpen(false)} />

      <ShareModal
        note={note}
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        onUpdate={(updated) => {
          setNote(updated);
          onUpdate(updated);
        }}
      />
    </div>
  );
}
