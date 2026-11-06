import { createPublicClient, createWalletClient, custom, decodeAbiParameters, http, parseAbi, parseAbiParameters } from "viem";
import { sepolia, hardhat } from "viem/chains";
import { mnemonicToAccount } from "viem/accounts";
import gardenAbi from "./abi/SqueekGarden.json";
import mockCoreAbi from "./abi/MockSqueekCore.json";
import deployments from "./deployments.json";
import { t } from "./i18n.js";

export { gardenAbi, mockCoreAbi };

export const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

// Hardhat's public default mnemonic, account #1: the local playground signs with it against `hardhat node` only.
const HARDHAT_MNEMONIC = "test test test test test test test test test test test junk";
const API = "https://api.squeekchain.com/v1";

const params = new URLSearchParams(location.search);
// Local play exists only on the dev server (npm run web); a production build leaves it, and the test account, out.
export const isLocal = import.meta.env.DEV && params.get("net") === "local";
/** Local only: shows buttons that move the mock hamster by hand instead of mirroring the real one. */
export const isDev = isLocal && params.get("dev") === "1";

export const net = isLocal
  ? { key: "local", chain: hardhat, rpc: "http://127.0.0.1:8545", pollMs: 4000 }
  : { key: "sepolia", chain: sepolia, rpc: "https://ethereum-sepolia-rpc.publicnode.com", pollMs: 12000 };

export const deployment = deployments[net.key] ?? null;

export const publicClient = createPublicClient({ chain: net.chain, transport: http(net.rpc) });

/** For log searches that reach back further than a day: publicnode keeps only ~10,000 blocks of logs, Tenderly's
 *  public gateway keeps them all (but rate-limits plain reads, so those stay on publicClient). */
export const logsClient = isLocal
  ? publicClient
  : createPublicClient({ chain: net.chain, transport: http("https://sepolia.gateway.tenderly.co") });

// Set after a connect, so the next page load (or a reload after the wallet switches account) reconnects silently.
const WALLET_KEY = "squeek-garden:wallet";

/** Returns { account, walletClient } or throws with a message fit for the UI. */
export async function connectWallet() {
  if (isLocal) {
    const account = mnemonicToAccount(HARDHAT_MNEMONIC, { addressIndex: 1 });
    return { account: account.address, walletClient: createWalletClient({ account, chain: net.chain, transport: http(net.rpc) }) };
  }
  if (!window.ethereum) throw new Error(t("err.noWallet"));
  const [account] = await window.ethereum.request({ method: "eth_requestAccounts" });
  await ensureSepolia();
  try {
    localStorage.setItem(WALLET_KEY, "1");
  } catch {
    /* storage unavailable: the player connects again after a reload */
  }
  return { account, walletClient: createWalletClient({ account, chain: net.chain, transport: custom(window.ethereum) }) };
}

/** Reconnects a wallet this site was connected to before, without any prompt; null when that is not possible. */
export async function restoreWallet() {
  if (isLocal || !window.ethereum) return null;
  try {
    if (localStorage.getItem(WALLET_KEY) !== "1") return null;
  } catch {
    return null;
  }
  const [account] = await window.ethereum.request({ method: "eth_accounts" }).catch(() => []);
  const chainId = await window.ethereum.request({ method: "eth_chainId" }).catch(() => null);
  if (!account || parseInt(chainId, 16) !== sepolia.id) return null;
  return { account, walletClient: createWalletClient({ account, chain: net.chain, transport: custom(window.ethereum) }) };
}

async function ensureSepolia() {
  const chainId = await window.ethereum.request({ method: "eth_chainId" });
  if (parseInt(chainId, 16) === sepolia.id) return;
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0xaa36a7" }] });
  } catch (e) {
    if (e?.code !== 4902) throw e;
    // The wallet does not know Sepolia yet: offer to add it.
    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: "0xaa36a7",
          chainName: "Sepolia",
          nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
          rpcUrls: [net.rpc],
          blockExplorerUrls: ["https://sepolia.etherscan.io"],
        },
      ],
    });
  }
}

/** Calls handler("accounts", [address, ...]) or handler("chain", chainIdHex) when the wallet changes. */
export function onWalletChange(handler) {
  if (isLocal || !window.ethereum?.on) return;
  window.ethereum.on("accountsChanged", (accounts) => handler("accounts", accounts));
  window.ethereum.on("chainChanged", (chainId) => handler("chain", chainId));
}

/** Live wheel readings from the public Squeekchain API. Settled on-chain values lag these by 5-20 minutes. */
export async function fetchHamster() {
  const res = await fetch(`${API}/status`);
  if (!res.ok) throw new Error(`Squeekchain API ${res.status}`);
  const { measurement: m, builder } = await res.json();
  const status = m.coreStatus;
  const rpm = Number(m.rpmMilli ?? 0) / 1000;
  return {
    // coreStatus can still say IDLE while the wheel turns, so the measured rpm decides.
    running: m.freshness === "online" && (rpm >= 2 || status === "SPINNING" || status === "ACTIVE"),
    online: m.freshness === "online",
    rpm,
    kmh: (Number(m.speedMmPerSecond ?? 0) * 3.6) / 1000,
    todayKm: Number(m.distanceMm ?? 0) / 1e6,
    liveWork: BigInt(m.cumulativeWorkUnits ?? 0),
    liveBlock: BigInt(builder?.projected?.blockHeight ?? builder?.anchor?.blockHeight ?? 0),
    // Share of the next Squeekchain block already mined, 0..1 (the API reports 0..1e9).
    blockProgress: Number(builder?.projected?.blockProgress ?? builder?.anchor?.blockProgress ?? 0) / 1e9,
  };
}

/** When a SqueekCore's round 0 began, from its configuration(): the first fields are a config hash, then
 *  genesisTimestamp. Only those two words are decoded, so a longer config in a later core version still reads. */
export async function fetchCoreGenesis(core) {
  const { data } = await publicClient.call({ to: core, data: "0x6c70bee9" }); // configuration()
  const [, genesis] = decodeAbiParameters(parseAbiParameters("bytes32, uint256"), data);
  const ts = Number(genesis);
  if (!(ts > 1.7e9 && ts < Date.now() / 1000)) throw new Error("unexpected genesisTimestamp");
  return ts;
}

/** The current Squeek collection and the block its install started at, from the Squeekchain API, so a testnet
 *  reinstall needs no site change. Older API versions listed it under identities.genesis. */
export async function fetchSqueekCollection() {
  const res = await fetch(`${API}/economy/state`);
  if (!res.ok) throw new Error(`Squeekchain API ${res.status}`);
  const j = await res.json();
  const address = j.deployment?.components?.collection?.address ?? j.identities?.genesis;
  if (!address) throw new Error("no collection in the Squeekchain API");
  return { address, fromBlock: BigInt(j.chain?.deploymentBlock ?? 0) };
}

/** Average work on the nights the hamster ran during the last 7 days. */
export async function fetchTypicalNight() {
  const res = await fetch(`${API}/measurement/stats?range=7d`);
  if (!res.ok) throw new Error(`Squeekchain API ${res.status}`);
  const days = (await res.json()).activity?.days ?? [];
  const active = days.map((d) => Number(d.observedWorkUnits ?? 0)).filter((w) => w > 0);
  return active.length ? active.reduce((a, b) => a + b, 0) / active.length : 0;
}
