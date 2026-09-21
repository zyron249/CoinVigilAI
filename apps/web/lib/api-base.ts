/** Browser vs server API origin. `same-origin` is the Render one-URL layout. */
export function resolveApiBase(
  isBrowser: boolean,
  publicUrl?: string | null,
  internalUrl?: string | null,
): string {
  const pub = String(publicUrl ?? "").trim();
  const internal = String(internalUrl ?? "").trim();
  const sameOrigin = pub === "same-origin";
  if (isBrowser) {
    if (sameOrigin) return "";
    return pub || "http://localhost:8000";
  }
  if (internal) return internal;
  if (sameOrigin) return "http://127.0.0.1:8000";
  return pub || "http://localhost:8000";
}
