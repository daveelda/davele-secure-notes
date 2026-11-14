import { Note } from "./types";

/**
 * Offline note cache, scoped per account.
 *
 * Each user's cache lives under its own key, so one account can never read
 * another account's notes from this browser. Logging out clears every DAVELE
 * data key (the theme preference is kept, it isn't private data).
 */

const CACHE_PREFIX = "davele_cached_notes:";
const QUEUE_PREFIX = "davele_sync_queue:";
// Pre-fix keys that were shared by every account on the device.
const LEGACY_KEYS = ["davele_cached_notes", "davele_sync_queue"];

export type SyncAction =
  | { type: "create"; note: Note; timestamp: number }
  | { type: "update"; note: Note; timestamp: number }
  | { type: "delete"; noteId: number; timestamp: number };

export function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function safeKeys(): string[] {
  try {
    return Object.keys(localStorage);
  } catch {
    return [];
  }
}

function remove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // storage unavailable
  }
}

export function getCachedNotes(userId: string): Note[] {
  if (!isBrowser() || !userId) return [];
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + userId);
    const notes: Note[] = raw ? JSON.parse(raw) : [];
    // Defence in depth: only ever return notes owned by this user.
    return notes.filter((n) => !n.user_id || n.user_id === userId);
  } catch (e) {
    console.error("Failed to read local cache:", e);
    return [];
  }
}

export function setCachedNotes(userId: string, notes: Note[]): void {
  if (!isBrowser() || !userId) return;
  try {
    const own = notes.filter((n) => !n.user_id || n.user_id === userId);
    localStorage.setItem(CACHE_PREFIX + userId, JSON.stringify(own));
  } catch (e) {
    console.error("Failed to write local cache:", e);
  }
}

export function getSyncQueue(userId: string): SyncAction[] {
  if (!isBrowser() || !userId) return [];
  try {
    const raw = localStorage.getItem(QUEUE_PREFIX + userId);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addToSyncQueue(userId: string, action: SyncAction): void {
  if (!isBrowser() || !userId) return;
  const queue = getSyncQueue(userId);
  queue.push(action);
  try {
    localStorage.setItem(QUEUE_PREFIX + userId, JSON.stringify(queue));
  } catch (e) {
    console.error("Failed to update sync queue:", e);
  }
}

export function clearSyncQueue(userId: string): void {
  if (!isBrowser() || !userId) return;
  remove(QUEUE_PREFIX + userId);
}

/** Remove cached data belonging to any account other than `userId`. */
export function purgeOtherAccounts(userId: string): void {
  if (!isBrowser()) return;
  LEGACY_KEYS.forEach(remove);
  for (const key of safeKeys()) {
    if (
      (key.startsWith(CACHE_PREFIX) || key.startsWith(QUEUE_PREFIX)) &&
      key !== CACHE_PREFIX + userId &&
      key !== QUEUE_PREFIX + userId
    ) {
      remove(key);
    }
  }
}

/** Remove all private DAVELE data from this browser (used on logout). */
export function clearAllCachedData(): void {
  if (!isBrowser()) return;
  LEGACY_KEYS.forEach(remove);
  for (const key of safeKeys()) {
    if (key.startsWith(CACHE_PREFIX) || key.startsWith(QUEUE_PREFIX)) remove(key);
  }
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith("davele")) sessionStorage.removeItem(key);
    }
  } catch {
    // storage unavailable
  }
}
