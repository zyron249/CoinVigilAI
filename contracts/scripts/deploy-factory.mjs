import fs from "node:fs";
import process from "node:process";
import { ethers } from "ethers";

const rpcUrl = process.env.RPC_URL;
const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
const expectedChainId = process.env.EXPECTED_CHAIN_ID;

if (!rpcUrl || !privateKey || !expectedChainId) {
  throw new Error("RPC_URL, DEPLOYER_PRIVATE_KEY and EXPECTED_CHAIN_ID are required");
}

const provider = new ethers.JsonRpcProvider(rpcUrl);
const network = await provider.getNetwork();
if (network.chainId !== BigInt(expectedChainId)) {
  throw new Error(`Refusing deployment: connected chain ${network.chainId} != expected ${expectedChainId}`);
}

const wallet = new ethers.Wallet(privateKey, provider);
const balance = await provider.getBalance(wallet.address);
if (balance === 0n) throw new Error("Deployer wallet has no native balance for gas");

const abi = JSON.parse(fs.readFileSync(new URL("../build/src_CoinVigilTokenFactory_sol_CoinVigilTokenFactory.abi", import.meta.url), "utf8"));
const bytecode = fs.readFileSync(new URL("../build/src_CoinVigilTokenFactory_sol_CoinVigilTokenFactory.bin", import.meta.url), "utf8").trim();
if (!bytecode) throw new Error("Factory bytecode is empty; run npm run build first");

const factory = new ethers.ContractFactory(abi, `0x${bytecode}`, wallet);
const deployTx = await factory.getDeployTransaction();
const gas = await provider.estimateGas({ ...deployTx, from: wallet.address });
const feeData = await provider.getFeeData();
console.log(`Deploying from ${wallet.address} on chain ${network.chainId}`);
console.log(`Estimated gas: ${gas}`);
if (feeData.maxFeePerGas) console.log(`Estimated max gas cost: ${ethers.formatEther(gas * feeData.maxFeePerGas)} native`);

if (process.env.CONFIRM_DEPLOY !== "YES") {
  console.log("Dry run complete. Set CONFIRM_DEPLOY=YES to broadcast the deployment transaction.");
  process.exit(0);
}

const contract = await factory.deploy();
console.log(`Transaction: ${contract.deploymentTransaction()?.hash}`);
await contract.waitForDeployment();
const address = await contract.getAddress();
const code = await provider.getCode(address);
if (code === "0x") throw new Error("Deployment receipt succeeded but no contract bytecode was found");
console.log(`CoinVigilTokenFactory deployed: ${address}`);
