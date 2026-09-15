export const MAINNET_CHAIN_IDS = new Set([1n, 10n, 56n, 137n, 42161n, 43114n, 8453n]);

export function parseExpectedChainId(value) {
  if (!value || !/^\d+$/.test(value) || BigInt(value) <= 0n) {
    throw new Error("EXPECTED_CHAIN_ID must be a positive integer");
  }
  return BigInt(value);
}

export function assertExpectedNetwork(actualChainId, expectedChainId) {
  if (actualChainId !== expectedChainId) {
    throw new Error(`Refusing deployment: connected chain ${actualChainId} != expected ${expectedChainId}`);
  }
}

export function assertMainnetAllowed(chainId, allowMainnet) {
  if (MAINNET_CHAIN_IDS.has(chainId) && allowMainnet !== "YES") {
    throw new Error(
      `Refusing mainnet deployment on chain ${chainId}. Set ALLOW_MAINNET=YES only after reviewing gas, bytecode and configuration.`,
    );
  }
}
