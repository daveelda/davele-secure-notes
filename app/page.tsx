import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { Note } from "@/lib/types";
import { resolveDisplayName } from "@/lib/user-name";

// The page itself is static so it can be prerendered into the shell.
// Everything that depends on the request (Supabase session, per-user data,
// and supabase-js' internal Date.now() token-expiry checks) lives in
// <Dashboard />, which streams in behind a Suspense boundary.
export default function Home() {
  return (
    <Suspense fallback={<DashboardFallback />}>
      <Dashboard />
    </Suspense>
  );
}

function DashboardFallback() {
  return (
    <div
      className="flex h-screen w-full items-center justify-center bg-bg"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-3 text-subtle">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        <p className="text-sm">Loading your notes…</p>
      </div>
    </div>
  );
}

async function Dashboard() {
  // Defer to request time: the Supabase auth check reads the current time
  // (Date.now()) to validate token expiry, which must not run during prerender.
  await connection();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If user is not authenticated, redirect to login
  if (!user) {
    redirect("/login");
  }

  // 1. Fetch only this user's notes. RLS enforces this in the database too;
  // the explicit user_id filter means a permissive policy (e.g. one exposing
  // shared notes) can never pull other accounts' notes into the dashboard.
  let notes: Note[] = [];
  let loadFailed = false;
  try {
    const { data, error } = await supabase
      .from("notes")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (!error && data) {
      notes = data.map((n: any) => ({
        id: n.id,
        user_id: n.user_id,
        title: n.title,
        body: n.body || "",
        color: n.color || "default",
        is_pinned: Boolean(n.is_pinned),
        is_favorite: Boolean(n.is_favorite),
        is_archived: Boolean(n.is_archived),
        reminder_at: n.reminder_at ?? null,
        share_token: n.share_token ?? null,
        share_enabled: Boolean(n.share_enabled),
        created_at: n.created_at,
        updated_at: n.updated_at || n.created_at,
      }));
    } else {
      // Fallback query if new columns aren't in database yet
      const fallback = await supabase
        .from("notes")
        .select("id, user_id, title, body, created_at, updated_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (fallback.error) loadFailed = true;
      if (fallback.data) {
        notes = fallback.data.map((n: any) => ({
          id: n.id,
          user_id: n.user_id,
          title: n.title,
          body: n.body || "",
          color: "default",
          is_pinned: false,
          is_favorite: false,
          is_archived: false,
          reminder_at: null,
          share_token: null,
          share_enabled: false,
          created_at: n.created_at,
          updated_at: n.updated_at || n.created_at,
        }));
      }
    }
  } catch (err) {
    console.error("Error loading notes:", err);
    loadFailed = true;
  }

  // Name comes from the authenticated user's Supabase profile metadata,
  // falling back to their email username.
  const { displayName, firstName } = resolveDisplayName(user.user_metadata, user.email);

  return (
    <DashboardShell
      userName={displayName}
      firstName={firstName}
      initialNotes={notes}
      loadFailed={loadFailed}
      userId={user.id}
      userEmail={user.email}
    />
  );
}
