"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

const LINKS = [
  { href: "/", label: "Markets" },
  { href: "/compare", label: "Compare" },
  { href: "/#watchlist", label: "Watchlist" },
  { href: "/news", label: "News" },
  { href: "/status", label: "Status" },
  { href: "/token-studio", label: "Token Studio" },
];

function isCurrent(href: string, pathname: string) {
  if (href === "/#watchlist") return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function focusables(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")];
}

export function SiteHeader() {
  const pathname = usePathname() || "/";
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const toggle = toggleRef.current;
    if (!panel) return;
    const previous = document.activeElement as HTMLElement | null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const items = focusables(panel);
    (items[0] ?? panel).focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const list = panel ? focusables(panel) : [];
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", onKey);
      (toggle ?? previous)?.focus?.();
    };
  }, [open]);

  const studio = pathname.startsWith("/token-studio");

  return (
    <header className="site-header">
      <nav aria-label="Primary">
        <Link className="brand" href="/">
          <span className="brand-mark">V</span> CoinVigil <b>AI</b>
        </Link>
        <button
          ref={toggleRef}
          type="button"
          className="menu-toggle ghost"
          aria-expanded={open}
          aria-controls="site-nav"
          aria-haspopup="dialog"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Close" : "Menu"}
        </button>
        {open ? (
          <button
            type="button"
            className="nav-backdrop"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
        ) : null}
        <div
          id="site-nav"
          ref={panelRef}
          className={`nav-links ${open ? "open" : ""}`}
          role={open ? "dialog" : undefined}
          aria-modal={open ? true : undefined}
          aria-labelledby={open ? titleId : undefined}
          tabIndex={open ? -1 : undefined}
        >
          <p id={titleId} className="sr-only">Site menu</p>
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isCurrent(link.href, pathname) ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <Link className="nav-cta nav-cta-mobile" href={studio ? "/" : "/token-studio"} onClick={() => setOpen(false)}>
            {studio ? "Open Markets" : "Create Token"}
          </Link>
        </div>
        <Link className="nav-cta nav-cta-desktop" href={studio ? "/" : "/token-studio"}>
          {studio ? "Open Markets" : "Create Token"}
        </Link>
      </nav>
      <p className="legal-strip">Informational research only — not financial advice.</p>
    </header>
  );
}
