/**
 * Resolve a friendly display name for the signed-in user.
 *
 * Order: Supabase auth profile metadata (full_name, name, display_name,
 * first_name, user_name, preferred_username) -> the email's username part.
 * Never hardcoded; returns "there" only if nothing at all is available.
 */

const METADATA_KEYS = [
  "full_name",
  "name",
  "display_name",
  "first_name",
  "user_name",
  "preferred_username",
] as const;

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim().slice(0, 80);
  return trimmed || null;
}

function titleCase(word: string) {
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}

/** "daniel.imodoye+notes@x.com" -> "Daniel Imodoye" */
export function nameFromEmail(email: string | null | undefined): string | null {
  if (!email || !email.includes("@")) return null;
  const local = email.split("@")[0].split("+")[0];
  const words = local
    .split(/[._\-\d]+/)
    .filter(Boolean)
    .map((w) => titleCase(w.toLowerCase()));
  return words.length ? words.join(" ") : clean(local);
}

export function resolveDisplayName(
  metadata: Record<string, unknown> | null | undefined,
  email: string | null | undefined,
): { displayName: string; firstName: string } {
  let name: string | null = null;
  for (const key of METADATA_KEYS) {
    name = clean(metadata?.[key]);
    if (name) break;
  }
  name = name ?? nameFromEmail(email) ?? "there";
  const firstName = name.split(" ")[0] || name;
  return { displayName: name, firstName };
}
