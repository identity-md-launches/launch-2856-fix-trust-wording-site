import { parseAbi, parseAbiItem, BaseError, ContractFunctionRevertedError } from "viem";
import { gardenAbi, deployment, publicClient, logsClient, connectWallet, isLocal, fetchSqueekCollection } from "./chain.js";
import { plantArt, signArt, textures } from "./art.js";
import { initNav } from "./nav.js";
import { t } from "./i18n.js";

initNav();
{
  const tex = textures();
  document.documentElement.style.setProperty("--px-grass", `url(${tex.grass})`);
  document.documentElement.style.setProperty("--px-bed", `url(${tex.bed})`);
}

const $ = (id) => document.getElementById(id);
const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const nftAbi = parseAbi(["function ownerOf(uint256) view returns (address)"]);
const transferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)");
const CROPS = ["Sunflower", "Pumpkin", "Block Broccoli", "Timothy Hay", "Golden Carrot", "Sunflower", "Nap Chamomile", "Pumpkin", "Timothy Hay"];
const SUPPLY = 1000;

// collection: the Squeek NFT contract the garden uses now (its squeekNft()); null while holder plots are off.
// squeekchain: Squeekchain's current collection from its API ({ address, fromBlock }), or the deployment's if the API
// is down; it survives a testnet reinstall without a site change.
const state = { nftOn: false, collection: null, squeekchain: null, account: null, walletClient: null };
const launchCollection = () =>
  deployment?.squeekNft ? { address: deployment.squeekNft, fromBlock: BigInt(deployment.squeekNftFromBlock ?? 0) } : null;
const read = (functionName, args) => publicClient.readContract({ address: deployment.garden, abi: gardenAbi, functionName, args });

$("mint-left").innerHTML = t("mint.left", { n: SUPPLY.toLocaleString("en-US"), total: SUPPLY.toLocaleString("en-US") });

function drawPlots(open) {
  const tiles = CROPS.map((name) => `<span class="nft-tile">${plantArt(name, 100, {})}</span>`);
  for (let i = 0; i < 3; i++) {
    tiles.push(`<span class="nft-tile holder ${open ? "open" : ""}">${open ? plantArt("Hamster Berry", 100, {}) : signArt()}<small>${10 + i}</small></span>`);
  }
  $("nft-plots").innerHTML = tiles.join("");
}

function setBindEnabled(on) {
  $("bind-find").disabled = !on;
  for (const el of $("bind-manual").elements) el.disabled = !on;
}

async function loadStatus() {
  if (!deployment) {
    $("nft-status").textContent = t("status.notDeployed");
    drawPlots(false);
    setBindEnabled(false);
    return;
  }
  try {
    const collection = await read("squeekNft");
    state.nftOn = BigInt(collection) !== 0n;
    state.collection = state.nftOn ? collection : null;
    const pill = $("nft-status");
    pill.textContent = state.nftOn ? t("status.open") : t("status.soon");
    pill.classList.add(state.nftOn ? "on" : "soon");
    $("nft-status-text").textContent = state.nftOn ? t("status.openText") : t("status.soonText");
    drawPlots(state.nftOn);
  } catch {
    $("nft-status").textContent = t("status.unreachable");
    drawPlots(false);
  }
  setBindEnabled(state.nftOn);
  if (!state.nftOn) $("bind-status").textContent = t("bind.off");
  if (!isLocal) state.squeekchain = await fetchSqueekCollection().catch(launchCollection);
  const shown = state.collection ?? state.squeekchain?.address ?? deployment.squeekNft;
  if (shown && !isLocal) {
    const link = `<a href="https://sepolia.etherscan.io/address/${shown}" target="_blank" rel="noopener">${short(shown)}</a>`;
    $("nft-collection").innerHTML = t("know.collectionLink", { link });
  }
}

async function ensureWallet() {
  if (!state.account) Object.assign(state, await connectWallet());
  return state.account;
}

/** The player's current binding, shown above the list. */
async function showBinding() {
  const [nft, tokenId] = await read("boundSqueekOf", [state.account]);
  const collection = await read("squeekNft");
  if (BigInt(nft) === 0n || nft.toLowerCase() !== collection.toLowerCase()) return null;
  const [garden] = await read("squeekBinding", [nft, tokenId]);
  if (garden.toLowerCase() !== state.account.toLowerCase()) return null;
  const here = await read("hasSqueek", [state.account]);
  $("bind-status").textContent = here ? t("bind.current", { id: tokenId }) : t("bind.away", { id: tokenId });
  return tokenId;
}

/** First block worth scanning for a collection's transfers. The launch collection's is known; for one the owner
 *  switched to later (setSqueekNft), it is the block the contract appeared in, found once by a binary search on its
 *  code (the log gateway keeps full history) and remembered in this browser. */
