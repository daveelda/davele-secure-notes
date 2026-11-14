"use client";

import React, { useEffect } from "react";
import { IconX } from "./icons";

interface ModalProps {
  title: string;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}

/** Shared, theme-aware modal shell used by Share, Export and History. */
export function Modal({
  title,
  description,
  icon,
  onClose,
  children,
  className = "max-w-md",
  bodyClassName = "p-6",
}: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    // Capture phase so Escape closes this modal before the editor behind it.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4 backdrop-blur-sm animate-fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl border border-line bg-elevated text-fg shadow-float animate-scale-in ${className}`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
          <div className="flex items-center gap-3">
            {icon && (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-text">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <h3 className="text-[15px] font-semibold tracking-tight text-fg">{title}</h3>
              {description && <p className="mt-0.5 truncate text-[13px] text-muted">{description}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-subtle transition hover:bg-hover hover:text-fg"
          >
            <IconX size={18} />
          </button>
        </div>
        <div className={`min-h-0 flex-1 overflow-y-auto ${bodyClassName}`}>{children}</div>
      </div>
    </div>
  );
}
