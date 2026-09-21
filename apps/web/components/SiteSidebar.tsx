"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSidebar } from "./sidebar-context";

const PRIMARY = [
  { href: "/", label: "Dashboard", icon: "grid" },
  { href: "/#watchlist", label: "Watchlist", icon: "star" },
  { href: "/alerts", label: "Alerts", icon: "bell" },
  { href: "/ask", label: "Ask CoinVigil", icon: "spark" },
  { href: "/#markets", label: "Markets", icon: "list" },
  { href: "/news", label: "News", icon: "news" },
];

const SECONDARY = [
  { href: "/compare", label: "Compare", icon: "list" },
  { href: "/convert", label: "Convert", icon: "radar" },
  { href: "/status", label: "Status", icon: "gear" },
];

function Icon({ name }: { name: string }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  if (name === "grid") return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>;
  if (name === "list") return <svg {...common}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>;
  if (name === "spark") return <svg {...common}><path d="M12 3l1.6 5.2L19 10l-5.4 1.8L12 17l-1.6-5.2L5 10l5.4-1.8L12 3z" /></svg>;
  if (name === "radar") return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M5.5 5.5a9 9 0 0 1 13 0M3 12h.01M21 12h.01M5.5 18.5a9 9 0 0 0 13 0" /></svg>;
  if (name === "news") return <svg {...common}><path d="M4 5h12v14H4zM16 9h4v10a2 2 0 0 1-2 2H6" /><path d="M7 9h6M7 13h6M7 17h3" /></svg>;
  if (name === "star") return <svg {...common}><path d="M12 3l2.4 6.2L21 10l-5 4.2L17.6 21 12 17.6 6.4 21 8 14.2 3 10l6.6-.8L12 3z" /></svg>;
  if (name === "bell") return <svg {...common}><path d="M6 9a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9" /><path d="M10 21h4" /></svg>;
  if (name === "bag") return <svg {...common}><path d="M6 8h12l-1 12H7L6 8z" /><path d="M9 8V7a3 3 0 0 1 6 0v1" /></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" /></svg>;
}

function isCurrent(href: string, pathname: string) {
  if (href === "/") return pathname === "/";
  if (href.startsWith("/#")) return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteSidebar() {
  const pathname = usePathname() || "/";
  const { open, setOpen } = useSidebar();

  return (
    <aside id="site-sidebar" className={`site-sidebar ${open ? "open" : ""}`} aria-label="Primary">
      <div className="sidebar-brand-row">
        <Link className="brand sidebar-brand" href="/" onClick={() => setOpen(false)}>
          <span className="brand-mark">V</span>
          <span>CoinVigil <b>AI</b></span>
        </Link>
        <button type="button" className="sidebar-close ghost" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      <p className="sidebar-kicker">Your coins, not the whole market</p>
      <nav className="sidebar-nav">
        {PRIMARY.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="sidebar-link"
            aria-current={isCurrent(link.href, pathname) && !link.href.includes("#") ? "page" : undefined}
            onClick={() => setOpen(false)}
          >
            <Icon name={link.icon} />
            <span>{link.label}</span>
          </Link>
        ))}
      </nav>
      <p className="sidebar-kicker">Desk</p>
      <nav className="sidebar-nav">
        {SECONDARY.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="sidebar-link"
            aria-current={isCurrent(link.href, pathname) ? "page" : undefined}
            onClick={() => setOpen(false)}
          >
            <Icon name={link.icon} />
            <span>{link.label}</span>
          </Link>
        ))}
      </nav>
      <div className="sidebar-foot">
        <p>v0.4.0 · CoinGecko snapshot</p>
        <p>Not financial advice. Watchlist and alerts stay in this browser.</p>
      </div>
    </aside>
  );
}
