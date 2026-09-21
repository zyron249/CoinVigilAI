"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { scrollAssetWorkspace } from "../lib/scroll-workspace";

const SECTIONS = [
  { id: "overview", href: "#overview", label: "Overview" },
  { id: "community", href: "#community", label: "Links" },
  { id: "contracts", href: "#contracts", label: "Contracts" },
  { id: "markets-tab", href: "#markets-tab", label: "Markets" },
  { id: "chart-lab", href: "#chart-lab", label: "Chart" },
] as const;

export function AssetSubnav({ compareHref }: { compareHref: string }) {
  const [active, setActive] = useState("overview");
  const navRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    function syncFromHash() {
      const hash = window.location.hash.replace(/^#/, "");
      if (SECTIONS.some((item) => item.id === hash)) setActive(hash);
    }
    syncFromHash();

    const observed = new Map<string, IntersectionObserverEntry>();
    const observer = new IntersectionObserver(
      (entries) => {
        const hash = window.location.hash.replace(/^#/, "");
        if (SECTIONS.some((item) => item.id === hash)) {
          setActive(hash);
          return;
        }
        for (const entry of entries) observed.set(entry.target.id, entry);
        const visible = SECTIONS
          .map((item) => observed.get(item.id))
          .filter((entry): entry is IntersectionObserverEntry => Boolean(entry?.isIntersecting));
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-160px 0px -60% 0px", threshold: [0, 0.15, 0.4] },
    );

    function observeMounted() {
      for (const item of SECTIONS) {
        const node = document.getElementById(item.id);
        if (node) observer.observe(node);
      }
    }
    observeMounted();
    window.addEventListener("hashchange", syncFromHash);
    window.addEventListener("hashchange", observeMounted);
    return () => {
      observer.disconnect();
      window.removeEventListener("hashchange", syncFromHash);
      window.removeEventListener("hashchange", observeMounted);
    };
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    const root = navRef.current;
    if (!root) return;
    const items = [...root.querySelectorAll<HTMLAnchorElement>("a[href]")];
    const index = items.indexOf(event.target as HTMLAnchorElement);
    if (index < 0) return;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      items[(index + 1) % items.length]?.focus();
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      items[items.length - 1]?.focus();
    }
  }

  return (
    <nav
      ref={navRef}
      className="asset-subnav"
      aria-label="On this page"
      onKeyDown={onKeyDown}
    >
      {SECTIONS.map((item) => (
        <a
          key={item.id}
          href={item.href}
          className={active === item.id ? "is-on" : undefined}
          aria-current={active === item.id ? "true" : undefined}
          onClick={(event: MouseEvent<HTMLAnchorElement>) => {
            if (item.id !== "chart-lab" && item.id !== "markets-tab") return;
            window.setTimeout(() => { scrollAssetWorkspace(); }, 40);
            event.currentTarget.blur();
          }}
        >
          {item.label}
        </a>
      ))}
      <Link href={compareHref}>Compare</Link>
    </nav>
  );
}
