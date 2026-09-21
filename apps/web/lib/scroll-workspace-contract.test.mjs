import assert from "node:assert/strict";
import test from "node:test";

function workspaceHashId(hash) {
  const value = String(hash || "").replace(/^#/, "");
  if (value === "chart" || value === "chart-lab") return "chart-lab";
  if (value === "markets-tab") return "markets-tab";
  return "";
}

test("chart aliases snap to the Chart Lab workspace hash", () => {
  assert.equal(workspaceHashId("#chart-lab"), "chart-lab");
  assert.equal(workspaceHashId("chart"), "chart-lab");
  assert.equal(workspaceHashId("#markets-tab"), "markets-tab");
  assert.equal(workspaceHashId("#watchlist"), "");
  assert.equal(workspaceHashId("#contracts"), "");
  assert.equal(workspaceHashId(""), "");
});
