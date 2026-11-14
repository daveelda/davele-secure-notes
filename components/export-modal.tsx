"use client";

import React from "react";
import { Note } from "@/lib/types";
import { IconDownload, IconFileText } from "./icons";
import { Modal } from "./modal";

interface ExportModalProps {
  note: Note;
  isOpen: boolean;
  onClose: () => void;
}

export function ExportModal({ note, isOpen, onClose }: ExportModalProps) {
  if (!isOpen) return null;

  const exportAsTxt = () => {
    let content = `${note.title.toUpperCase()}\n`;
    content += `Date: ${new Date(note.created_at).toLocaleString()}\n`;
    content += "=".repeat(40) + "\n\n";
    content += `${note.body}\n`;
    downloadBlob(content, `${sanitizeFilename(note.title)}.txt`, "text/plain");
  };

  const exportAsMarkdown = () => {
    let content = `# ${note.title}\n\n`;
    content += `*Created: ${new Date(note.created_at).toLocaleString()}*\n\n`;
    content += `${note.body}\n`;
    downloadBlob(content, `${sanitizeFilename(note.title)}.md`, "text/markdown");
  };

  const exportAsPDF = () => {
    // Generate clean printable document in a new window for PDF generation
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Please allow popups to export to PDF.");
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${escapeHtml(note.title)} - DAVELE Export</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 40px; color: #1e1b2e; line-height: 1.7; max-width: 800px; margin: 0 auto; }
            h1 { font-size: 26px; border-bottom: 2px solid #e6e4ee; padding-bottom: 12px; margin-bottom: 8px; color: #16141f; }
            .meta { font-size: 13px; color: #6b6780; margin-bottom: 24px; }
            .content { white-space: pre-wrap; font-size: 15px; margin-bottom: 30px; }
            .footer { margin-top: 50px; font-size: 12px; color: #8b879c; border-top: 1px solid #e6e4ee; padding-top: 10px; }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(note.title)}</h1>
          <div class="meta">Exported from DAVELE • ${new Date().toLocaleDateString()}</div>
          <div class="content">${escapeHtml(note.body)}</div>
          <div class="footer">DAVELE Secure Notes</div>
          <script>
            window.onload = function() {
              window.print();
              window.onafterprint = function() { window.close(); };
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const sanitizeFilename = (name: string) =>
    name.replace(/[^a-z0-9_-]/gi, "_").toLowerCase() || "note";

  const escapeHtml = (str: string) =>
    str.replace(/[&<>'"]/g, (tag) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[tag] || tag));

  const downloadBlob = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type: `${type};charset=utf-8;` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const options = [
    {
      label: "Markdown",
      ext: ".md",
      description: "Keeps headings and lists — for Notion, Obsidian, GitHub",
      icon: <IconFileText size={18} />,
      action: exportAsMarkdown,
    },
    {
      label: "Plain text",
      ext: ".txt",
      description: "Lightweight universal text file",
      icon: <IconFileText size={18} />,
      action: exportAsTxt,
    },
    {
      label: "Print / PDF",
      ext: ".pdf",
      description: "Clean printable document",
      icon: <IconDownload size={18} />,
      action: exportAsPDF,
    },
  ];

  return (
    <Modal
      title="Export note"
      description="Choose a format to download"
      icon={<IconDownload size={20} />}
      onClose={onClose}
    >
      <div className="space-y-2">
        {options.map((o) => (
          <button
            key={o.label}
            type="button"
            onClick={() => {
              o.action();
              onClose();
            }}
            className="group flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-3.5 text-left transition-all duration-150 hover:border-accent hover:bg-accent-soft"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sunken text-muted transition-colors group-hover:text-accent-text">
              {o.icon}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-fg">
                {o.label} <span className="font-normal text-subtle">{o.ext}</span>
              </div>
              <div className="text-xs text-muted">{o.description}</div>
            </div>
            <span className="text-xs font-semibold text-accent-text opacity-0 transition-opacity group-hover:opacity-100">
              Export →
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
