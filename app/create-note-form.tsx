"use client";

import { useActionState } from "react";
import { createNoteFormAction, type CreateNoteState } from "./actions";

const initialState: CreateNoteState = { message: "", status: "idle" };

export function CreateNoteForm() {
  const [state, formAction, isPending] = useActionState(
    createNoteFormAction,
    initialState,
  );

  return (
    <form action={formAction} className="mt-5 space-y-4">
      <div className="space-y-2">
        <label htmlFor="title" className="block text-sm font-medium">
          Title
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          maxLength={200}
          className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm outline-none transition placeholder:text-zinc-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          placeholder="A thought to remember"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="body" className="block text-sm font-medium">
          Body <span className="font-normal text-zinc-500">(optional)</span>
        </label>
        <textarea
          id="body"
          name="body"
          rows={5}
          className="w-full resize-y rounded-lg border border-zinc-300 px-3 py-2.5 text-sm outline-none transition placeholder:text-zinc-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          placeholder="Write your note..."
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="flex w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Creating..." : "Create Note"}
      </button>

      {state.message && (
        <p
          role="status"
          aria-live="polite"
          className={`text-sm ${
            state.status === "success" ? "text-emerald-700" : "text-red-600"
          }`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
