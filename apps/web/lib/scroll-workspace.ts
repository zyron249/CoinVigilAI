export type WorkspaceHash = "chart-lab" | "markets-tab" | "";

export function workspaceHashId(): WorkspaceHash {
  if (typeof window === "undefined") return "";
  const hash = window.location.hash.replace(/^#/, "");
  if (hash === "chart" || hash === "chart-lab") return "chart-lab";
  if (hash === "markets-tab") return "markets-tab";
  return "";
}

export function stickyWorkspaceOffset(): number {
  if (typeof document === "undefined") return 160;
  const header = document.querySelector(".site-header");
  const subnav = document.querySelector(".asset-subnav");
  const headerH = header instanceof HTMLElement ? Math.round(header.getBoundingClientRect().height) : 0;
  const subnavH = subnav instanceof HTMLElement ? Math.round(subnav.getBoundingClientRect().height) : 0;
  const measured = headerH + subnavH;
  if (measured < 80) {
    const raw = getComputedStyle(document.documentElement).getPropertyValue("--sticky-offset");
    return Number.parseFloat(raw) || 160;
  }
  return measured + 6;
}

export function scrollAssetWorkspace() {
  if (typeof window === "undefined") return;
  const node = document.querySelector(".asset-workspace");
  if (!(node instanceof HTMLElement)) return;
  const offset = stickyWorkspaceOffset();
  const top = node.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top: Math.max(0, top), behavior: "auto" });
}

export function queueWorkspaceScroll(extraMs = 0) {
  if (typeof window === "undefined") return;
  window.setTimeout(() => { scrollAssetWorkspace(); }, 40);
  if (extraMs > 0) {
    window.setTimeout(() => { scrollAssetWorkspace(); }, extraMs);
  }
}
