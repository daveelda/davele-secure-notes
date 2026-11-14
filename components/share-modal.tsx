"use client";

import React, { useState } from "react";
import { Note } from "@/lib/types";
import { IconCheck, IconCopy, IconExternalLink, IconShare } from "./icons";
import { setShareStatus } from "@/app/actions";
import { Modal } from "./modal";

interface ShareModalProps {
  note: Note;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (updatedNote: Note) => void;
}

export function ShareModal({ note, isOpen, onClose, onUpdate }: ShareModalProps) {
  const [isCopied, setIsCopied] = useState(false);
  const [isPending, setIsPending] = useState(false);

  if (!isOpen) return null;

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const shareUrl = note.share_token ? `${origin}/share/${note.share_token}` : "";

  const handleToggleShare = async () => {
    setIsPending(true);
    const newStatus = !note.share_enabled;
    const res = await setShareStatus(note.id, newStatus);
    setIsPending(false);

    if (res.success && res.data) {
      onUpdate({
        ...note,
        share_enabled: newStatus,
        share_token: res.data.share_token,
      });
    }
  };

  const copyToClipboard = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <Modal
      title="Share note"
      description="Create a secure, read-only link"
      icon={<IconShare size={20} />}
      onClose={onClose}
    >
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-4 rounded-xl border border-line bg-surface p-4">
          <div>
            <div className="text-sm font-medium text-fg">Public link</div>
            <div className="mt-0.5 text-xs text-muted">Anyone with the link can view this note</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={Boolean(note.share_enabled)}
            aria-label="Public link"
            onClick={handleToggleShare}
            disabled={isPending}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-60 ${
              note.share_enabled ? "bg-accent" : "bg-line-strong"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                note.share_enabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {note.share_enabled && shareUrl && (
          <div className="space-y-2 animate-slide-up">
            <label htmlFor="share-url" className="text-xs font-medium text-muted">
              Shareable link
            </label>
            <div className="flex items-center gap-2">
              <input
                id="share-url"
                type="text"
                readOnly
                value={shareUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="h-10 w-full min-w-0 rounded-lg border border-line bg-sunken px-3 text-xs text-fg outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={copyToClipboard}
                className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-xs font-semibold text-accent-fg transition hover:bg-accent-hover"
              >
                {isCopied ? (
                  <>
                    <IconCheck size={14} /> Copied
                  </>
                ) : (
                  <>
                    <IconCopy size={14} /> Copy
                  </>
                )}
              </button>
            </div>

            <a
              href={shareUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 pt-1 text-xs font-medium text-accent-text hover:underline"
            >
              <IconExternalLink size={12} /> Open preview in new tab
            </a>
          </div>
        )}
      </div>
    </Modal>
  );
}
