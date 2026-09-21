"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useSidebar } from "./sidebar-context";

const TOP = [
  { href: "/", label: "Dashboard" },
  { href: "/#markets", label: "Markets" },
  { href: "/ask", label: "AI Analysis" },
  { href: "/#radar", label: "Token Radar" },
  { href: "/news", label: "News" },
  { href: "/#watchlist", label: "Watchlist" },
];

function isCurrent(href: string, pathname: string) {
  if (href === "/") return pathname === "/";
  if (href.startsWith("/#")) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader() {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const { open, setOpen } = useSidebar();
  const [q, setQ] = useState("");
  const studio = pathname.startsWith("/token-studio");

  return (
    <header className="site-header">
      <nav aria-label="Primary">
        <button
          type="button"
          className="menu-toggle ghost"
          aria-expanded={open}
          aria-controls="site-sidebar"
          onClick={() => setOpen(!open)}
        >
          {open ? "Close" : "Menu"}
        </button>
        <div className="nav-links top-nav">
          {TOP.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isCurrent(link.href, pathname) ? "page" : undefined}
            >
              {link.label}
            </Link>
          ))}
        </div>
        <form
          className="market-search header-search"
          onSubmit={(event) => {
            event.preventDefault();
            const next = q.trim();
            router.push(next ? `/?q=${encodeURIComponent(next)}#find-asset` : "/#find-asset");
          }}
        >
          <label className="sr-only" htmlFor="header-market-search">Search tokens, pairs, or news</label>
          <input
            id="header-market-search"
            type="search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search tokens, pairs, or news…"
            autoComplete="off"
          />
        </form>
        <Link className="nav-cta" href={studio ? "/" : "/token-studio"}>
          {studio ? "Open Markets" : "Create Token"}
        </Link>
      </nav>
      <p className="legal-strip">Informational research only — not financial advice.</p>
    </header>
  );
}
