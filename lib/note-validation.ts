// Shared note validation, used by the editor, quick capture and the server
// actions so the same rules apply everywhere. Pure functions (no React / no
// server imports) so it can run on both sides.

/** Title stored when a note has content but the title was left blank. */
export const FALLBACK_TITLE = "Untitled";

export const EMPTY_NOTE_ERROR =
  "This note is empty. Add a title or some content before saving.";
export const TITLE_LETTER_ERROR =
  "Title must include at least one letter (A–Z). Numbers or symbols alone aren't allowed.";

/** Empty or whitespace-only (including non-breaking / zero-width spaces). */
export function isBlank(value: string | null | undefined): boolean {
  return !value || value.replace(/[\s​-‍﻿]/g, "") === "";
}

/** A title must contain at least one alphabetic letter A–Z (any case). */
export function titleHasLetter(title: string): boolean {
  return /[A-Za-z]/.test(title);
}

/**
 * Validates a title on its own. A blank title is not an error here (a note
 * with content but no title is saved as "Untitled"); emptiness of the whole
 * note is checked by validateNote.
 */
export function validateTitle(title: string | null | undefined): string | null {
  if (isBlank(title)) return null;
  return titleHasLetter(title as string) ? null : TITLE_LETTER_ERROR;
}

export type NoteValidation =
  | { ok: true; title: string; body: string }
  | { ok: false; error: string; field: "note" | "title" };

/**
 * Validates a complete note and returns the values to store:
 * - empty / whitespace-only title AND body  -> rejected
 * - non-blank title without a letter        -> rejected
 * - blank title with content                -> stored as "Untitled"
 */
export function validateNote(rawTitle: string | null | undefined, rawBody: string | null | undefined): NoteValidation {
  const title = typeof rawTitle === "string" ? rawTitle.trim() : "";
  const body = typeof rawBody === "string" ? rawBody : "";

  if (isBlank(title) && isBlank(body)) {
    return { ok: false, error: EMPTY_NOTE_ERROR, field: "note" };
  }
  const titleError = validateTitle(title);
  if (titleError) {
    return { ok: false, error: titleError, field: "title" };
  }
  return { ok: true, title: isBlank(title) ? FALLBACK_TITLE : title, body };
}
