"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSidebar } from "./sidebar-context";

export function SiteHeader() {
  const router = useRouter();
  const { open, setOpen } = useSidebar();
  const [q, setQ] = useState("");

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
        <Link className="brand header-brand" href="/">
          <span className="brand-mark">V</span>
          <span>CoinVigil <b>AI</b></span>
        </Link>
        <form
          className="market-search header-search"
          onSubmit={(event) => {
            event.preventDefault();
            const next = q.trim();
            router.push(next ? `/?q=${encodeURIComponent(next)}#markets` : "/#markets");
          }}
        >
          <label className="sr-only" htmlFor="header-market-search">Search name, symbol, or id</label>
          <input
            id="header-market-search"
            type="search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search"
            autoComplete="off"
          />
          <button type="submit" className="ghost tool-button">Search</button>
        </form>
        <Link className="ghost tool-button header-watch" href="/#watchlist" aria-label="Watchlist">Watchlist</Link>
        <Link className="ghost tool-button header-alerts" href="/alerts">Alerts</Link>
      </nav>
      <p className="legal-strip">Informational research only — not financial advice.</p>
    </header>
  );
}
