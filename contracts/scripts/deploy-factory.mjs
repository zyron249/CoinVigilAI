import fs from "node:fs";
import process from "node:process";
import { ethers } from "ethers";
import { assertExpectedNetwork, assertMainnetAllowed, parseExpectedChainId } from "./deployment-policy.mjs";

const rpcUrl = process.env.RPC_URL;
const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
const deployerAddress = process.env.DEPLOYER_ADDRESS;
const expectedChainId = parseExpectedChainId(process.env.EXPECTED_CHAIN_ID);
const shouldBroadcast = process.env.CONFIRM_DEPLOY === "YES";

if (!rpcUrl) {
  throw new Error("RPC_URL and EXPECTED_CHAIN_ID are required");
}
if (!shouldBroadcast && !deployerAddress && !privateKey) {
  throw new Error("Dry runs require DEPLOYER_ADDRESS (preferred) or DEPLOYER_PRIVATE_KEY");
}
if (shouldBroadcast && !privateKey) {
  throw new Error("DEPLOYER_PRIVATE_KEY is required only when CONFIRM_DEPLOY=YES");
}

const provider = new ethers.JsonRpcProvider(rpcUrl);
const network = await provider.getNetwork();
assertExpectedNetwork(network.chainId, expectedChainId);
assertMainnetAllowed(network.chainId, process.env.ALLOW_MAINNET);

const signer = shouldBroadcast ? new ethers.Wallet(privateKey, provider) : null;
const fromAddress = signer ? signer.address : ethers.getAddress(deployerAddress || new ethers.Wallet(privateKey).address);
const balance = await provider.getBalance(fromAddress);
if (balance === 0n) throw new Error("Deployer address has no native balance for gas");

const abi = JSON.parse(fs.readFileSync(new URL("../build/src_CoinVigilTokenFactory_sol_CoinVigilTokenFactory.abi", import.meta.url), "utf8"));
const bytecode = fs.readFileSync(new URL("../build/src_CoinVigilTokenFactory_sol_CoinVigilTokenFactory.bin", import.meta.url), "utf8").trim();
if (!bytecode) throw new Error("Factory bytecode is empty; run npm run build first");

const factory = new ethers.ContractFactory(abi, `0x${bytecode}`, signer || undefined);
const deployTx = await factory.getDeployTransaction();
const gas = await provider.estimateGas({ ...deployTx, from: fromAddress });
const feeData = await provider.getFeeData();
console.log(`Deployment check from ${fromAddress} on chain ${network.chainId}`);
console.log(`Estimated gas: ${gas}`);
if (feeData.maxFeePerGas) console.log(`Estimated max gas cost: ${ethers.formatEther(gas * feeData.maxFeePerGas)} native`);

if (!shouldBroadcast) {
  console.log("Dry run complete. No private key or transaction broadcast was required.");
  console.log("Set CONFIRM_DEPLOY=YES and DEPLOYER_PRIVATE_KEY only when ready to broadcast.");
  process.exit(0);
}

const contract = await factory.deploy();
console.log(`Transaction: ${contract.deploymentTransaction()?.hash}`);
await contract.waitForDeployment();
const address = await contract.getAddress();
const code = await provider.getCode(address);
if (code === "0x") throw new Error("Deployment receipt succeeded but no contract bytecode was found");
console.log(`CoinVigilTokenFactory deployed: ${address}`);
