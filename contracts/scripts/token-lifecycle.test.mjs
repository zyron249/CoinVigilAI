import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { BrowserProvider, Contract, ContractFactory, parseUnits } from "ethers";

const buildUrl = (file) => new URL(`../build/${file}`, import.meta.url);
const readAbi = (file) => JSON.parse(fs.readFileSync(buildUrl(file), "utf8"));
const readBin = (file) => `0x${fs.readFileSync(buildUrl(file), "utf8").trim()}`;

const factoryAbi = readAbi("src_CoinVigilTokenFactory_sol_CoinVigilTokenFactory.abi");
const factoryBin = readBin("src_CoinVigilTokenFactory_sol_CoinVigilTokenFactory.bin");
const tokenAbi = readAbi("src_CoinVigilTokenFactory_sol_CoinVigilERC20.abi");

async function fixture() {
  const eip1193 = ganache.provider({ logging: { quiet: true } });
  const provider = new BrowserProvider(eip1193);
  const owner = await provider.getSigner(0);
  const spender = await provider.getSigner(1);
  const recipient = await provider.getSigner(2);
  const factory = await new ContractFactory(factoryAbi, factoryBin, owner).deploy();
  await factory.waitForDeployment();
  return { eip1193, owner, spender, recipient, factory };
}

async function createToken(factory, owner, options = {}) {
  const initial = options.initial ?? parseUnits("1000", 18);
  const max = options.max ?? parseUnits("2000", 18);
  const tx = await factory.connect(owner).createToken(
    options.name ?? "CoinVigil Test",
    options.symbol ?? "CVT",
    initial,
    max,
    options.mintable ?? true,
    options.burnable ?? true,
  );
  const receipt = await tx.wait();
  const event = receipt.logs
    .map((log) => { try { return factory.interface.parseLog(log); } catch { return null; } })
    .find((entry) => entry?.name === "TokenCreated");
  assert(event, "TokenCreated event was not emitted");
  return { token: new Contract(event.args.token, tokenAbi, owner), initial, max };
}

test("factory creates a usable token and preserves owner controls", async (t) => {
  const { eip1193, owner, spender, recipient, factory } = await fixture();
  t.after(() => eip1193.disconnect());
  const ownerAddress = await owner.getAddress();
  const spenderAddress = await spender.getAddress();
  const recipientAddress = await recipient.getAddress();
  const { token, initial, max } = await createToken(factory, owner);

  assert.equal(await token.owner(), ownerAddress);
  assert.equal(await token.totalSupply(), initial);
  assert.equal(await token.balanceOf(ownerAddress), initial);
  assert.equal(await token.maxSupply(), max);

  const transferAmount = parseUnits("100", 18);
  await (await token.transfer(recipientAddress, transferAmount)).wait();
  assert.equal(await token.balanceOf(recipientAddress), transferAmount);

  const allowance = parseUnits("50", 18);
  await (await token.approve(spenderAddress, allowance)).wait();
  await (await token.connect(spender).transferFrom(ownerAddress, recipientAddress, allowance)).wait();
  assert.equal(await token.allowance(ownerAddress, spenderAddress), 0n);
  assert.equal(await token.balanceOf(recipientAddress), transferAmount + allowance);

  const mintAmount = parseUnits("200", 18);
  await (await token.mint(recipientAddress, mintAmount)).wait();
  assert.equal(await token.totalSupply(), initial + mintAmount);

  const burnAmount = parseUnits("25", 18);
  await (await token.connect(recipient).burn(burnAmount)).wait();
  assert.equal(await token.totalSupply(), initial + mintAmount - burnAmount);
});

test("token rejects unauthorized minting and supply-cap overflow", async (t) => {
  const { eip1193, owner, spender, factory } = await fixture();
  t.after(() => eip1193.disconnect());
  const { token, initial, max } = await createToken(factory, owner);

  await assert.rejects(token.connect(spender).mint(await spender.getAddress(), 1n));
  await assert.rejects(token.mint(await owner.getAddress(), max - initial + 1n));
});

test("disabled mint and burn features revert", async (t) => {
  const { eip1193, owner, factory } = await fixture();
  t.after(() => eip1193.disconnect());
  const { token } = await createToken(factory, owner, { mintable: false, burnable: false });

  await assert.rejects(token.mint(await owner.getAddress(), 1n));
  await assert.rejects(token.burn(1n));
});
