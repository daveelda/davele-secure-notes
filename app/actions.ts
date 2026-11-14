"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { NoteColor } from "@/lib/types";
import { validateNote } from "@/lib/note-validation";

export type ActionResponse<T = any> = {
  success: boolean;
  data?: T;
  error?: string;
};

export type CreateNoteState = {
  message: string;
  status: "idle" | "error" | "success";
};

export async function createNoteFormAction(
  prevState: CreateNoteState,
  formData: FormData,
): Promise<CreateNoteState> {
  const title = (formData.get("title") as string) || "";
  const body = (formData.get("body") as string) || "";
  const res = await createNote({ title, body });
  if (!res.success) {
    return { status: "error", message: res.error || "Failed to create note." };
  }
  return { status: "success", message: "Note created successfully." };
}

// ---------------------------------------------------------------------------
// Security model
// - The user is always taken from the server-verified Supabase session
//   (auth.getUser()), never from anything the browser sends.
// - Every query is additionally scoped with .eq("user_id", user.id), on top of
//   the database's Row Level Security policies (defence in depth).
// - Updates / deletes report "not found" when no row owned by the user
//   matched, so ownership is verified before anything changes.
// ---------------------------------------------------------------------------

const NOT_FOUND = "Note not found or you don't have access to it.";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function isValidId(id: unknown): id is number {
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0;
}

function isMissingColumnError(error: { code?: string; message: string }) {
  return (
    error.code === "42703" ||
    error.message.includes("column") ||
    error.message.includes("does not exist") ||
    error.message.includes("schema cache")
  );
}

