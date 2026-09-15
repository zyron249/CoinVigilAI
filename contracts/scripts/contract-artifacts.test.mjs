import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

function readAbi(file) {
  return JSON.parse(fs.readFileSync(new URL(`../build/${file}`, import.meta.url), "utf8"));
}

function signature(entry) {
  return `${entry.name}(${(entry.inputs || []).map((input) => input.type).join(",")})`;
}

test("factory build exposes the Token Studio createToken contract", () => {
  const abi = readAbi("src_CoinVigilTokenFactory_sol_CoinVigilTokenFactory.abi");
  const functions = new Set(abi.filter((entry) => entry.type === "function").map(signature));
  const events = new Set(abi.filter((entry) => entry.type === "event").map(signature));

  assert(functions.has("createToken(string,string,uint256,uint256,bool,bool)"));
  assert(events.has("TokenCreated(address,address,string,string,uint256,uint256,bool,bool)"));
});

test("generated token build retains required ERC20 and owner controls", () => {
  const abi = readAbi("src_CoinVigilTokenFactory_sol_CoinVigilERC20.abi");
  const functions = new Set(abi.filter((entry) => entry.type === "function").map(signature));

  for (const expected of [
    "transfer(address,uint256)",
    "approve(address,uint256)",
    "transferFrom(address,address,uint256)",
    "balanceOf(address)",
    "allowance(address,address)",
    "totalSupply()",
    "mint(address,uint256)",
    "burn(uint256)",
    "transferOwnership(address)",
    "renounceOwnership()",
  ]) {
    assert(functions.has(expected), `missing ABI function: ${expected}`);
  }
});
