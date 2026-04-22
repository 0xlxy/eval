"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SearchItem } from "@/lib/search-data";

export function CommandPalette({ items }: { items: SearchItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Global Cmd/Ctrl+K listener
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Focus input when opened, reset state when closed
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!query) return items.slice(0, 20);
    const q = query.toLowerCase();
    return items
      .filter(
        (i) =>
          i.label.toLowerCase().includes(q) ||
          (i.subtitle || "").toLowerCase().includes(q)
      )
      .slice(0, 30);
  }, [items, query]);

  // Clamp selection to result length
  useEffect(() => {
    if (selected >= filtered.length) setSelected(Math.max(0, filtered.length - 1));
  }, [filtered.length, selected]);

  if (!open) return null;

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(filtered.length - 1, s + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(0, s - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = filtered[selected];
      if (item) {
        setOpen(false);
        router.push(item.href);
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-24"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg rounded-lg bg-background shadow-lg border overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Search engineers, repos, pages..."
          className="w-full px-4 py-3 text-sm outline-none border-b bg-transparent"
        />
        <div className="max-h-80 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-4 py-6 text-sm text-center text-muted-foreground">
              No results
            </p>
          ) : (
            filtered.map((item, i) => (
              <button
                key={item.href}
                onMouseEnter={() => setSelected(i)}
                onClick={() => {
                  setOpen(false);
                  router.push(item.href);
                }}
                className={`w-full text-left px-4 py-2 flex items-center justify-between ${
                  i === selected ? "bg-muted" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{item.label}</div>
                  {item.subtitle && (
                    <div className="text-xs text-muted-foreground truncate">
                      {item.subtitle}
                    </div>
                  )}
                </div>
                <span className="ml-2 shrink-0 text-[10px] uppercase text-muted-foreground font-mono">
                  {item.kind}
                </span>
              </button>
            ))
          )}
        </div>
        <div className="border-t px-4 py-2 text-[10px] text-muted-foreground flex items-center gap-3">
          <span>
            <kbd className="px-1 bg-muted rounded">↑</kbd>{" "}
            <kbd className="px-1 bg-muted rounded">↓</kbd> to navigate
          </span>
          <span>
            <kbd className="px-1 bg-muted rounded">↵</kbd> to select
          </span>
          <span>
            <kbd className="px-1 bg-muted rounded">esc</kbd> to close
          </span>
        </div>
      </div>
    </div>
  );
}
