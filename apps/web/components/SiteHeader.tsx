"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const LINKS = [
  { href: "/", label: "Markets" },
  { href: "/news", label: "News" },
  { href: "/token-studio", label: "Token Studio" },
];

function isCurrent(href: string, pathname: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader() {
  const pathname = usePathname() || "/";
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const studio = pathname.startsWith("/token-studio");

  return (
    <header className="site-header">
      <nav aria-label="Primary">
        <Link className="brand" href="/">
          <span className="brand-mark">V</span> CoinVigil <b>AI</b>
        </Link>
        <button
          type="button"
          className="menu-toggle ghost"
          aria-expanded={open}
          aria-controls="site-nav"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Close" : "Menu"}
        </button>
        <div id="site-nav" className={`nav-links ${open ? "open" : ""}`}>
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isCurrent(link.href, pathname) ? "page" : undefined}
            >
              {link.label}
            </Link>
          ))}
          <Link className="nav-cta nav-cta-mobile" href={studio ? "/" : "/token-studio"}>
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