async function collectionStart(collection) {
  for (const known of [state.squeekchain, launchCollection()]) {
    if (known && collection.toLowerCase() === known.address.toLowerCase()) return known.fromBlock;
  }
  const key = `squeek-garden:nft-start:${collection.toLowerCase()}`;
  try {
    const saved = localStorage.getItem(key);
    if (saved) return BigInt(saved);
  } catch {}
  let lo = 0n;
  let hi = await logsClient.getBlockNumber();
  try {
    while (lo < hi) {
      const mid = (lo + hi) / 2n;
      const code = await logsClient.getCode({ address: collection, blockNumber: mid });
      if (code && code !== "0x") hi = mid;
      else lo = mid + 1n;
    }
  } catch {
    return BigInt(deployment.deployBlock ?? 0); // no history: at least everything since the garden went live
  }
  try {
    localStorage.setItem(key, String(lo));
  } catch {}
  return lo;
}

/** Squeeks in the wallet: the collection is not enumerable, so look at transfers into it and keep the ones still held.
 *  Scans from the collection's first block in 45,000-block chunks (RPCs cap a log query at 50,000) and skips any
 *  chunk the node refuses; the manual number input covers what the scan misses. */
async function findSqueeks(account) {
  const collection = state.collection;
  if (!collection) return [];
  const LOG_SPAN = 45_000n;
  const latest = await publicClient.getBlockNumber();
  const chunks = [];
  for (let from = await collectionStart(collection); from <= latest; from += LOG_SPAN) {
    const to = from + LOG_SPAN - 1n < latest ? from + LOG_SPAN - 1n : latest;
    chunks.push(
      logsClient
        .getLogs({ address: collection, event: transferEvent, args: { to: account }, fromBlock: from, toBlock: to })
        .catch(() => []),
    );
  }
  const logs = (await Promise.all(chunks)).flat();
  const ids = [...new Set(logs.map((l) => l.args.tokenId))];
  const owners = await Promise.all(
    ids.map((id) => publicClient.readContract({ address: collection, abi: nftAbi, functionName: "ownerOf", args: [id] }).catch(() => null)),
  );
  return ids.filter((_, k) => owners[k]?.toLowerCase() === account.toLowerCase()).sort((a, b) => (a < b ? -1 : 1));
}

function explain(e) {
  if (e instanceof BaseError) {
    const revert = e.walk((err) => err instanceof ContractFunctionRevertedError);
    const name = revert?.data?.errorName;
    if (name === "SqueekMoveCooldown") {
      const [id, readyAt] = revert.data.args;
      return t("bind.cooldown", { id, date: new Date(Number(readyAt) * 1000).toLocaleString() });
    }
    if (name) return t(`err.${name}`);
    if (/rejected|denied/i.test(e.shortMessage ?? "")) return t("err.cancelled");
    return e.shortMessage;
  }
  return e.message;
}

async function bind(id) {
  const out = $("bind-result");
  out.className = "nft-result";
  out.textContent = t("bind.busy", { id });
  try {
    await ensureWallet();
    const { request } = await publicClient.simulateContract({
      address: deployment.garden,
      abi: gardenAbi,
      functionName: "bindSqueek",
      args: [BigInt(id)],
      account: state.account,
    });
    const hash = await state.walletClient.writeContract(request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error("Transaction reverted");
    out.textContent = t("bind.done", { id });
    out.classList.add("good");
    boundId = await showBinding();
    renderList(await findSqueeks(state.account).catch(() => []));
  } catch (e) {
    out.textContent = t("bind.fail", { reason: explain(e) });
  }
}

let boundId = null;
function renderList(ids) {
  $("bind-list").innerHTML = ids.length
    ? `<p>${t("bind.found", { who: short(state.account) })}</p><div class="row">${ids
        .map((id) => `<button type="button" class="${id === boundId ? "on" : ""}" data-bind="${id}" ${id === boundId ? "disabled" : ""}>${t("bind.button", { id })}</button>`)
        .join("")}</div>`
    : `<p class="hint">${t("bind.none", { who: short(state.account) })}</p>`;
}

$("bind-find").addEventListener("click", async () => {
  const out = $("bind-result");
  out.className = "nft-result";
  if (!deployment?.squeekNft) return (out.textContent = t("bind.noCollection"));
  out.textContent = t("bind.searching");
  try {
    await ensureWallet();
    boundId = await showBinding();
    renderList(await findSqueeks(state.account).catch(() => []));
    out.textContent = "";
  } catch (e) {
    out.textContent = explain(e);
  }
});

$("bind-list").addEventListener("click", (ev) => {
  const btn = ev.target.closest("[data-bind]");
  if (btn) bind(btn.dataset.bind);
});

$("bind-manual").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const id = new FormData(ev.target).get("id")?.toString().trim();
  if (/^\d+$/.test(id ?? "")) bind(id);
});

loadStatus();
