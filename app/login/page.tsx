"use client";

import { useActionState, useEffect, useState } from "react";
import { logIn, signUp } from "./actions";
import { DaveleLogo, IconMail } from "@/components/icons";
import { PasswordInput } from "@/components/password-input";
import { ThemeToggle } from "@/components/theme-provider";
import { clearAllCachedData } from "@/lib/offline";

const initialState = { message: "", status: "idle" as const };

type Mode = "login" | "signup";

const labelCls = "block text-[13px] font-medium text-fg";

export default function LoginPage() {
  const [loginState, loginAction, isLoginPending] = useActionState(logIn, initialState);
  const [signUpState, signUpAction, isSignUpPending] = useActionState(signUp, initialState);
  const [mode, setMode] = useState<Mode>("login");

  // Nobody is signed in on this page: make sure no private data from a
  // previous account (including the old shared cache key) remains.
  useEffect(() => {
    clearAllCachedData();
  }, []);

  const isPending = isLoginPending || isSignUpPending;
  const activeState = mode === "login" ? loginState : signUpState;

  return (
    <main className="relative flex min-h-screen flex-col bg-bg text-fg">
      {/* Subtle ambient accent */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_60%_at_50%_0%,var(--accent-soft),transparent)]"
      />

      <div className="relative flex items-center justify-between px-5 py-5 sm:px-8">
        <div className="flex items-center gap-2.5">
          <DaveleLogo size={28} />
          <span className="text-[15px] font-semibold tracking-tight">DAVELE</span>
        </div>
        <ThemeToggle />
      </div>

      <div className="relative flex flex-1 items-center justify-center px-4 pb-16 pt-4">
        <section className="w-full max-w-[400px] animate-scale-in">
          <div className="mb-8 text-center">
            <h1 className="text-[28px] font-semibold tracking-tight">
              {mode === "login" ? "Welcome back" : "Create your account"}
            </h1>
            <p className="mt-2 text-sm text-muted">
              {mode === "login"
                ? "Sign in to your private, synced notes workspace."
                : "Start capturing ideas in a calm, private workspace."}
            </p>
          </div>

          <div className="rounded-2xl border border-line bg-surface p-6 shadow-float sm:p-8">
            {/* Mode switcher */}
            <div role="tablist" aria-label="Account" className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-sunken p-1">
              {(["login", "signup"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => setMode(m)}
                  className={`h-9 rounded-lg text-sm font-medium transition-all duration-150 ${
                    mode === m ? "bg-elevated text-fg shadow-soft ring-1 ring-line" : "text-subtle hover:text-fg"
                  }`}
                >
                  {m === "login" ? "Sign in" : "Create account"}
                </button>
              ))}
            </div>

            <form className="space-y-4" action={mode === "login" ? loginAction : signUpAction} noValidate>
              {mode === "signup" && (
                <div className="space-y-1.5 animate-slide-up">
                  <div className="flex items-baseline justify-between">
                    <label htmlFor="name" className={labelCls}>
                      Name
                    </label>
                    <span className="text-[11px] text-subtle">Optional</span>
                  </div>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    maxLength={80}
                    placeholder="What should we call you?"
                    className="h-11 w-full rounded-xl border border-line bg-sunken px-3.5 text-[15px] text-fg caret-accent outline-none transition placeholder:text-subtle hover:border-line-strong focus:border-accent focus:bg-surface focus:ring-4 focus:ring-accent-ring"
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <label htmlFor="email" className={labelCls}>
                  Email
                </label>
                <div className="group relative">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-subtle transition-colors group-focus-within:text-accent-text">
                    <IconMail size={16} />
                  </span>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    required
                    placeholder="you@example.com"
                    className="h-11 w-full rounded-xl border border-line bg-sunken pl-10 pr-3.5 text-[15px] text-fg caret-accent outline-none transition placeholder:text-subtle hover:border-line-strong focus:border-accent focus:bg-surface focus:ring-4 focus:ring-accent-ring"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between">
                  <label htmlFor={mode === "login" ? "password" : "new-password"} className={labelCls}>
                    Password
                  </label>
                  {mode === "signup" && <span className="text-[11px] text-subtle">At least 8 characters</span>}
                </div>
                {/* Separate inputs per mode so browsers offer the right autofill. */}
                {mode === "login" ? (
                  <PasswordInput
                    key="login-password"
                    id="password"
                    name="password"
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    required
                  />
                ) : (
                  <PasswordInput
                    key="signup-password"
                    id="new-password"
                    name="password"
                    autoComplete="new-password"
                    placeholder="Create a password"
                    minLength={8}
                    required
                  />
                )}
              </div>

              {activeState?.message && (
                <div
                  role="status"
                  aria-live="polite"
                  className={`rounded-xl border px-3.5 py-2.5 text-[13px] font-medium animate-pop ${
                    activeState.status === "success"
                      ? "border-success/25 bg-success/10 text-success"
                      : "border-danger/25 bg-danger-soft text-danger"
                  }`}
                >
                  {activeState.message}
                </div>
              )}

              <button
                type="submit"
                disabled={isPending}
                className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-accent-fg shadow-soft transition-all duration-150 hover:bg-accent-hover active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending && (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                )}
                {mode === "login"
                  ? isLoginPending
                    ? "Signing in…"
                    : "Sign in"
                  : isSignUpPending
                    ? "Creating account…"
                    : "Create account"}
              </button>
            </form>
          </div>

          <p className="mt-6 text-center text-[13px] text-muted">
            {mode === "login" ? "New to DAVELE? " : "Already have an account? "}
            <button
              type="button"
              onClick={() => setMode(mode === "login" ? "signup" : "login")}
              className="font-medium text-accent-text underline-offset-4 hover:underline"
            >
              {mode === "login" ? "Create an account" : "Sign in"}
            </button>
          </p>

          <p className="mt-10 text-center text-[11px] text-subtle">
            Protected by Supabase authentication and row-level security.
          </p>
        </section>
      </div>
    </main>
  );
}
