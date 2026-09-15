import test from "node:test";
import assert from "node:assert/strict";
import { assertExpectedNetwork, assertMainnetAllowed, parseExpectedChainId } from "./deployment-policy.mjs";

test("parses positive chain ids", () => {
  assert.equal(parseExpectedChainId("11155111"), 11155111n);
});

test("rejects invalid chain ids", () => {
  for (const value of [undefined, "", "0", "-1", "1.5", "abc"]) {
    assert.throws(() => parseExpectedChainId(value), /positive integer/);
  }
});

test("rejects a connected network that differs from expectation", () => {
  assert.doesNotThrow(() => assertExpectedNetwork(11155111n, 11155111n));
  assert.throws(() => assertExpectedNetwork(1n, 11155111n), /Refusing deployment/);
});

test("requires explicit acknowledgement on known production networks", () => {
  for (const chainId of [1n, 10n, 56n, 137n, 42161n, 43114n, 8453n]) {
    assert.throws(() => assertMainnetAllowed(chainId), /Refusing mainnet deployment/);
    assert.doesNotThrow(() => assertMainnetAllowed(chainId, "YES"));
  }
  assert.doesNotThrow(() => assertMainnetAllowed(11155111n));
});
