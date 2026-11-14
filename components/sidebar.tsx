"use client";

import React from "react";
import { ViewFilter } from "@/lib/types";
import {
  DaveleLogo,
  IconArchive,
  IconClock,
  IconLogOut,
  IconPlus,
  IconStar,
  IconX,
} from "./icons";
import { ThemeToggle } from "./theme-provider";

interface SidebarProps {
  currentFilter: ViewFilter;
  onSelectFilter: (filter: ViewFilter) => void;
  notesCount: {
    all: number;
    pinned: number;
    favorites: number;
    archive: number;
    reminders: number;
  };
  onCreateNote: () => void;
  userName: string;
  userEmail?: string;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  onSignOut: () => void;
}

const navItemCls = (isActive: boolean) =>
  `group relative flex w-full items-center justify-between rounded-lg px-3 py-2 text-[13px] font-medium transition-colors duration-150 ${
    isActive ? "bg-accent-soft text-fg" : "text-muted hover:bg-hover hover:text-fg"
  }`;

export function Sidebar({
  currentFilter,
  onSelectFilter,
  notesCount,
  onCreateNote,
  userName,
  userEmail,
  isOpenMobile,
  onCloseMobile,
  onSignOut,
}: SidebarProps) {
  const navItems = [
    {
      id: "all" as ViewFilter,
      label: "All notes",
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      ),
      count: notesCount.all,
    },
    {
      id: "pinned" as ViewFilter,
      label: "Pinned",
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="17" x2="12" y2="22" />
          <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
        </svg>
      ),
      count: notesCount.pinned,
    },
    { id: "favorites" as ViewFilter, label: "Favorites", icon: <IconStar size={17} />, count: notesCount.favorites },
    { id: "reminders" as ViewFilter, label: "Reminders", icon: <IconClock size={17} />, count: notesCount.reminders },
    { id: "archive" as ViewFilter, label: "Archive", icon: <IconArchive size={17} />, count: notesCount.archive },
  ];

  return (
    <>
      {/* Mobile backdrop */}
      {isOpenMobile && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-overlay backdrop-blur-sm animate-fade-in lg:hidden"
        />
      )}

      <aside
        className={`sidebar fixed top-0 bottom-0 left-0 z-40 flex w-[264px] flex-col border-r border-line bg-sunken transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] lg:static lg:translate-x-0 ${
          isOpenMobile ? "translate-x-0 shadow-float" : "-translate-x-full"
        }`}
      >
        {/* Brand */}
        <div className="flex h-16 shrink-0 items-center justify-between px-5">
          <div className="flex items-center gap-2.5">
            <DaveleLogo size={28} />
            <div className="leading-none">
              <span className="block text-[15px] font-semibold tracking-tight text-fg">DAVELE</span>
              <span className="mt-1 block text-[10px] font-medium uppercase tracking-[0.14em] text-subtle">
                Workspace
              </span>
            </div>
          </div>
          <button
            onClick={onCloseMobile}
            aria-label="Close sidebar"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-subtle hover:bg-hover hover:text-fg lg:hidden"
          >
            <IconX size={18} />
          </button>
        </div>

        {/* Primary action */}
        <div className="px-4 pb-3">
          <button
            onClick={onCreateNote}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg shadow-soft transition-all duration-150 hover:bg-accent-hover active:scale-[0.98]"
          >
            <IconPlus size={17} />
            <span>New note</span>
            <kbd className="ml-1 hidden rounded bg-white/15 px-1.5 py-0.5 font-sans text-[10px] font-medium lg:inline">
              Ctrl N
            </kbd>
          </button>
        </div>

        {/* Views */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          <div className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-subtle">
            Library
          </div>
          <nav className="space-y-0.5" aria-label="Views">
            {navItems.map((item) => {
              const isActive = currentFilter === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onSelectFilter(item.id);
                    onCloseMobile();
                  }}
                  aria-current={isActive ? "page" : undefined}
                  className={navItemCls(isActive)}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-accent" />
                  )}
                  <span className="flex items-center gap-2.5">
                    <span className={isActive ? "text-accent-text" : "text-subtle transition-colors group-hover:text-muted"}>
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </span>
                  {item.count > 0 && (
                    <span className={`text-[11px] font-medium tabular-nums ${isActive ? "text-accent-text" : "text-subtle"}`}>
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Footer: appearance + account */}
        <div className="space-y-3 border-t border-line p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted">Appearance</span>
            <ThemeToggle />
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-xs font-semibold uppercase text-accent-text">
              {(userName || userEmail || "A").charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold text-fg">{userName}</div>
              <div className="truncate text-[11px] text-subtle" title={userEmail}>
                {userEmail}
              </div>
            </div>
            <button
              type="button"
              onClick={onSignOut}
              title="Sign out"
              aria-label="Sign out"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-subtle transition hover:bg-danger-soft hover:text-danger"
            >
              <IconLogOut size={15} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
