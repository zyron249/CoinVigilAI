"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const SECTIONS = [
  { id: "overview", href: "#overview", label: "Overview" },
  { id: "community", href: "#community", label: "Links" },
  { id: "contracts", href: "#contracts", label: "Contracts" },
  { id: "markets-tab", href: "#markets-tab", label: "Markets" },
  { id: "chart-lab", href: "#chart-lab", label: "Chart" },
] as const;

export function AssetSubnav({ compareHref }: { compareHref: string }) {
  const [active, setActive] = useState("overview");

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

  return (
    <nav className="asset-subnav" aria-label="On this page">
      {SECTIONS.map((item) => (
        <a
          key={item.id}
          href={item.href}
          className={active === item.id ? "is-on" : undefined}
          aria-current={active === item.id ? "location" : undefined}
        >
          {item.label}
        </a>
      ))}
      <Link href={compareHref}>Compare</Link>
    </nav>
  );
}
