"use client";

import { FormEvent, useMemo, useState } from "react";
import { createPublicClient, createWalletClient, custom, isAddress, parseUnits } from "viem";
import { arbitrum, base, bsc, mainnet, polygon } from "viem/chains";

const FACTORY_ABI = [
  {
    type: "function",
    name: "createToken",
    stateMutability: "nonpayable",
    inputs: [
      { name: "name", type: "string" },
      { name: "symbol", type: "string" },
      { name: "initialSupply", type: "uint256" },
      { name: "maxSupply", type: "uint256" },
      { name: "mintable", type: "bool" },
      { name: "burnable", type: "bool" },
    ],
    outputs: [{ name: "token", type: "address" }],
  },
] as const;

const NETWORKS = [
  { key: "ethereum", label: "Ethereum", chain: mainnet, factory: process.env.NEXT_PUBLIC_FACTORY_ETHEREUM },
  { key: "base", label: "Base", chain: base, factory: process.env.NEXT_PUBLIC_FACTORY_BASE },
  { key: "bsc", label: "BNB Chain", chain: bsc, factory: process.env.NEXT_PUBLIC_FACTORY_BSC },
  { key: "polygon", label: "Polygon", chain: polygon, factory: process.env.NEXT_PUBLIC_FACTORY_POLYGON },
  { key: "arbitrum", label: "Arbitrum", chain: arbitrum, factory: process.env.NEXT_PUBLIC_FACTORY_ARBITRUM },
] as const;

