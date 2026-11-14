export const instant = false;

import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { DaveleLogo } from "@/components/icons";
import { NoteContent } from "@/lib/markdown";

interface SharePageProps {
  params: Promise<{ token: string }>;
}

export default async function SharedNotePage({ params }: SharePageProps) {
  await connection();
  const { token } = await params;
  const supabase = await createClient();

  // Read exactly one shared note by its token via a narrowly scoped database
  // function (db/security_rls.sql). There is deliberately no table policy that
  // exposes shared notes, so other notes can never be listed from here.
  const { data: rows, error } = await supabase.rpc("get_shared_note", { p_token: token });
  const note = Array.isArray(rows) && rows.length > 0
    ? (rows[0] as { title: string; body: string; color: string | null; created_at: string; updated_at: string })
    : null;

  if (error || !note) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-bg p-4 text-center text-fg">
        <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-8 shadow-float animate-scale-in">
          <div className="mx-auto flex h-12 w-12 items-center justify-center">
            <DaveleLogo size={40} />
          </div>
          <h1 className="mt-5 text-lg font-semibold tracking-tight">Note not available</h1>
          <p className="mt-2 text-sm text-muted">
            This shared note doesn&apos;t exist or sharing has been turned off by its owner.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg shadow-soft transition hover:bg-accent-hover"
          >
            Go to DAVELE
          </Link>
        </div>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg text-fg">
      <header className="sticky top-0 z-10 border-b border-line bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-2.5">
            <DaveleLogo size={26} />
            <span className="text-sm font-semibold tracking-tight">DAVELE</span>
            <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-medium text-accent-text">
              Read only
            </span>
          </div>
          <Link href="/login" className="text-xs font-medium text-accent-text hover:underline">
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 sm:px-8 sm:py-14">
        <article
          className={`rounded-2xl border p-6 shadow-card animate-slide-up sm:p-10 note-color-${note.color || "default"}`}
        >
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight sm:text-[34px]">{note.title}</h1>
          <p className="mt-3 text-xs text-subtle">
            Last updated{" "}
            {note.updated_at || note.created_at
              ? new Date(note.updated_at || note.created_at).toLocaleDateString()
              : ""}
          </p>

          {note.body && (
            <div className="mt-8 border-t border-line pt-8 text-[16px]">
              <NoteContent source={note.body} />
            </div>
          )}
        </article>
      </main>

      <footer className="py-8 text-center text-xs text-subtle">Shared securely with DAVELE</footer>
    </div>
  );
}
