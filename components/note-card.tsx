"use client";

import React from "react";
import { Note } from "@/lib/types";
import {
  IconArchive,
  IconArchiveRestore,
  IconClock,
  IconPin,
  IconStar,
  IconTrash,
} from "./icons";
import { togglePin, toggleFavorite, toggleArchive, deleteNote } from "@/app/actions";
import { NoteContent, plainExcerpt } from "@/lib/markdown";

interface NoteCardProps {
  note: Note;
  layout: "grid" | "list";
  onClick: () => void;
  onUpdate: (updated: Note) => void;
  onDelete: (id: number) => void;
}

function CardAction({
  onClick,
  title,
  active = false,
  tone = "default",
  children,
}: {
  onClick: (e: React.MouseEvent) => void;
  title: string;
  active?: boolean;
  tone?: "default" | "danger";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-150 ${
        active
          ? "text-accent-text"
          : tone === "danger"
            ? "text-subtle hover:bg-danger-soft hover:text-danger"
            : "text-subtle hover:bg-hover hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

export function NoteCard({
  note,
  layout,
  onClick,
  onUpdate,
  onDelete,
}: NoteCardProps) {

  const handlePin = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = { ...note, is_pinned: !note.is_pinned };
    onUpdate(updated);
    await togglePin(note.id, note.is_pinned);
  };

  const handleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = { ...note, is_favorite: !note.is_favorite };
    onUpdate(updated);
    await toggleFavorite(note.id, note.is_favorite);
  };

  const handleArchive = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = { ...note, is_archived: !note.is_archived };
    onUpdate(updated);
    await toggleArchive(note.id, note.is_archived);
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this note?")) return;
    onDelete(note.id);
    await deleteNote(note.id);
  };

  const [currentYear, setCurrentYear] = React.useState<number | null>(null);

  React.useEffect(() => {
    setCurrentYear(new Date().getFullYear());
  }, []);

  const formatDate = (dateString: string) => {
    try {
      const d = new Date(dateString);
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: currentYear && d.getFullYear() !== currentYear ? "numeric" : undefined,
      });
    } catch {
      return "";
    }
  };

  const onKeyOpen = (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  };

  const actions = (
    <div className="flex items-center gap-0.5 opacity-100 transition-opacity duration-150 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
      <CardAction onClick={handlePin} title={note.is_pinned ? "Unpin" : "Pin"} active={note.is_pinned}>
        <IconPin size={14} />
      </CardAction>
      <CardAction
        onClick={handleFavorite}
        title={note.is_favorite ? "Remove from favorites" : "Favorite"}
        active={note.is_favorite}
      >
        <IconStar size={14} filled={note.is_favorite} />
      </CardAction>
      <CardAction onClick={handleArchive} title={note.is_archived ? "Restore" : "Archive"}>
        {note.is_archived ? <IconArchiveRestore size={14} /> : <IconArchive size={14} />}
      </CardAction>
      <CardAction onClick={handleDelete} title="Delete" tone="danger">
        <IconTrash size={14} />
      </CardAction>
    </div>
  );

  const badges = (
    <>
      {note.is_pinned && (
        <span className="text-accent-text" title="Pinned">
          <IconPin size={13} />
        </span>
      )}
      {note.is_favorite && (
        <span className="text-amber-400" title="Favorite">
          <IconStar size={13} filled />
        </span>
      )}
    </>
  );

  if (layout === "list") {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={onKeyOpen}
        className={`group relative flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-all duration-200 hover:border-line-strong hover:shadow-card animate-slide-up note-color-${note.color}`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h3 className="truncate text-sm font-semibold text-fg">{note.title || "Untitled"}</h3>
              {badges}
            </div>
            <p className="mt-0.5 truncate text-xs text-muted">{plainExcerpt(note.body) || "No content"}</p>
          </div>

          <div className="hidden shrink-0 items-center gap-3 text-xs text-subtle md:flex">
            {note.reminder_at && (
              <span className="flex items-center gap-1 text-accent-text">
                <IconClock size={12} /> {formatDate(note.reminder_at)}
              </span>
            )}
            <time className="tabular-nums">{formatDate(note.updated_at || note.created_at)}</time>
          </div>
        </div>
        {actions}
      </div>
    );
  }

  // Grid layout card
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={onKeyOpen}
      className={`group relative flex min-h-[180px] cursor-pointer flex-col rounded-2xl border p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-card animate-slide-up note-color-${note.color}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight text-fg">
          {note.title || "Untitled"}
        </h3>
        <div className="flex shrink-0 items-center gap-1 pt-0.5">{badges}</div>
      </div>

      {/* Content excerpt with list formatting preserved */}
      <div className="relative mt-2.5 max-h-[7.5rem] flex-1 overflow-hidden text-[13px] text-muted [mask-image:linear-gradient(to_bottom,black_70%,transparent)]">
        {note.body.trim() ? (
          <NoteContent source={note.body.slice(0, 600)} compact />
        ) : (
          <p className="italic text-subtle">No content</p>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-subtle">
          <time className="tabular-nums">{formatDate(note.updated_at || note.created_at)}</time>
          {note.reminder_at && (
            <span className="flex items-center gap-1 font-medium text-accent-text">
              <IconClock size={11} /> {formatDate(note.reminder_at)}
            </span>
          )}
        </div>
        {actions}
      </div>
    </div>
  );
}
