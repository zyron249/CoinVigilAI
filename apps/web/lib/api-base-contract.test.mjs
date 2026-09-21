import assert from "node:assert/strict";
import test from "node:test";

function resolveApiBase(isBrowser, publicUrl, internalUrl) {
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

test("local next dev keeps localhost API", () => {
  assert.equal(resolveApiBase(true, undefined, undefined), "http://localhost:8000");
  assert.equal(resolveApiBase(false, undefined, undefined), "http://localhost:8000");
});

test("same-origin production uses relative browser URLs and loopback SSR", () => {
  assert.equal(resolveApiBase(true, "same-origin", "http://127.0.0.1:8000"), "");
  assert.equal(resolveApiBase(false, "same-origin", "http://127.0.0.1:8000"), "http://127.0.0.1:8000");
  assert.equal(resolveApiBase(false, "same-origin", undefined), "http://127.0.0.1:8000");
});

test("explicit public URL wins in the browser", () => {
  assert.equal(resolveApiBase(true, "https://api.example.com", "http://api:8000"), "https://api.example.com");
  assert.equal(resolveApiBase(false, "https://api.example.com", "http://api:8000"), "http://api:8000");
});
