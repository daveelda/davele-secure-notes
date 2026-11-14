"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { Note, ViewFilter, SortOption } from "@/lib/types";
import { Sidebar } from "./sidebar";
import { NoteCard } from "./note-card";
import { NoteEditor } from "./note-editor";
import {
  DaveleLogo,
  IconClock,
  IconPin,
  IconGrid,
  IconList,
  IconMenu,
  IconPenLine,
  IconPlus,
  IconSearch,
  IconSort,
  IconX,
} from "./icons";
import { createNote, logOut } from "@/app/actions";
import { isBlank, validateNote } from "@/lib/note-validation";
import { plainExcerpt } from "@/lib/markdown";
import { reminderTime, type NotificationState } from "@/lib/reminders";
import { useReminderNotifications } from "./use-reminder-notifications";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import {
  clearAllCachedData,
  getCachedNotes,
  purgeOtherAccounts,
  setCachedNotes,
} from "@/lib/offline";

interface DashboardShellProps {
  /** Display name from Supabase profile metadata (or email username). */
  userName: string;
  /** First name used in the greeting. */
  firstName: string;
  initialNotes: Note[];
  /** True only when the server could not load notes (e.g. offline). */
  loadFailed?: boolean;
  /** Server-verified id of the signed-in user (used to scope local caches). */
  userId: string;
  userEmail?: string;
}

/** Current time, updated every minute. null until mounted (client-only). */
function useNow() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** Explains / requests browser-notification permission for reminders. */
function NotificationPrompt({
  permission,
  onEnable,
}: {
  permission: NotificationState;
  onEnable: () => void;
}) {
  if (permission === "granted") return null;
  const text =
    permission === "default"
      ? "Get a browser notification when a reminder is due."
      : permission === "denied"
        ? "Notifications are blocked for this site in your browser settings. Due reminders will still appear here while DAVELE is open."
        : "This browser can't show notifications here. Due reminders will still appear in DAVELE while it is open.";
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-[13px] text-muted">
      <span className="flex min-w-0 items-center gap-2">
        <IconClock size={14} className="shrink-0 text-accent-text" />
        {text}
      </span>
      {permission === "default" && (
        <button
          type="button"
          onClick={onEnable}
          className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg transition hover:bg-accent-hover"
        >
          Enable notifications
        </button>
      )}
    </div>
  );
}

function greetingFor(date: Date) {
  const h = date.getHours();
  if (h >= 5 && h < 12) return "Good morning";
  if (h >= 12 && h < 18) return "Good afternoon";
  return "Good evening";
}

