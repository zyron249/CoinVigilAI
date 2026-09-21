"use client";

import { useEffect, useState, type ReactNode } from "react";
import { SidebarCtx } from "./sidebar-context";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";
import { SiteSidebar } from "./SiteSidebar";

export function AppChrome({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = original;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <SidebarCtx.Provider value={{ open, setOpen }}>
      <div className={`app-frame ${open ? "is-sidebar-open" : ""}`}>
        <SiteSidebar />
        {open ? (
          <button
            type="button"
            className="nav-backdrop"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
        ) : null}
        <div className="app-stage">
          <SiteHeader />
          {children}
          <SiteFooter />
        </div>
      </div>
    </SidebarCtx.Provider>
  );
}