export function TokenStudio() {
  const [networkKey, setNetworkKey] = useState("base");
  const [name, setName] = useState("My Token");
  const [symbol, setSymbol] = useState("MYT");
  const [initialSupply, setInitialSupply] = useState("1000000");
  const [maxSupply, setMaxSupply] = useState("1000000");
  const [mintable, setMintable] = useState(false);
  const [burnable, setBurnable] = useState(true);
  const [account, setAccount] = useState<string>("");
  const [status, setStatus] = useState("Configure your token, then connect a wallet.");
  const [txHash, setTxHash] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const network = useMemo(() => NETWORKS.find((item) => item.key === networkKey) ?? NETWORKS[1], [networkKey]);
  const deploymentReady = Boolean(network.factory && isAddress(network.factory));

  async function connectWallet() {
    const ethereum = (window as any).ethereum;
    if (!ethereum) {
      setStatus("No EVM wallet detected. Install a compatible wallet such as MetaMask or use a wallet-enabled browser.");
      return;
    }
    try {
      const client = createWalletClient({ chain: network.chain as any, transport: custom(ethereum) });
      const addresses = await client.requestAddresses();
      setAccount(addresses[0] ?? "");
      setStatus(addresses[0] ? `Wallet connected: ${addresses[0]}` : "Wallet connection returned no account.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Wallet connection failed.");
    }
  }

  async function deploy(event: FormEvent) {
    event.preventDefault();
    setTxHash("");

    if (!name.trim() || !symbol.trim()) {
      setStatus("Token name and symbol are required.");
      return;
    }
    if (!/^[-A-Za-z0-9 ._]{1,64}$/.test(name.trim()) || !/^[A-Za-z0-9]{1,12}$/.test(symbol.trim())) {
      setStatus("Use a 1-64 character token name and a 1-12 character alphanumeric symbol.");
      return;
    }

    let initial: bigint;
    let cap: bigint;
    try {
      initial = parseUnits(initialSupply || "0", 18);
      cap = parseUnits(maxSupply || "0", 18);
    } catch {
      setStatus("Supply values must be valid non-negative numbers.");
      return;
    }
    if (initial <= 0n || cap < initial) {
      setStatus("Initial supply must be greater than zero and max supply cannot be below initial supply.");
      return;
    }
    if (!network.factory) {
      setStatus(`${network.label} factory is not configured yet. Deploy the audited factory and set its NEXT_PUBLIC_FACTORY_* address first.`);
      return;
    }
    if (!isAddress(network.factory)) {
      setStatus(`${network.label} factory configuration is invalid. Refusing to submit a transaction.`);
      return;
    }

    const ethereum = (window as any).ethereum;
    if (!ethereum) {
      setStatus("No EVM wallet detected.");
      return;
    }

    setBusy(true);
    try {
      const client = createWalletClient({ chain: network.chain as any, transport: custom(ethereum) });
      const addresses = await client.requestAddresses();
      const activeAccount = addresses[0];
      if (!activeAccount) throw new Error("No wallet account selected.");

      try {
        await client.switchChain({ id: network.chain.id });
      } catch {
        await ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: `0x${network.chain.id.toString(16)}` }],
        });
      }

      const publicClient = createPublicClient({ chain: network.chain as any, transport: custom(ethereum) });
      const factoryCode = await publicClient.getBytecode({ address: network.factory });
      if (!factoryCode || factoryCode === "0x") {
        throw new Error(`No factory contract is deployed at the configured ${network.label} address. Transaction cancelled.`);
      }

      const hash = await client.writeContract({
        account: activeAccount,
        chain: network.chain as any,
        address: network.factory,
        abi: FACTORY_ABI,
        functionName: "createToken",
        args: [name.trim(), symbol.trim().toUpperCase(), initial, cap, mintable, burnable],
      });
      setAccount(activeAccount);
      setTxHash(hash);
      setStatus("Deployment transaction submitted. Your wallet remains the only signer and CoinVigil never receives your private key.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Token deployment failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="studio-layout">
      <form className="card token-form" onSubmit={deploy}>
        <div className="eyebrow">TOKEN CONFIGURATION</div>
        <h2>Build an ERC-20 without writing code</h2>

        <label>
          Blockchain
          <select value={networkKey} onChange={(event) => setNetworkKey(event.target.value)}>
            {NETWORKS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
        </label>

        <div className="form-grid">
          <label>Token name<input value={name} maxLength={64} onChange={(event) => setName(event.target.value)} /></label>
          <label>Symbol<input value={symbol} maxLength={12} onChange={(event) => setSymbol(event.target.value.toUpperCase())} /></label>
          <label>Initial supply<input inputMode="decimal" value={initialSupply} onChange={(event) => setInitialSupply(event.target.value)} /></label>
          <label>Maximum supply<input inputMode="decimal" value={maxSupply} onChange={(event) => setMaxSupply(event.target.value)} /></label>
        </div>

        <div className="switch-row">
          <label><input type="checkbox" checked={mintable} onChange={(event) => setMintable(event.target.checked)} /> Owner may mint later</label>
          <label><input type="checkbox" checked={burnable} onChange={(event) => setBurnable(event.target.checked)} /> Holders may burn</label>
        </div>

        <div className="studio-actions">
          <button type="button" className="ghost" onClick={connectWallet}>{account ? "Wallet connected" : "Connect wallet"}</button>
          <button type="submit" disabled={busy}>{busy ? "Waiting for wallet…" : "Deploy token"}</button>
        </div>
        <p className="studio-status">{status}</p>
        {txHash ? <code className="tx-hash">Transaction: {txHash}</code> : null}
      </form>

      <aside className="card token-preview">
        <div className="eyebrow">LIVE PREVIEW</div>
        <div className="token-avatar">{symbol.slice(0, 3).toUpperCase() || "TOK"}</div>
        <h2>{name || "Untitled Token"}</h2>
        <p>{symbol.toUpperCase() || "TOKEN"} · 18 decimals</p>
        <dl>
          <div><dt>Network</dt><dd>{network.label}</dd></div>
          <div><dt>Initial supply</dt><dd>{initialSupply || "0"}</dd></div>
          <div><dt>Max supply</dt><dd>{maxSupply || "0"}</dd></div>
          <div><dt>Mintable</dt><dd>{mintable ? "Yes" : "No"}</dd></div>
          <div><dt>Burnable</dt><dd>{burnable ? "Yes" : "No"}</dd></div>
          <div><dt>Factory</dt><dd className={deploymentReady ? "positive" : "warning"}>{deploymentReady ? "Configured" : "Needs deployment"}</dd></div>
        </dl>
        <div className="safety-note">
          Deployment is non-custodial: the connected wallet signs the blockchain transaction. CoinVigil never asks for a seed phrase or private key.
        </div>
      </aside>
    </div>
  );
}