/** Name of the column a "missing column" error refers to, if it says. */
function missingColumnName(error: { message: string }): string | null {
  const m =
    error.message.match(/Could not find the '([^']+)' column/) ||
    error.message.match(/column (?:[\w"]+\.)?"?(\w+)"? does not exist/);
  return m ? m[1] : null;
}

const CORE_COLUMNS = new Set(["id", "user_id", "title", "body", "created_at", "updated_at"]);

const REMINDER_SETUP_ERROR =
  "Reminders can't be saved yet: the notes table has no reminder_at column. Run db/reminders.sql in the Supabase SQL editor once.";

type WriteResult = { data: any; error: { code?: string; message: string } | null };

/**
 * Runs an insert/update and, if the database is missing one of the optional
 * columns, drops just that column and retries — so one missing column (e.g.
 * color) never silently discards the others (e.g. reminder_at).
 * A reminder that cannot be stored is reported as an error, never dropped.
 */
async function writeWithColumnFallback(
  payload: Record<string, any>,
  run: (payload: Record<string, any>) => PromiseLike<WriteResult>,
): Promise<WriteResult> {
  const current = { ...payload };
  let result = await run(current);
  for (let attempt = 0; attempt < 12 && result.error && isMissingColumnError(result.error); attempt++) {
    const column = missingColumnName(result.error);
    if (!column || CORE_COLUMNS.has(column) || !(column in current)) break;
    if (column === "reminder_at" && current.reminder_at) {
      return { data: null, error: { code: "REMINDER_SETUP", message: REMINDER_SETUP_ERROR } };
    }
    console.warn(`notes.${column} is missing in the database; saving without it.`);
    delete current[column];
    result = await run(current);
  }
  return result;
}

// 1. Log out action — clears the Supabase auth cookies for this browser.
// The client then does a full page load to /login so no in-memory state from
// the previous account survives.
export async function logOut(): Promise<ActionResponse> {
  const supabase = await createClient();
  try {
    await supabase.auth.signOut();
  } catch (error) {
    console.warn("Supabase signOut error:", error);
  }
  revalidatePath("/", "layout");
  return { success: true };
}

// Reminder validation shared by create/update (server-side guard; the editor
// validates too). Allows a small grace period for clock differences.
const REMINDER_GRACE_MS = 60_000;

function validateReminder(value: string | null | undefined): string | null {
  if (value === undefined || value === null || value === "") return null;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "Reminder date is not valid.";
  if (time < Date.now() - REMINDER_GRACE_MS) {
    return "Reminder can't be in the past. Choose a future date and time.";
  }
  return null;
}

/** Stores reminders as UTC ISO timestamps (or null when cleared). */
function normalizeReminder(value: string | null | undefined): string | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

const NOTE_COLORS: NoteColor[] = ["default", "amber", "emerald", "sky", "violet", "rose", "slate"];

// 2. Create Note
export async function createNote(input: {
  title: string;
  body?: string;
  color?: NoteColor;
  is_pinned?: boolean;
  is_favorite?: boolean;
  reminder_at?: string | null;
}): Promise<ActionResponse> {
  // Never create empty notes, and titles need at least one letter.
  const validation = validateNote(input?.title, input?.body);
  if (!validation.ok) {
    return { success: false, error: validation.error };
  }
  const { title, body } = validation;

  const reminderError = validateReminder(input.reminder_at);
  if (reminderError) {
    return { success: false, error: reminderError };
  }

  const { supabase, user } = await requireUser();
  if (!user) {
    return { success: false, error: "Not authenticated. Please sign in." };
  }

  // Only whitelisted fields; the owner is always the signed-in user.
  const fullPayload: Record<string, any> = {
    user_id: user.id,
    title,
    body,
    color: input.color && NOTE_COLORS.includes(input.color) ? input.color : "default",
    is_pinned: input.is_pinned === true,
    is_favorite: input.is_favorite === true,
    is_archived: false,
    reminder_at: normalizeReminder(input.reminder_at),
  };

  // Optional columns that don't exist in the database yet are skipped one by
  // one (a reminder that can't be stored is reported, not dropped).
  const result = await writeWithColumnFallback(fullPayload, (p) =>
    supabase.from("notes").insert(p).select().single(),
  );

  if (result.error) {
    console.error("Create note failed:", result.error.message);
    return { success: false, error: result.error.message };
  }

  revalidatePath("/");
  return { success: true, data: result.data };
}

type NoteUpdates = {
  title?: string;
  body?: string;
  color?: NoteColor;
  is_pinned?: boolean;
  is_favorite?: boolean;
  is_archived?: boolean;
  reminder_at?: string | null;
};

/** Copy only fields a user may change (never id / user_id / share fields). */
function sanitizeUpdates(updates: NoteUpdates): NoteUpdates {
  const clean: NoteUpdates = {};
  if (typeof updates?.title === "string") clean.title = updates.title;
  if (typeof updates?.body === "string") clean.body = updates.body;
  if (updates?.color && NOTE_COLORS.includes(updates.color)) clean.color = updates.color;
  if (typeof updates?.is_pinned === "boolean") clean.is_pinned = updates.is_pinned;
  if (typeof updates?.is_favorite === "boolean") clean.is_favorite = updates.is_favorite;
  if (typeof updates?.is_archived === "boolean") clean.is_archived = updates.is_archived;
  if (updates?.reminder_at === null || typeof updates?.reminder_at === "string") {
    clean.reminder_at = updates.reminder_at;
  }
  return clean;
}

// 3. Update Note
export async function updateNote(id: number, rawUpdates: NoteUpdates): Promise<ActionResponse> {
  if (!isValidId(id)) return { success: false, error: NOT_FOUND };
  const updates = sanitizeUpdates(rawUpdates);

  const { supabase, user } = await requireUser();
  if (!user) {
    return { success: false, error: "Not authenticated. Please sign in." };
  }

  // Ownership check: the note must exist AND belong to this user.
  const { data: owned, error: ownedError } = await supabase
    .from("notes")
    .select("id, title, body")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (ownedError || !owned) {
    return { success: false, error: NOT_FOUND };
  }

  // Reject reminders in the past. A reminder that was already stored and has
  // since passed is still allowed through unchanged, so other edits keep saving.
  if (validateReminder(updates.reminder_at)) {
    const { data: existing } = await supabase
      .from("notes")
      .select("reminder_at")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    const unchanged =
      existing?.reminder_at &&
      updates.reminder_at &&
      new Date(existing.reminder_at).getTime() === new Date(updates.reminder_at).getTime();
    if (!unchanged) {
      return { success: false, error: validateReminder(updates.reminder_at)! };
    }
  }

  // Content validation: the note as it would be after this update must not be
  // empty, and its title must contain a letter. Fields not being changed keep
  // their stored values.
  if (updates.title !== undefined || updates.body !== undefined) {
    const validation = validateNote(
      updates.title !== undefined ? updates.title : owned.title,
      updates.body !== undefined ? updates.body : owned.body,
    );
    if (!validation.ok) {
      return { success: false, error: validation.error };
    }
    if (updates.title !== undefined) updates.title = validation.title;
  }

  if (updates.reminder_at !== undefined) updates.reminder_at = normalizeReminder(updates.reminder_at);

  const payload: Record<string, any> = {
    updated_at: new Date().toISOString(),
    ...updates,
  };

  // Always scoped to this user's row. Optional columns missing from the
  // database are skipped individually; a reminder is never silently dropped.
  const result = await writeWithColumnFallback(payload, (p) =>
    supabase.from("notes").update(p).eq("id", id).eq("user_id", user.id).select().maybeSingle(),
  );

  if (result.error) {
    console.error("Update note failed:", result.error.message);
    return { success: false, error: result.error.message };
  }
  if (!result.data) {
    return { success: false, error: NOT_FOUND };
  }

  revalidatePath("/");
  return { success: true, data: result.data };
}

// 4. Delete Note
export async function deleteNote(id: number): Promise<ActionResponse> {
  if (!isValidId(id)) return { success: false, error: NOT_FOUND };
  const { supabase, user } = await requireUser();
  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  const { data, error } = await supabase
    .from("notes")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id");

  if (error) {
    console.error("Delete note failed:", error.message);
    return { success: false, error: error.message };
  }
  if (!data || data.length === 0) {
    return { success: false, error: NOT_FOUND };
  }

  revalidatePath("/");
  return { success: true };
}

// 5. Toggle Pin
export async function togglePin(id: number, current: boolean): Promise<ActionResponse> {
  return updateNote(id, { is_pinned: !current });
}

// 6. Toggle Favorite
export async function toggleFavorite(id: number, current: boolean): Promise<ActionResponse> {
  return updateNote(id, { is_favorite: !current });
}

// 7. Toggle Archive
export async function toggleArchive(id: number, current: boolean): Promise<ActionResponse> {
  return updateNote(id, { is_archived: !current });
}

// 8. Share Link Management
export async function setShareStatus(
  id: number,
  enabled: boolean,
): Promise<ActionResponse<{ share_token: string | null }>> {
  if (!isValidId(id)) return { success: false, error: NOT_FOUND };
  const { supabase, user } = await requireUser();
  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  // Unguessable token (192 bits from a cryptographic RNG).
  const token = enabled ? randomBytes(24).toString("base64url") : null;

  const { data, error } = await supabase
    .from("notes")
    .update({ share_enabled: enabled === true, share_token: token })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id");

  if (error) {
    return { success: false, error: error.message };
  }
  if (!data || data.length === 0) {
    return { success: false, error: NOT_FOUND };
  }

  revalidatePath("/");
  return { success: true, data: { share_token: token } };
}
