"use client";

import React, { useState } from "react";
import { IconEye, IconEyeOff, IconLock } from "./icons";

type PasswordInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
  id: string;
};

/**
 * Password field with a show/hide toggle. Text uses the theme foreground
 * colour so typed characters are clearly readable in light and dark mode.
 */
export function PasswordInput({ id, className = "", ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="group relative">
      <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-subtle transition-colors group-focus-within:text-accent-text">
        <IconLock size={16} />
      </span>
      <input
        id={id}
        type={visible ? "text" : "password"}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className={`h-11 w-full rounded-xl border border-line bg-sunken pl-10 pr-12 text-[15px] text-fg caret-accent outline-none transition placeholder:text-subtle hover:border-line-strong focus:border-accent focus:bg-surface focus:ring-4 focus:ring-accent-ring ${
          visible ? "tracking-normal" : "tracking-[0.18em] placeholder:tracking-normal"
        } ${className}`}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        aria-controls={id}
        title={visible ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-subtle transition-colors hover:text-fg focus-visible:text-fg"
      >
        {visible ? <IconEyeOff size={18} /> : <IconEye size={18} />}
      </button>
    </div>
  );
}
