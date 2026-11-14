"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Note } from "@/lib/types";
import {
  NotificationState,
  PERMISSION_EVENT,
  findDueReminders,
  getNotificationState,
  loadHandled,
  markHandled,
  nextReminderTime,
  reminderKey,
  requestNotificationPermission,
  showReminderNotification,
} from "@/lib/reminders";

export type ReminderAlert = { key: string; note: Note };

const CHECK_INTERVAL_MS = 15_000;

/**
 * Watches this account's notes and, when a reminder comes due, shows an
 * in-app alert plus a browser notification (if permission was granted).
 * Each reminder fires once; see lib/reminders.ts.
 */
export function useReminderNotifications(notes: Note[], userId: string, onOpenNote: (note: Note) => void) {
  const [alerts, setAlerts] = useState<ReminderAlert[]>([]);
  const [permission, setPermission] = useState<NotificationState>("unsupported");

  const notesRef = useRef(notes);
  const onOpenRef = useRef(onOpenNote);
  useEffect(() => {
    notesRef.current = notes;
    onOpenRef.current = onOpenNote;
  });

  const check = useCallback(() => {
    if (!userId) return;
    const now = Date.now();
    // Re-read storage each time so another open tab's handled reminders count.
    const due = findDueReminders(notesRef.current, now, loadHandled(userId));
    if (due.length === 0) return;

    const keys = due.map((n) => reminderKey(n)!);
    // Mark as handled BEFORE notifying so a reminder can never fire twice.
    markHandled(userId, keys, now);

    due.forEach((note) =>
      showReminderNotification(note, () => {
        const latest = notesRef.current.find((n) => n.id === note.id) ?? note;
        onOpenRef.current(latest);
      }),
    );
    setAlerts((prev) => {
      const existing = new Set(prev.map((a) => a.key));
      const added = due
        .map((note, i) => ({ key: keys[i], note }))
        .filter((a) => !existing.has(a.key));
      return [...prev, ...added].slice(-5);
    });
  }, [userId]);

  // Periodic check + an exact timer for the next reminder, and immediately
  // when the tab becomes visible again (background timers are throttled).
  useEffect(() => {
    const first = setTimeout(check, 0);
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    const next = nextReminderTime(notes, Date.now());
    const delay = next === null ? null : next - Date.now() + 250;
    const exact = delay !== null && delay < CHECK_INTERVAL_MS ? setTimeout(check, Math.max(0, delay)) : null;
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
      if (exact) clearTimeout(exact);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
    };
  }, [check, notes]);

  // Track notification permission (it can change in browser settings too).
  useEffect(() => {
    const sync = () => setPermission(getNotificationState());
    const first = setTimeout(sync, 0);
    window.addEventListener(PERMISSION_EVENT, sync);
    window.addEventListener("focus", sync);
    return () => {
      clearTimeout(first);
      window.removeEventListener(PERMISSION_EVENT, sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  const dismissAlert = useCallback((key: string) => {
    setAlerts((prev) => prev.filter((a) => a.key !== key));
  }, []);

  const requestPermission = useCallback(async () => {
    setPermission(await requestNotificationPermission());
  }, []);

  return { alerts, dismissAlert, permission, requestPermission };
}