export function DashboardShell({
  userName,
  firstName,
  initialNotes,
  loadFailed = false,
  userId,
  userEmail,
}: DashboardShellProps) {
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const [currentFilter, setCurrentFilter] = useState<ViewFilter>("all");

  const [searchQuery, setSearchQuery] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>("updated_desc");
  const [layoutMode, setLayoutMode] = useState<"grid" | "list">("grid");

  const [activeEditingNote, setActiveEditingNote] = useState<Note | null>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Account isolation for the offline cache:
  // - remove anything cached for other accounts on this device
  // - the server's (empty or not) list is the source of truth; the cache is
  //   only used when the server load actually failed, and only this user's.
  useEffect(() => {
    purgeOtherAccounts(userId);
    if (loadFailed) {
      const cached = getCachedNotes(userId);
      if (cached.length > 0) setNotes(cached);
    } else {
      setNotes(initialNotes);
      setCachedNotes(userId, initialNotes);
    }
  }, [initialNotes, loadFailed, userId]);

  // Keep this user's cache in sync with the current list.
  useEffect(() => {
    if (!isSigningOut) setCachedNotes(userId, notes);
  }, [notes, userId, isSigningOut]);

  const now = useNow();
  const [captureText, setCaptureText] = useState("");
  const [isCapturing, setIsCapturing] = useState(false);

  const [captureError, setCaptureError] = useState<string | null>(null);

  // Opens the editor on a local, unsaved draft. Nothing is written to
  // Supabase until the draft has a valid title or some content (the editor's
  // save creates the row), so empty notes are never stored.
  const openDraft = (draftTitle = "") => {
    const nowIso = new Date().toISOString();
    setActiveEditingNote({
      id: -Date.now(),
      title: draftTitle,
      body: "",
      color: "default",
      is_pinned: false,
      is_favorite: false,
      is_archived: false,
      user_id: userId,
      created_at: nowIso,
      updated_at: nowIso,
    });
  };

  // New note: with a title (quick capture) it's validated and created right
  // away; without one it opens as an unsaved draft.
  const handleCreateNewNote = async (initialTitle?: string): Promise<boolean> => {
    const titleText = initialTitle?.trim().slice(0, 200) || "";
    if (isBlank(titleText)) {
      openDraft();
      return true;
    }

    const validation = validateNote(titleText, "");
    if (!validation.ok) {
      setCaptureError(validation.error);
      return false;
    }

    const res = await createNote({ title: validation.title, body: "" });
    if (res.success && res.data) {
      const newNote = res.data as Note;
      setNotes((prev) => [newNote, ...prev]);
      setActiveEditingNote(newNote);
    } else {
      // Server unreachable: keep the title in a local draft so it isn't lost;
      // the editor will create the note once saving works again.
      console.warn("Server note creation fallback:", res.error);
      openDraft(validation.title);
    }
    return true;
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        handleCreateNewNote();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k" && !activeEditingNote) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      // Escape inside the editor is handled by the editor itself, so it can
      // save pending changes before closing.
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeEditingNote]);

  // Note counts
  const notesCount = useMemo(() => {
    const activeNotes = notes.filter((n) => !n.is_archived);
    return {
      all: activeNotes.length,
      pinned: activeNotes.filter((n) => n.is_pinned).length,
      favorites: activeNotes.filter((n) => n.is_favorite).length,
      archive: notes.filter((n) => n.is_archived).length,
      reminders: activeNotes.filter((n) => Boolean(n.reminder_at)).length,
    };
  }, [notes]);

  const handleUpdateNote = (updated: Note) => {
    setNotes((prev) =>
      prev.some((n) => n.id === updated.id)
        ? prev.map((n) => (n.id === updated.id ? { ...n, ...updated } : n))
        : // First successful save of a draft: add the newly created note.
          updated.id > 0
          ? [updated, ...prev]
          : prev,
    );
  };

  const handleDeleteNote = (id: number) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (activeEditingNote?.id === id) {
      setActiveEditingNote(null);
    }
  };

  // Sign out: clear every trace of this account from the browser, end the
  // session on both client and server, then do a full page load so no
  // in-memory React state or router cache from this account survives.
  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    setActiveEditingNote(null);
    setNotes([]);
    clearAllCachedData();
    try {
      const browserSupabase = createBrowserClient();
      await browserSupabase.auth.signOut({ scope: "local" });
    } catch (err) {
      console.warn("Client signOut warning:", err);
    }
    try {
      await logOut();
    } catch (err) {
      console.warn("Server signOut warning:", err);
    }
    clearAllCachedData();
    window.location.replace("/login");
  };

  // Filter & Search Logic
  const filteredNotes = useMemo(() => {
    return notes.filter((note) => {
      // 1. Navigation category filter
      if (currentFilter === "archive") {
        if (!note.is_archived) return false;
      } else {
        if (note.is_archived) return false;

        if (currentFilter === "pinned" && !note.is_pinned) return false;
        if (currentFilter === "favorites" && !note.is_favorite) return false;
        if (currentFilter === "reminders" && !note.reminder_at) return false;
      }

      // 2. Search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = note.title.toLowerCase().includes(query);
        const matchesBody = note.body.toLowerCase().includes(query);
        return matchesTitle || matchesBody;
      }

      return true;
    });
  }, [notes, currentFilter, searchQuery]);

  // Sort logic
  const sortedNotes = useMemo(() => {
    const list = [...filteredNotes];
    list.sort((a, b) => {
      switch (sortOption) {
        case "updated_desc":
          return (
            new Date(b.updated_at || b.created_at).getTime() -
            new Date(a.updated_at || a.created_at).getTime()
          );
        case "updated_asc":
          return (
            new Date(a.updated_at || a.created_at).getTime() -
            new Date(b.updated_at || b.created_at).getTime()
          );
        case "created_desc":
          return (
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
        case "created_asc":
          return (
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
        case "title_asc":
          return a.title.localeCompare(b.title);
        case "title_desc":
          return b.title.localeCompare(a.title);
        default:
          return 0;
      }
    });
    return list;
  }, [filteredNotes, sortOption]);

  // Split into pinned and other notes when in "all" view
  const pinnedNotes = useMemo(() => {
    if (currentFilter !== "all" && currentFilter !== "pinned") return [];
    return sortedNotes.filter((n) => n.is_pinned);
  }, [sortedNotes, currentFilter]);

  const regularNotes = useMemo(() => {
    if (currentFilter === "pinned") return [];
    if (currentFilter === "all") return sortedNotes.filter((n) => !n.is_pinned);
    return sortedNotes;
  }, [sortedNotes, currentFilter]);

  const getSectionTitle = () => {
    switch (currentFilter) {
      case "all":
        return "All Notes";
      case "pinned":
        return "Pinned Notes";
      case "favorites":
        return "Favorites";
      case "archive":
        return "Archive";
      case "reminders":
        return "Reminders";
      default:
        return "Notes";
    }
  };

  const isHome = currentFilter === "all" && !searchQuery.trim();
  const isRemindersView = currentFilter === "reminders" && !searchQuery.trim();

  // Due reminders: in-app alert + browser notification (once each).
  const { alerts: reminderAlerts, dismissAlert, permission, requestPermission } = useReminderNotifications(
    notes,
    userId,
    (note) => setActiveEditingNote(note),
  );

  // Reminders view: upcoming (soonest first) and past (most recent first).
  const reminderSections = useMemo(() => {
    if (!isRemindersView) return null;
    const t = now ? now.getTime() : 0;
    const withTime = filteredNotes.filter((n) => reminderTime(n) !== null);
    return {
      upcoming: withTime.filter((n) => reminderTime(n)! > t).sort((a, b) => reminderTime(a)! - reminderTime(b)!),
      past: withTime.filter((n) => reminderTime(n)! <= t).sort((a, b) => reminderTime(b)! - reminderTime(a)!),
    };
  }, [isRemindersView, filteredNotes, now]);

  // Real upcoming reminders (future only), soonest first.
  const upcomingReminders = useMemo(() => {
    if (!now) return [];
    const t = now.getTime();
    return notes
      .filter((n) => !n.is_archived && n.reminder_at && new Date(n.reminder_at).getTime() > t)
      .sort((a, b) => new Date(a.reminder_at!).getTime() - new Date(b.reminder_at!).getTime())
      .slice(0, 8);
  }, [notes, now]);

  const formatReminder = (iso: string) => {
    const d = new Date(iso);
    const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    if (!now) return time;
    const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const days = Math.round((startOfDay(d) - startOfDay(now)) / 86_400_000);
    if (days === 0) return `Today, ${time}`;
    if (days === 1) return `Tomorrow, ${time}`;
    return `${d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}, ${time}`;
  };

  const viewDescription = (() => {
    if (searchQuery.trim()) {
      return (
        <>
          {filteredNotes.length} {filteredNotes.length === 1 ? "result" : "results"} for{" "}
          <span className="text-fg">&ldquo;{searchQuery.trim()}&rdquo;</span>
        </>
      );
    }
    switch (currentFilter) {
      case "pinned":
        return "Notes you keep at the top.";
      case "favorites":
        return "Notes you've starred.";
      case "reminders":
        return "Notes with a reminder set.";
      case "archive":
        return "Archived notes stay out of the way. Restore them any time.";
      default:
        return null;
    }
  })();

  const emptyState = (() => {
    if (searchQuery.trim()) {
      return { title: "No matching notes", text: "Try a different word, or check the spelling.", cta: false };
    }
    switch (currentFilter) {
      case "pinned":
        return { title: "Nothing pinned yet", text: "Pin a note from its card or the editor to keep it at the top.", cta: false };
      case "favorites":
        return { title: "No favorites yet", text: "Star the notes you come back to most.", cta: false };
      case "reminders":
        return { title: "No reminders", text: "Open a note and use the clock button to set one.", cta: false };
      case "archive":
        return { title: "Archive is empty", text: "Archived notes will appear here.", cta: false };
      default:
        return {
          title: "Your notes will live here",
          text: "Capture your first thought above. Everything saves automatically and stays private to your account.",
          cta: true,
        };
    }
  })();

  const handleQuickCapture = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCapturing) return;
    setIsCapturing(true);
    const created = await handleCreateNewNote(captureText);
    // Keep the text when it was rejected so the user can fix it.
    if (created) {
      setCaptureText("");
      setCaptureError(null);
    }
    setIsCapturing(false);
  };

  const gridCls =
    layoutMode === "grid"
      ? "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
      : "flex flex-col gap-2";

  const renderNotes = (list: Note[]) => (
    <div className={gridCls}>
      {list.map((note) => (
        <NoteCard
          key={note.id}
          note={note}
          layout={layoutMode}
          onClick={() => setActiveEditingNote(note)}
          onUpdate={handleUpdateNote}
          onDelete={handleDeleteNote}
        />
      ))}
    </div>
  );

  const segmentBtn = (active: boolean) =>
    `flex h-7 w-8 items-center justify-center rounded-md transition-all duration-150 ${
      active ? "bg-elevated text-fg shadow-soft ring-1 ring-line" : "text-subtle hover:text-fg"
    }`;

  const sectionLabel = "flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-subtle";

  return (
    <div className="flex h-screen w-full overflow-hidden bg-bg font-sans text-fg">
      <Sidebar
        currentFilter={currentFilter}
        onSelectFilter={(f) => {
          setCurrentFilter(f);
          setSearchQuery("");
        }}
        notesCount={notesCount}
        onCreateNote={() => handleCreateNewNote()}
        userName={userName}
        userEmail={userEmail}
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        onSignOut={handleSignOut}
      />

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top bar: navigation + search */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur-xl sm:px-6 lg:px-10">
          <button
            onClick={() => setIsMobileSidebarOpen(true)}
            aria-label="Open sidebar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-hover hover:text-fg lg:hidden"
          >
            <IconMenu size={20} />
          </button>

          <div className="relative min-w-0 flex-1 sm:max-w-lg">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-subtle">
              <IconSearch size={15} />
            </span>
            <input
              ref={searchInputRef}
              type="search"
              placeholder="Search notes"
              aria-label="Search notes"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setSearchQuery("");
                  e.currentTarget.blur();
                }
              }}
              className="h-9 w-full rounded-lg border border-transparent bg-surface pl-9 pr-16 text-sm text-fg outline-none transition placeholder:text-subtle hover:border-line focus:border-accent focus:ring-4 focus:ring-accent-ring [&::-webkit-search-cancel-button]:hidden"
            />
            <span className="absolute inset-y-0 right-0 flex items-center pr-2">
              {searchQuery ? (
                <button
                  onClick={() => setSearchQuery("")}
                  aria-label="Clear search"
                  className="flex h-6 w-6 items-center justify-center rounded-md text-subtle hover:bg-hover hover:text-fg"
                >
                  <IconX size={14} />
                </button>
              ) : (
                <kbd className="hidden rounded-md border border-line bg-sunken px-1.5 py-0.5 font-sans text-[10px] font-medium text-subtle sm:inline">
                  Ctrl K
                </kbd>
              )}
            </span>
          </div>

          <button
            onClick={() => handleCreateNewNote()}
            aria-label="New note"
            className="ml-auto flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-semibold text-accent-fg shadow-soft transition-all duration-150 hover:bg-accent-hover active:scale-[0.97] lg:hidden"
          >
            <IconPlus size={16} />
            <span className="hidden sm:inline">New note</span>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl px-4 pb-20 pt-8 sm:px-6 sm:pt-12 lg:px-10">
            {isHome ? (
              /* ── Home: greeting + quick capture ───────────────────── */
              <section className="mb-10 sm:mb-12">
                <p
                  className={`text-[13px] font-medium text-subtle transition-opacity duration-500 ${now ? "opacity-100" : "opacity-0"}`}
                >
                  {now
                    ? now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })
                    : " "}
                </p>
                <h1
                  className={`mt-2 text-[30px] font-semibold leading-[1.15] tracking-[-0.02em] text-fg transition-opacity duration-500 sm:text-[40px] ${
                    now ? "opacity-100" : "opacity-0"
                  }`}
                >
                  {now ? greetingFor(now) : "Hello"},{" "}
                  <span className="text-accent-text">{firstName}</span>
                </h1>
                <p className="mt-2.5 text-[15px] text-muted sm:text-base">
                  Welcome back. What&apos;s on your mind today?
                </p>

                <form
                  onSubmit={handleQuickCapture}
                  className="mt-7 flex max-w-2xl items-center gap-2 rounded-2xl border border-line bg-surface p-1.5 pl-4 shadow-soft transition-all duration-200 focus-within:border-accent focus-within:shadow-card focus-within:ring-4 focus-within:ring-accent-ring"
                >
                  <IconPenLine size={17} className="shrink-0 text-subtle" />
                  <input
                    value={captureText}
                    onChange={(e) => {
                      setCaptureText(e.target.value);
                      if (captureError) setCaptureError(null);
                    }}
                    placeholder="Capture a thought, idea or plan…"
                    aria-label="Quick capture: new note title"
                    aria-invalid={Boolean(captureError)}
                    aria-describedby={captureError ? "capture-error" : undefined}
                    maxLength={200}
                    className="h-10 min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-subtle"
                  />
                  <button
                    type="submit"
                    disabled={isCapturing}
                    className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-fg transition-all duration-150 hover:bg-accent-hover active:scale-[0.97] disabled:opacity-60"
                  >
                    {isCapturing ? (
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    ) : (
                      <IconPlus size={16} />
                    )}
                    <span className="hidden sm:inline">{captureText.trim() ? "Create note" : "New note"}</span>
                  </button>
                </form>
                {captureError ? (
                  <p id="capture-error" role="alert" className="mt-2.5 pl-1 text-xs font-medium text-danger animate-pop">
                    {captureError}
                  </p>
                ) : (
                  <p className="mt-2.5 pl-1 text-xs text-subtle">
                    Press <kbd className="font-sans text-muted">Enter</kbd> to create a note and keep writing.
                  </p>
                )}
              </section>
            ) : (
              /* ── Other views: title + description ─────────────────── */
              <section className="mb-8 animate-slide-up">
                <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-fg sm:text-[32px]">
                  {searchQuery.trim() ? "Search" : getSectionTitle()}
                </h1>
                {viewDescription && <p className="mt-1.5 text-sm text-muted">{viewDescription}</p>}
              </section>
            )}

            {isRemindersView && <NotificationPrompt permission={permission} onEnable={requestPermission} />}

            {/* Upcoming reminders (real data; only when there are any) */}
            {isHome && upcomingReminders.length > 0 && (
              <section className="mb-10 animate-slide-up">
                <h2 className={`${sectionLabel} mb-3`}>
                  <IconClock size={13} /> Upcoming
                </h2>
                {permission === "default" && (
                  <NotificationPrompt permission={permission} onEnable={requestPermission} />
                )}
                <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
                  {upcomingReminders.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => setActiveEditingNote(n)}
                      className="group w-[232px] shrink-0 snap-start rounded-xl border border-line bg-surface p-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-card"
                    >
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-accent-text">
                        <IconClock size={12} />
                        {formatReminder(n.reminder_at!)}
                      </div>
                      <div className="mt-1.5 truncate text-sm font-semibold text-fg">{n.title || "Untitled"}</div>
                      <div className="mt-0.5 truncate text-xs text-subtle">{plainExcerpt(n.body) || "No content"}</div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Notes */}
            {filteredNotes.length > 0 && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-fg">
                  {isHome ? "Your notes" : searchQuery.trim() ? "Results" : "Notes"}
                  <span className="ml-2 font-normal tabular-nums text-subtle">{filteredNotes.length}</span>
                </h2>
                <div className="flex items-center gap-2">
                  {/* The Reminders view is always ordered by reminder time. */}
                  <label className={`relative h-8 ${isRemindersView ? "hidden" : "flex"} items-center gap-1.5 rounded-lg border border-line bg-surface pl-2.5 pr-1.5 text-xs text-muted transition hover:border-line-strong`}>
                    <IconSort size={13} className="text-subtle" />
                    <select
                      value={sortOption}
                      onChange={(e) => setSortOption(e.target.value as SortOption)}
                      aria-label="Sort notes"
                      className="cursor-pointer bg-transparent pr-1 text-xs text-fg outline-none"
                    >
                      <option value="updated_desc">Last edited</option>
                      <option value="updated_asc">Least recently edited</option>
                      <option value="created_desc">Newest first</option>
                      <option value="created_asc">Oldest first</option>
                      <option value="title_asc">Title A–Z</option>
                      <option value="title_desc">Title Z–A</option>
                    </select>
                  </label>
                  <div className="flex items-center gap-0.5 rounded-lg border border-line bg-sunken p-0.5">
                    <button
                      onClick={() => setLayoutMode("grid")}
                      title="Grid view"
                      aria-label="Grid view"
                      aria-pressed={layoutMode === "grid"}
                      className={segmentBtn(layoutMode === "grid")}
                    >
                      <IconGrid size={14} />
                    </button>
                    <button
                      onClick={() => setLayoutMode("list")}
                      title="List view"
                      aria-label="List view"
                      aria-pressed={layoutMode === "list"}
                      className={segmentBtn(layoutMode === "list")}
                    >
                      <IconList size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {filteredNotes.length === 0 && (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong px-6 py-16 text-center animate-fade-in sm:py-20">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-surface text-accent-text shadow-soft">
                  {searchQuery.trim() ? <IconSearch size={20} /> : <DaveleLogo size={26} />}
                </div>
                <h3 className="mt-5 text-[15px] font-semibold text-fg">{emptyState.title}</h3>
                <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted">{emptyState.text}</p>
                {emptyState.cta && (
                  <button
                    onClick={() => handleCreateNewNote()}
                    className="mt-6 flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-fg transition hover:border-line-strong hover:bg-hover"
                  >
                    <IconPlus size={15} />
                    <span>Start with a blank note</span>
                  </button>
                )}
              </div>
            )}

            <div className="space-y-8">
              {reminderSections && reminderSections.upcoming.length > 0 && (
                <section className="space-y-3">
                  <h3 className={sectionLabel}>
                    <IconClock size={12} /> Upcoming
                  </h3>
                  {renderNotes(reminderSections.upcoming)}
                </section>
              )}
              {reminderSections && reminderSections.past.length > 0 && (
                <section className="space-y-3">
                  <h3 className={sectionLabel}>Past</h3>
                  {renderNotes(reminderSections.past)}
                </section>
              )}

              {!reminderSections && pinnedNotes.length > 0 && (
                <section className="space-y-3">
                  <h3 className={sectionLabel}>
                    <IconPin size={12} /> Pinned
                  </h3>
                  {renderNotes(pinnedNotes)}
                </section>
              )}

              {!reminderSections && regularNotes.length > 0 && (
                <section className="space-y-3">
                  {pinnedNotes.length > 0 && <h3 className={sectionLabel}>Others</h3>}
                  {renderNotes(regularNotes)}
                </section>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Due reminders (in-app; shown even without notification permission) */}
      {reminderAlerts.length > 0 && (
        <div
          className="fixed bottom-4 right-4 z-50 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2"
          aria-live="assertive"
        >
          {reminderAlerts.map(({ key, note }) => (
            <div
              key={key}
              role="alert"
              className="rounded-xl border border-line bg-elevated p-4 shadow-float animate-slide-up"
            >
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-accent-text">
                <IconClock size={12} /> Reminder
              </div>
              <div className="mt-1.5 truncate text-sm font-semibold text-fg">{note.title || "Untitled"}</div>
              <div className="mt-0.5 text-xs text-subtle">
                {new Date(note.reminder_at!).toLocaleString([], {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    dismissAlert(key);
                    setActiveEditingNote(notes.find((n) => n.id === note.id) ?? note);
                  }}
                  className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg transition hover:bg-accent-hover"
                >
                  Open note
                </button>
                <button
                  type="button"
                  onClick={() => dismissAlert(key)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted transition hover:bg-hover hover:text-fg"
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeEditingNote && (
        <NoteEditor
          key={activeEditingNote.id}
          note={activeEditingNote}
          onClose={() => setActiveEditingNote(null)}
          onUpdate={handleUpdateNote}
          onDelete={handleDeleteNote}
        />
      )}
    </div>
  );
}
