import type { Note } from "./types";

/**
 * Reminder scheduling helpers.
 *
 * A reminder fires once when its time arrives while DAVELE is open in a tab
 * (there is no push server, so a closed browser can't be notified). Reminders
 * that came due in the last MISSED_WINDOW_MS while the app was closed fire
 * once when it is next opened.
 *
 * "Handled" reminders are remembered per account in localStorage under a key
 * of note id + reminder time, so a reminder never fires twice — but editing
 * the reminder to a new time re-arms it.
 */

export const MISSED_WINDOW_MS = 24 * 60 * 60 * 1000;
const HANDLED_PREFIX = "davele_reminders_handled:";
const HANDLED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const PERMISSION_EVENT = "davele-notification-permission";

export function reminderTime(note: Pick<Note, "reminder_at">): number | null {
  if (!note.reminder_at) return null;
  const t = new Date(note.reminder_at).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Identifies one specific reminder (note + time). */
export function reminderKey(note: Pick<Note, "id" | "reminder_at">): string | null {
  const t = reminderTime(note);
  return t === null ? null : `${note.id}@${t}`;
}

/** Reminders that are due now and haven't been handled yet, oldest first. */
export function findDueReminders(
  notes: Note[],
  now: number,
  handled: ReadonlySet<string>,
  windowMs: number = MISSED_WINDOW_MS,
): Note[] {
  return notes
    .filter((n) => {
      if (n.id <= 0 || n.is_archived) return false;
      const t = reminderTime(n);
      const key = reminderKey(n);
      return t !== null && key !== null && t <= now && t > now - windowMs && !handled.has(key);
    })
    .sort((a, b) => reminderTime(a)! - reminderTime(b)!);
}

/** Next future reminder time (ms), or null. */
export function nextReminderTime(notes: Note[], now: number): number | null {
  let next: number | null = null;
  for (const n of notes) {
    if (n.id <= 0 || n.is_archived) continue;
    const t = reminderTime(n);
    if (t !== null && t > now && (next === null || t < next)) next = t;
  }
  return next;
}

// ---- Handled-reminder storage (per account) --------------------------------

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function loadHandled(userId: string): Set<string> {
  const s = storage();
  if (!s || !userId) return new Set();
  try {
    const raw = s.getItem(HANDLED_PREFIX + userId);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((k): k is string => typeof k === "string") : []);
  } catch {
    return new Set();
  }
}

export function markHandled(userId: string, keys: string[], now: number = Date.now()): Set<string> {
  const handled = loadHandled(userId);
  keys.forEach((k) => handled.add(k));
  // Forget entries for reminders long past, so the list can't grow forever.
  const kept = [...handled].filter((k) => {
    const t = Number(k.split("@")[1]);
    return Number.isFinite(t) && t > now - HANDLED_RETENTION_MS;
  });
  const s = storage();
  if (s && userId) {
    try {
      s.setItem(HANDLED_PREFIX + userId, JSON.stringify(kept));
    } catch {
      // storage full / unavailable: in-memory dedupe still applies this session
    }
  }
  return new Set(kept);
}

// ---- Browser notifications -------------------------------------------------

export type NotificationState = "unsupported" | "default" | "granted" | "denied";

export function getNotificationState(): NotificationState {
  if (typeof window === "undefined" || !("Notification" in window) || !window.isSecureContext) {
    return "unsupported";
  }
  return Notification.permission as NotificationState;
}

/** Must be called from a user gesture (click / submit). */
export async function requestNotificationPermission(): Promise<NotificationState> {
  const state = getNotificationState();
  if (state !== "default") return state;
  try {
    await Notification.requestPermission();
  } catch {
    // older Safari: callback form; ignore
  }
  const next = getNotificationState();
  window.dispatchEvent(new Event(PERMISSION_EVENT));
  return next;
}

/** Shows a system notification for a due reminder. Returns false if it couldn't. */
export function showReminderNotification(
  note: Pick<Note, "id" | "title" | "body" | "reminder_at">,
  onClick: () => void,
): boolean {
  if (getNotificationState() !== "granted") return false;
  try {
    const excerpt = (note.body || "").replace(/\s+/g, " ").trim().slice(0, 120);
    const n = new Notification(`Reminder: ${note.title || "Untitled"}`, {
      body: excerpt || "Your DAVELE note reminder is due.",
      // Same tag = the OS replaces rather than duplicates (e.g. two open tabs).
      tag: `davele-reminder-${reminderKey(note) ?? note.id}`,
    });
    n.onclick = () => {
      window.focus();
      onClick();
      n.close();
    };
    return true;
  } catch {
    // e.g. Android Chrome requires a service worker for notifications
    return false;
  }
}
