/**
 * Shared T3 ADK client factory.
 * T3nClient requires wasmComponent loaded from the bundled WASM file.
 */
import path from "path";
import {
  loadWasmComponent,
  T3nClient,
  TenantClient,
  setEnvironment,
  getNodeUrl,
  createEthAuthInput,
  AuthMethod,
  metamask_sign,
  getScriptVersion,
} from "@terminal3/t3n-sdk";
import { Wallet } from "ethers";

export { AuthMethod, getScriptVersion, getNodeUrl };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any;

const WASM_PATH = path.join(
  process.cwd(),
  "node_modules/@terminal3/t3n-sdk/dist/wasm/generated/session.core.wasm"
);

export async function makeT3nClient(privateKey?: string) {
  setEnvironment("testnet");
  const nodeUrl = getNodeUrl();
  const wasm = await loadWasmComponent({ wasmPath: WASM_PATH });

  const handlers: AnyObj = {};

  if (privateKey) {
    const wallet = new Wallet(privateKey);
    // metamask_sign(address, logger, privateKey, apiKey)
    // API key provides credits; privateKey signs the SIWE challenge
    handlers.EthSign = metamask_sign(wallet.address, undefined, privateKey);
  }

  // API key passed as header — provides credits for T3 operations
  const apiKey = process.env.T3N_API_KEY;
  const client = new T3nClient({
    wasmComponent: wasm,
    handlers,
    ...(apiKey && { headers: { "x-api-key": apiKey } }),
  });
  await client.handshake();
  return { client, nodeUrl };
}

export async function authenticateWallet(client: AnyObj, privateKey: string) {
  const wallet = new Wallet(privateKey);
  const authInput = createEthAuthInput(wallet.address);
  const did = await client.authenticate(authInput);
  return { did, address: wallet.address };
}

export async function makeTenantClient(t3nClient: AnyObj, did: AnyObj) {
  setEnvironment("testnet");
  const nodeUrl = getNodeUrl();
  return new TenantClient({
    t3n: t3nClient,
    tenantDid: String(did),
    environment: "testnet",
    baseUrl: nodeUrl,
  } as AnyObj);
}

/** Write a KV entry into a tenant map. Bypasses writers ACL (control-plane write). */
export async function setMapEntry(
  tenant: AnyObj,
  mapTail: string,
  key: string,
  value: string
) {
  const mapName =
    typeof tenant.canonicalName === "function"
      ? tenant.canonicalName(mapTail)
      : mapTail;
  return (tenant as AnyObj).executeControl?.("map-entry-set", {
    map_name: mapName,
    key,
    value,
  });
}
