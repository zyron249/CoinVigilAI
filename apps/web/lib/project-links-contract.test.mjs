import assert from "node:assert/strict";
import test from "node:test";

function publicLinks(links) {
  const seen = new Set();
  const rows = [];
  for (const link of Array.isArray(links) ? links : []) {
    const url = typeof link?.url === "string" ? link.url.trim() : "";
    if (!url.startsWith("http://") && !url.startsWith("https://")) continue;
    const key = url.replace(/\/+$/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ kind: String(link.kind || "link"), label: String(link.label || "Link"), url });
  }
  return rows;
}

test("empty and non-http project links stay empty", () => {
  assert.deepEqual(publicLinks(null), []);
  assert.deepEqual(publicLinks([]), []);
  assert.deepEqual(publicLinks([{ kind: "x", label: "X", url: "javascript:alert(1)" }]), []);
  assert.deepEqual(publicLinks([{ kind: "web", label: "Web", url: "not-a-url" }]), []);
});

test("keeps http(s) links and drops duplicates", () => {
  const rows = publicLinks([
    { kind: "website", label: "Website", url: "https://bitcoin.org/" },
    { kind: "website", label: "Website 2", url: "https://bitcoin.org" },
    { kind: "x", label: "X", url: "https://x.com/bitcoin" },
    { kind: "bad", label: "Bad", url: "javascript:alert(1)" },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].url, "https://bitcoin.org/");
  assert.equal(rows[1].url, "https://x.com/bitcoin");
});
