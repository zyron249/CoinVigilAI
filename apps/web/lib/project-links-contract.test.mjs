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

test("genesis date must be YYYY-MM-DD", () => {
  const ok = /^\d{4}-\d{2}-\d{2}$/;
  assert.equal(ok.test("2009-01-03"), true);
  assert.equal(ok.test("not-a-date"), false);
  assert.equal(ok.test("javascript:alert(1)"), false);
});

test("contract addresses reject urls and empty native keys", () => {
  const addressOk = /^[0-9A-Za-z:._-]{8,128}$/;
  assert.equal(addressOk.test("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"), true);
  assert.equal(addressOk.test("javascript:alert(1)"), false);
  assert.equal(addressOk.test(""), false);
});

function truncateAddress(address, head = 8, tail = 6) {
  const text = String(address || "").trim();
  if (text.length <= 18) return text;
  return `${text.slice(0, head)}…${text.slice(-tail)}`;
}

test("truncate long contract addresses and keep short ones whole", () => {
  assert.equal(truncateAddress("shortaddr"), "shortaddr");
  assert.equal(
    truncateAddress("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"),
    "0xa0b869…06eb48",
  );
});

function explorerHref(address, explorerUrl) {
  const url = typeof explorerUrl === "string" ? explorerUrl.trim() : "";
  if (!url.startsWith("http://") && !url.startsWith("https://")) return null;
  if (!url.toLowerCase().includes(String(address || "").toLowerCase())) return null;
  return url;
}

test("explorer deep-link only when CoinGecko URL already contains the address", () => {
  const addr = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
  assert.equal(explorerHref(addr, "https://etherscan.io/"), null);
  assert.equal(explorerHref(addr, `https://etherscan.io/token/${addr}`), `https://etherscan.io/token/${addr}`);
  assert.equal(explorerHref(addr, "javascript:alert(1)"), null);
  assert.equal(explorerHref(addr, "https://etherscan.io/token/0xdeadbeefdeadbeef"), null);
});
