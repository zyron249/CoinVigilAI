export function scrollAssetWorkspace() {
  if (typeof window === "undefined") return;
  const node = document.querySelector(".asset-workspace");
  if (!(node instanceof HTMLElement)) return;
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--sticky-offset");
  const offset = Number.parseFloat(raw) || 160;
  const top = node.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top: Math.max(0, top), behavior: "auto" });
}
