import { formatUnits, BaseError, ContractFunctionRevertedError, keccak256, toBytes, isAddress, getAddress } from "viem";
import {
  gardenAbi,
  mockCoreAbi,
  erc20Abi,
  isLocal,
  isDev,
  net,
  deployment,
  publicClient,
  connectWallet,
  restoreWallet,
  onWalletChange,
  fetchHamster,
  fetchTypicalNight,
  fetchCoreGenesis,
} from "./chain.js";
import { plantArt, seedArt, hamsterArt, pantryArt, signArt, textures, SEED_COLOR } from "./art.js";
import { sfx, buzz, isMuted, setMuted } from "./sfx.js";
import { burst, waterDrops, plantSeed, flyTo, floatFrom, squish, shake, tickNumber } from "./fx.js";
import { initNav } from "./nav.js";
import { t, tp, seedName } from "./i18n.js";
import { levelFor, pointsForLevel } from "./levels.js";

initNav();

const BASE_PLOTS = 9;
const MAX_PLOTS = 12;
const MAX_WATERINGS = 3;
const LIVE_STREAM_URL = "https://x.com/squeekchain"; // Squeekchain goes live on X while the hamster runs
const WATER_COOLDOWN = 3600;
const MAX_HELPS = 3;
const WATER_BONUS = 10n;
const HELP_BONUS = 5n;
// Rough conversions for players, from Oct 2026 Sepolia data.
const WORK_PER_KM = 1140;
const WORK_PER_BLOCK = 11;
const ROUND_SECONDS = 600;
// Fallback for the live round estimate; the real value is read from the garden's SqueekCore (configuration()).
const GENESIS_TS = 1793735400;

const MODE = [
  { key: "work", icon: "⚙️", label: t("mode.0") },
  { key: "blocks", icon: "🧱", label: t("mode.1") },
  { key: "nap", icon: "💤", label: t("mode.2") },
];

const state = {
  seeds: [],
  readings: null, // { work, blockHeight, settledRound }
  coreMap: null, // { base, carried } from coreMapping(): how raw SqueekCore counters become garden readings
  core: deployment?.squeekCore, // read from the garden once loaded
  genesisTs: GENESIS_TS, // round 0 of that core, read from it whenever the garden moves to another core
  genesisFor: null,
  sqkToken: deployment?.sqk,
  recentWork: 0n,
  pantry: 0n,
  account: null,
  walletClient: null,
  nickname: "",
  stats: { points: 0n, harvests: 0, rareHarvests: 0, helps: 0 },
  level: 0, // from the points; 0 until the player's stats first load
  plots: [],
  plotCount: BASE_PLOTS,
  sqkBalance: 0n,
  plantedToday: {}, // seedId -> plantings today, for seeds with a daily limit
  nftOn: false, // whether the garden has Squeek holder plots switched on
  hamster: null,
  typicalNight: 0,
  players: [],
  feed: [],
  boardTab: "points",
  visit: null, // { owner, name, plots, plotCount }
  pending: new Map(), // plot index -> { kind, seedId }
  selectedSeed: 1,
  selectedPlot: 0,
  tipPlot: null,
  nameDismissed: false,
  referrer: null, // who invited this player (zero address when nobody)
  invite: null, // { owner, name } from a ?ref= link, while it can still be accepted
  inviteDismissed: false,
};

// An invite link (?ref=nickname or address) is kept until it is accepted or declined, even across pages.
const REF_KEY = "squeek-garden:ref";
{
  const ref = new URLSearchParams(location.search).get("ref");
  try {
    if (ref) localStorage.setItem(REF_KEY, ref);
  } catch {
    /* storage unavailable: the invite only lasts for this visit */
  }
}
function storedRef() {
  try {
    return localStorage.getItem(REF_KEY) ?? new URLSearchParams(location.search).get("ref");
  } catch {
    return new URLSearchParams(location.search).get("ref");
  }
}
function forgetRef() {
  try {
    localStorage.removeItem(REF_KEY);
  } catch {
    /* nothing stored */
  }
}

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const sqk = (v) => Number(formatUnits(v, 18)).toLocaleString("en-US", { maximumFractionDigits: 2 });
const fmt = (n) => Number(n).toLocaleString("en-US");
const km = (work) => (Number(work) / WORK_PER_KM).toFixed(1);
const today = () => Math.floor(Date.now() / 86_400_000);
const isNightUtc = () => {
  const h = new Date().getUTCHours();
  return h >= 18 || h < 6;
};
const me = () => state.account?.toLowerCase();
const nameOf = (addr) => {
  const p = state.players.find((x) => x.player.toLowerCase() === addr.toLowerCase());
  return p?.nickname || short(addr);
};
const plotEl = (i) => document.querySelector(`.plot[data-plot="${i}"]`);

// ------------------------------------------------------------------ game maths (mirrors the contract)

const projections = () => !isDev && state.hamster && state.readings;

/** The live API counters in garden terms: after the owner moves the garden to a new SqueekCore, garden readings are
 *  carried + (counter - base), as the contract's coreMapping() says. Before any move the two are the same. */
function liveReadings() {
  const h = state.hamster;
  if (!h) return null;
  const m = state.coreMap;
  const map = (raw, key) => (m ? m.carried[key] + (raw > m.base[key] ? raw - m.base[key] : 0n) : raw);
  const nowRound = BigInt(Math.max(0, Math.floor((Date.now() / 1000 - state.genesisTs) / ROUND_SECONDS) - 1));
  return { ...h, liveWork: map(h.liveWork, "work"), liveBlock: map(h.liveBlock, "blockHeight"), liveRound: map(nowRound, "settledRound") };
}

function progressOf(seed, plot, readings, live) {
  const r = readings;
  const workDone = r.work > plot.plantedWork ? r.work - plot.plantedWork : 0n;
  let progress;
  let liveProgress;
  let wilted = false;
  let liveWilted = false;
  const liveWork = live?.liveWork > r.work ? live.liveWork : r.work;
  const liveWorkDone = liveWork > plot.plantedWork ? liveWork - plot.plantedWork : 0n;
  if (seed.mode === 0) {
    progress = workDone;
    liveProgress = liveWorkDone;
  } else if (seed.mode === 1) {
    progress = r.blockHeight > plot.plantedBlock ? r.blockHeight - plot.plantedBlock : 0n;
    const lb = live?.liveBlock > r.blockHeight ? live.liveBlock : r.blockHeight;
    liveProgress = lb > plot.plantedBlock ? lb - plot.plantedBlock : 0n;
  } else {
    progress = r.settledRound > plot.plantedRound ? r.settledRound - plot.plantedRound : 0n;
    const lr = live?.liveRound > r.settledRound ? live.liveRound : r.settledRound;
    liveProgress = lr > plot.plantedRound ? lr - plot.plantedRound : 0n;
    wilted = workDone > seed.napWorkLimit;
    liveWilted = liveWorkDone > seed.napWorkLimit;
  }
  return { progress, liveProgress, wilted, liveWilted, workDone, liveWorkDone };
}

/** Everything the UI needs about one plot of the garden being shown (yours or a neighbour's). */
function plotView(i) {
  const visiting = Boolean(state.visit);
  const plots = visiting ? state.visit.plots : state.plots;
  const count = visiting ? state.visit.plotCount : state.plotCount;
  const locked = i >= count;
  const pending = visiting ? null : state.pending.get(i);
  let plot = plots[i];

  if (pending?.kind === "plant") {
    const r = state.readings;
    plot = { seedId: pending.seedId, plantedWork: r.work, plantedBlock: r.blockHeight, plantedRound: r.settledRound, waterings: 0, lastWateredAt: 0n, helps: 0, lastHelpDay: 0 };
  }
  if (pending?.kind === "harvest" || pending?.kind === "uproot") plot = null;
  if (!plot || plot.seedId === 0 || !state.readings) return { i, empty: true, locked, pending, visiting };

  const seed = state.seeds[plot.seedId - 1];
  const live = projections() ? liveReadings() : null;
  const g = progressOf(seed, plot, state.readings, live);
  const needed = seed.growAmount;
  const waterings = plot.waterings + (pending?.kind === "water" ? 1 : 0);
  const ripe = !g.wilted && g.progress >= needed;
  const overripe = ripe && g.progress >= needed * 2n;
  let value = (BigInt(seed.basePoints) * (100n + WATER_BONUS * BigInt(waterings) + HELP_BONUS * BigInt(plot.helps))) / 100n;
  const maxValue = value;
  if (overripe) value /= 2n;
  const pct = Math.min(100, Number((g.progress * 100n) / needed));
  const livePct = Math.min(100, Number((g.liveProgress * 100n) / needed));
  // Two-decimal growth including the live wheel, so every block or bit of running shows up. Broccoli also counts the
  // share of the block being mined right now.
  const best = g.liveProgress > g.progress ? g.liveProgress : g.progress;
  const mining = seed.mode === 1 && live && live.liveBlock >= plot.plantedBlock ? live.blockProgress : 0;
  const exactPct = Math.min(100, (Number(best) + mining) / Number(needed) * 100);
  const waterReadyAt = plot.lastWateredAt === 0n ? 0 : Number(plot.lastWateredAt) + WATER_COOLDOWN;
  const freshBlocked = seed.needsFreshRun && state.recentWork === 0n;
  return {
    i,
    seed,
    plot,
    locked,
    pending,
    visiting,
    ...g,
    needed,
    ripe,
    overripe,
    value,
    maxValue,
    pct,
    livePct,
    exactPct,
    waterings,
    waterReadyAt,
    freshBlocked,
    canHarvest: !visiting && ripe && !freshBlocked,
    canWater: !visiting && !g.wilted && waterings < MAX_WATERINGS && Date.now() / 1000 >= waterReadyAt,
    canHelp: visiting && Boolean(state.account) && !g.wilted && plot.helps < MAX_HELPS && plot.lastHelpDay !== today(),
  };
}

function remainingText(v) {
  if (v.wilted) return t("remaining.wilted");
  if (v.ripe) {
    if (v.freshBlocked) return t("remaining.freshRipe");
    return v.overripe ? t("remaining.overripe") : t("remaining.ripe", { points: v.value });
  }
  const left = v.needed - (v.liveProgress > v.progress ? v.liveProgress : v.progress);
  if (left <= 0n) return t("remaining.liveRipe");
  const night = state.typicalNight;
  if (v.seed.mode === 0) {
    const when = night > 0 ? (Number(left) <= night ? t("remaining.nextRun") : tp("remaining.runsAway", Math.ceil(Number(left) / night))) : "";
    return when ? t("remaining.workWhen", { km: km(left), when }) : t("remaining.work", { km: km(left) });
  }
  if (v.seed.mode === 1) return t("remaining.blocks", { n: fmt(left), km: km(Number(left) * WORK_PER_BLOCK) });
  const hours = (Number(left) * ROUND_SECONDS) / 3600;
  const budget = v.seed.napWorkLimit > v.workDone ? v.seed.napWorkLimit - v.workDone : 0n;
  return t("remaining.nap", { h: hours.toFixed(1), m: ((Number(budget) / WORK_PER_KM) * 1000).toFixed(0) });
}

/** Plantings of a seed still allowed today (UTC), counting ones waiting for the chain; Infinity without a limit. */
function plantsLeft(seedId) {
  const s = state.seeds[seedId - 1];
  if (!s?.dailyLimit) return Infinity;
  const waiting = [...state.pending.values()].filter((p) => p.kind === "plant" && p.seedId === seedId).length;
  return Math.max(0, s.dailyLimit - (state.plantedToday[seedId] ?? 0) - waiting);
}

function seedRequirement(s) {
  if (s.mode === 0) return t("req.work", { km: km(s.growAmount) });
  if (s.mode === 1) return t("req.blocks", { n: fmt(s.growAmount) });
  return t("req.nap", { h: ((Number(s.growAmount) * ROUND_SECONDS) / 3600).toFixed(0) });
}

// ------------------------------------------------------------------ data loading

const garden = () => ({ address: deployment.garden, abi: gardenAbi });
const read = (functionName, args) => publicClient.readContract({ ...garden(), functionName, args });

async function loadCore() {
  const [seeds, [readings, recentWork], pantry, squeekNft, [base, carried], core, sqkToken] = await Promise.all([
    state.seeds.length ? state.seeds : read("seeds"),
    read("readings"),
    read("pantrySnacks"),
    read("squeekNft"),
    read("coreMapping"),
    read("core"),
    read("sqk"),
  ]);
  state.coreMap = { base, carried };
  state.core = core; // the owner can move the garden to a new SqueekCore or SQK after a Squeekchain reinstall
  if (state.genesisFor !== core && !isLocal) {
    state.genesisFor = core;
    fetchCoreGenesis(core)
      .then((ts) => (state.genesisTs = ts))
      .catch(() => (state.genesisFor = null)); // keep the fallback and try again on the next load
  }
  state.sqkToken = sqkToken;
  state.nftOn = BigInt(squeekNft) !== 0n;
  const prevPantry = state.pantry;
  if (state.readings && readings.work > state.readings.work) {
    state.celebrate = { ...state.celebrate, work: readings.work - state.readings.work };
  }
  state.seeds = seeds;
  state.readings = readings;
  state.recentWork = recentWork;
  state.pantry = pantry;
  for (const [i, s] of seeds.entries()) {
    if (s.unlockSnacks > 0 && prevPantry > 0n && prevPantry < BigInt(s.unlockSnacks) && pantry >= BigInt(s.unlockSnacks)) {
      sfx.fanfare();
      toast(t("toast.unlocked", { seed: seedName(s.name), n: fmt(s.unlockSnacks) }), "ok");
      state.selectedSeed = i + 1;
    }
  }
}

async function loadMine() {
  if (!state.account) return;
  const [plots, stats, nickname, plotCount, sqkBalance, referrer] = await Promise.all([
    read("garden", [state.account]),
    read("stats", [state.account]),
    read("nicknameOf", [state.account]),
    read("plotCount", [state.account]),
    publicClient.readContract({ address: state.sqkToken, abi: erc20Abi, functionName: "balanceOf", args: [state.account] }),
    read("referrerOf", [state.account]),
  ]);
  state.referrer = BigInt(referrer) === 0n ? null : referrer;
  const limited = state.seeds.map((s, i) => ({ s, id: i + 1 })).filter(({ s }) => s.dailyLimit > 0);
  const counts = await Promise.all(limited.map(({ id }) => read("plantedToday", [state.account, id])));
  state.plantedToday = Object.fromEntries(limited.map(({ id }, k) => [id, Number(counts[k])]));
  const prevPoints = state.stats.points;
  state.plots = plots;
  state.stats = { points: stats[0], harvests: stats[1], rareHarvests: stats[2], helps: stats[3], referrals: stats[4], referralPoints: stats[5] };
  await loadInvite();
  state.nickname = nickname;
  state.plotCount = plotCount;
  state.sqkBalance = sqkBalance;
  if (state.stats.points !== prevPoints) state.pointsChanged = [prevPoints, state.stats.points];
  const level = levelFor(state.stats.points);
  if (state.level && level > state.level) levelUp(state.level, level);
  state.level = level;
}

const myLevel = () => levelFor(state.stats.points);

/** Cheers a level up and picks the seed it opened, if any. */
function levelUp(from, to) {
  const opened = state.seeds.map((s, i) => ({ s, id: i + 1 })).filter(({ s }) => s.active && s.level > from && s.level <= to);
  const seed = opened.at(-1);
  sfx.fanfare();
  toast(seed ? t("toast.levelUpSeed", { n: to, seed: seedName(seed.s.name) }) : t("toast.levelUp", { n: to }), "ok");
  if (seed && BigInt(seed.s.unlockSnacks) <= state.pantry) state.selectedSeed = seed.id;
}

/** Resolves a pending invite link to a gardener, if this player can still accept it. */
async function loadInvite() {
  const ref = storedRef();
  state.invite = null;
  if (!ref || state.referrer || state.stats.harvests > 0) return;
  let owner = isAddress(ref) ? getAddress(ref) : await read("nicknameOwner", [keccak256(toBytes(ref.toLowerCase()))]);
  if (BigInt(owner) === 0n || owner.toLowerCase() === me()) return;
  if (!(await read("isPlayer", [owner]))) return;
  const nick = await read("nicknameOf", [owner]);
  state.invite = { owner, name: nick || short(owner) };
}

async function acceptInvite() {
  const inv = state.invite;
  if (!inv) return;
  try {
    await send(t("tx.referrer", { name: inv.name }), call("setReferrer", [inv.owner]));
    forgetRef();
    sfx.fanfare();
    toast(t("invited.done", { name: inv.name }), "ok");
  } catch {
    /* toast already shown */
  }
  await refresh();
}

async function loadVisit() {
  if (!state.visit) return;
  const [plots, plotCount] = await Promise.all([read("garden", [state.visit.owner]), read("plotCount", [state.visit.owner])]);
  state.visit.plots = plots;
  state.visit.plotCount = plotCount;
}

async function loadPlayers() {
  const all = [];
  for (let offset = 0; ; offset += 200) {
    const page = await read("playersPage", [BigInt(offset), 200n]);
    all.push(...page);
    if (page.length < 200) break;
  }
  state.players = all;
}

const blockTimes = new Map();

async function loadFeed() {
  const latest = await publicClient.getBlockNumber();
  const from = BigInt(deployment.deployBlock);
  const fromBlock = latest - from > 9000n ? latest - 9000n : from;
  const logs = await publicClient.getContractEvents({ ...garden(), fromBlock });
  const wanted = logs.filter((l) => ["Planted", "Harvested", "Helped", "NicknameSet", "ReferrerSet"].includes(l.eventName)).slice(-24).reverse();
  await Promise.all(
    [...new Set(wanted.map((l) => l.blockNumber))]
      .filter((b) => !blockTimes.has(b))
      .map(async (b) => blockTimes.set(b, Number((await publicClient.getBlock({ blockNumber: b })).timestamp))),
  );
  state.feed = wanted;
}

async function loadHamster() {
  try {
    const prevBlock = state.hamster?.liveBlock;
    state.hamster = await fetchHamster();
    if (prevBlock && state.hamster.liveBlock > prevBlock) {
      state.celebrate = { ...state.celebrate, blocks: Number(state.hamster.liveBlock - prevBlock) };
    }
  } catch {
    state.hamster = null;
  }
}

/** Plays the effects for a newly mined block or newly settled wheel work, once the page shows the new numbers. */
function celebrate() {
  const c = state.celebrate;
  state.celebrate = null;
  if (!c) return;
  if (c.blocks) {
    sfx.block();
    const hud = document.querySelector(".hud-block");
    if (hud) {
      hud.classList.remove("pop");
      void hud.offsetWidth;
      hud.classList.add("pop");
      floatFrom(hud, tp("fx.blocks", c.blocks), "gold");
    }
    const wheel = document.querySelector(".scene-hamster, .wheel-wrap");
    if (wheel) {
      const r = wheel.getBoundingClientRect();
      burst(r.left + r.width / 2, r.top + r.height * 0.35, { count: 18, colors: ["#ffd04a", "#fff6c4", "#f2b01e"], size: [4, 8], spread: 70, up: 70, gravity: 40, shape: "star" });
    }
  }
  if (c.work) {
    floatFrom(document.querySelector(".hud-work"), t("fx.work", { n: fmt(c.work) }));
    const field = $("field");
    field.classList.remove("grew");
    void field.offsetWidth;
    field.classList.add("grew");
    setTimeout(() => field.classList.remove("grew"), 900);
  }
}

let lastTypical = 0;
async function loadTypicalNight() {
  if (Date.now() - lastTypical < 300_000) return;
  lastTypical = Date.now();
  state.typicalNight = await fetchTypicalNight().catch(() => state.typicalNight);
}

let slowTick = 0;
async function refresh() {
  if (!deployment) {
    // No garden on this network yet; the wheel is still worth showing live.
    await loadHamster();
    return render();
  }
  try {
    await Promise.all([loadCore(), loadMine(), loadVisit(), loadHamster(), loadTypicalNight()]);
    if (slowTick++ % 3 === 0 || !state.players.length) await Promise.all([loadPlayers(), loadFeed()]).catch((e) => console.warn(e));
  } catch (e) {
    console.error(e);
    toast(t("toast.readFail", { msg: e.shortMessage ?? e.message }), "error");
  }
  render();
  celebrate();
}

// ------------------------------------------------------------------ transactions

let queue = Promise.resolve();
const pendingTx = { count: 0 };

/** Transactions run one after another so the wallet never sees two nonces at once; animations do not wait. */
function send(label, request) {
  pendingTx.count++;
  renderBusy();
  const job = queue.then(async () => {
    const { request: simulated } = await publicClient.simulateContract({ ...request, account: state.account });
    const hash = await state.walletClient.writeContract(simulated);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error("Transaction reverted");
    return receipt;
  });
  queue = job.catch(() => {});
  return job
    .catch((e) => {
      toast(t("toast.txFailed", { label, reason: explain(e) }), "error");
      sfx.error();
      throw e;
    })
    .finally(() => {
      pendingTx.count--;
      renderBusy();
    });
}

// Contract errors with a player-friendly text (err.<Name> in the locales).
const ERROR_TEXT = [
  "PlotOccupied",
  "PlotEmpty",
  "NotRipe",
  "Wilted",
  "NeedsFreshRun",
  "NeedsSqueek",
  "SeedLocked",
  "LevelTooLow",
  "SeedDailyLimit",
  "TooManyWaterings",
  "WaterCooldown",
  "HelpLimit",
  "HelperDailyLimit",
  "OwnGarden",
  "BadNickname",
  "NicknameTaken",
  "SeedInactive",
  "HolderPlotsOff",
  "NotSqueekOwner",
  "SqueekMoveCooldown",
  "BadReferrer",
  "ReferrerAlreadySet",
  "ReferrerTooLate",
  "ERC20InsufficientBalance",
  "ERC20InsufficientAllowance",
];

function explain(e) {
  if (e instanceof BaseError) {
    const revert = e.walk((err) => err instanceof ContractFunctionRevertedError);
    const name = revert?.data?.errorName;
    if (name) return ERROR_TEXT.includes(name) ? t(`err.${name}`) : name;
    if (/rejected|denied/i.test(e.shortMessage ?? "")) return t("err.cancelled");
    return e.shortMessage;
  }
  return e.message;
}

const call = (functionName, args) => ({ ...garden(), functionName, args });

/** Runs an optimistic action: marks plots pending, plays the effect, sends the transaction, rolls back on failure. */
async function act(indices, kind, label, request, extra = {}) {
  for (const i of indices) state.pending.set(i, { kind, ...extra });
  renderGarden();
  renderTip();
  try {
    await send(label, request);
  } catch {
    for (const i of indices) shake(plotEl(i));
  } finally {
    for (const i of indices) state.pending.delete(i);
    await refresh();
  }
}

async function plant(indices) {
  const seedId = state.selectedSeed;
  const seed = state.seeds[seedId - 1];
  if (!seed) return;
  if (seed.level > myLevel()) {
    sfx.error();
    return toast(t("toast.levelLocked", { seed: seedName(seed.name), n: seed.level }), "error");
  }
  if (BigInt(seed.unlockSnacks) > state.pantry) {
    sfx.error();
    return toast(t("toast.seedLocked", { seed: seedName(seed.name), n: fmt(seed.unlockSnacks) }), "error");
  }
  const left = plantsLeft(seedId);
  if (left === 0) {
    sfx.error();
    return toast(t("toast.dailyDone", { seed: seedName(seed.name), limit: seed.dailyLimit }), "error");
  }
  if (indices.length > left) {
    indices = indices.slice(0, left);
    toast(t("toast.dailyTrim", { seed: seedName(seed.name), limit: seed.dailyLimit, n: left }));
  }
  const cost = seed.price * BigInt(indices.length);
  if (cost > 0n) {
    if (state.sqkBalance < cost) {
      sfx.error();
      return toast(t("toast.needSqk", { amount: sqk(cost) }), "error");
    }
    const allowance = await publicClient.readContract({ address: state.sqkToken, abi: erc20Abi, functionName: "allowance", args: [state.account, deployment.garden] });
    if (allowance < cost) {
      toast(t("toast.approveFirst", { amount: sqk(cost) }));
      try {
        await send(t("tx.approve", { amount: sqk(cost) }), { address: state.sqkToken, abi: erc20Abi, functionName: "approve", args: [deployment.garden, cost] });
      } catch {
        return;
      }
    }
  }
  sfx.plant();
  buzz(15);
  for (const i of indices) {
    const el = plotEl(i);
    if (el) plantSeed(el.getBoundingClientRect(), seedArt(seed.name));
  }
  setTimeout(() => indices.forEach((i) => squish(plotEl(i))), 450);
  const request = indices.length === 1 ? call("plant", [indices[0], seedId]) : call("plantMany", [indices, seedId]);
  await act(indices, "plant", t("tx.plant", { seed: seedName(seed.name) }), request, { seedId });
}

async function water(indices) {
  sfx.water();
  buzz(10);
  indices.forEach((i, k) => setTimeout(() => plotEl(i) && waterDrops(plotEl(i).getBoundingClientRect()), k * 120));
  const request = indices.length === 1 ? call("water", [indices[0]]) : call("waterMany", [indices]);
  await act(indices, "water", indices.length === 1 ? t("tx.water") : t("tx.waterN", { n: indices.length }), request);
}

async function harvest(indices) {
  const views = indices.map(plotView);
  sfx.harvest();
  buzz(25);
  const jar = document.querySelector(".pantry-jar");
  views.forEach((v, k) =>
    setTimeout(() => {
      const el = plotEl(v.i);
      if (!el) return;
      floatFrom(el, `+${v.value}`, "gold");
      flyTo(el.getBoundingClientRect(), jar, seedArt(v.seed.name));
    }, k * 140),
  );
  const request = indices.length === 1 ? call("harvest", [indices[0]]) : call("harvestMany", [indices]);
  await act(indices, "harvest", indices.length === 1 ? t("tx.harvest", { seed: seedName(views[0].seed.name) }) : t("tx.harvestN", { n: indices.length }), request);
}

async function uproot(i) {
  const v = plotView(i);
  if (!v.wilted && !confirm(t("confirm.uproot", { seed: seedName(v.seed.name) }))) return;
  sfx.uproot();
  const el = plotEl(i);
  if (el) {
    const r = el.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height * 0.6, { count: 16, colors: ["#7a4f2c", "#9b6a3e", "#6aa84f"], size: [4, 9], spread: 50, up: 55 });
  }
  await act([i], "uproot", t("tx.uproot"), call("uproot", [i]));
}

async function help(i) {
  const v = plotView(i);
  sfx.help();
  buzz(10);
  const el = plotEl(i);
  if (el) {
    waterDrops(el.getBoundingClientRect());
    floatFrom(el, t("fx.help"), "gold");
  }
  try {
    await send(t("tx.help", { name: state.visit.name, seed: seedName(v.seed.name) }), call("helpWater", [state.visit.owner, i]));
    toast(t("toast.helped", { name: state.visit.name, seed: seedName(v.seed.name) }), "ok");
  } catch {
    shake(el);
  }
  await refresh();
}

/** One tap does the obvious thing for the plot; anything else only selects it. */
async function tapPlot(i) {
  const v = plotView(i);
  if (lastPointer === "touch") {
    showTip(i);
    hideTipSoon(4000);
  }
  if (v.pending) return;
  if (!state.account) {
    sfx.error();
    shake(plotEl(i));
    return toast(t("toast.connect"), "error");
  }
  if (v.locked) {
    sfx.error();
    shake(plotEl(i));
    return toast(t("toast.lockedPlots"), "error");
  }
  if (v.visiting) {
    if (v.canHelp) return help(i);
    sfx.tap();
    return;
  }
  if (v.empty) return plant([i]);
  if (v.canHarvest) return harvest([i]);
  if (v.ripe && v.freshBlocked) {
    sfx.error();
    return toast(t("toast.freshOnly", { seed: seedName(v.seed.name) }), "error");
  }
  if (v.canWater) return water([i]);
  sfx.tap();
  squish(plotEl(i));
}

/** Returns true once the name is saved on-chain. */
async function saveNickname(name) {
  const clean = name.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,16}$/.test(clean)) {
    sfx.error();
    toast(t("toast.badName"), "error");
    return false;
  }
  let saved = false;
  try {
    await send(t("tx.name", { name: clean }), call("setNickname", [clean]));
    sfx.fanfare();
    toast(t("toast.welcome", { name: clean }), "ok");
    saved = true;
  } catch {
    /* toast already shown */
  }
  await refresh();
  return saved;
}

// The name window opens once per wallet, right after its first connect; the profile banner covers later visits.
const nameAskedKey = (account) => `squeek-garden:name-asked:${account.toLowerCase()}`;
function nameAsked(account) {
  try {
    return localStorage.getItem(nameAskedKey(account)) === "1";
  } catch {
    return false;
  }
}
function markNameAsked(account) {
  try {
    localStorage.setItem(nameAskedKey(account), "1");
  } catch {
    /* storage unavailable: the window may open again next visit */
  }
}

function openNameDialog() {
  if (!state.account || state.nickname || nameAsked(state.account)) return;
  markNameAsked(state.account);
  const dlg = document.createElement("dialog");
  dlg.className = "name-dialog";
  dlg.innerHTML = `<form method="dialog" class="name-dialog-form">
      <span class="avatar big" style="--hue:${parseInt(state.account.slice(2, 6), 16) % 360}"></span>
      <h2>${t("profile.welcomeTitle")}</h2>
      <p>${t("profile.pickHelp")}</p>
      <input name="nick" maxlength="16" placeholder="hay_hero" autocomplete="off" spellcheck="false" autocapitalize="none" aria-label="${t("profile.pick")}" />
      <p class="name-check" aria-live="polite"></p>
      <div class="row">
        <button class="primary" type="submit" value="save" disabled>${t("profile.save")}</button>
        <button class="ghost" type="submit" value="later" formnovalidate>${t("profile.later")}</button>
      </div>
    </form>`;
  document.body.append(dlg);
  const input = dlg.querySelector("input");
  const check = dlg.querySelector(".name-check");
  const save = dlg.querySelector("[value=save]");
  let seq = 0;
  input.addEventListener("input", () => {
    input.value = input.value.toLowerCase(); // names are lowercase on-chain; show it while typing
    const name = input.value.trim();
    const mine = ++seq;
    save.disabled = true;
    check.className = "name-check";
    if (!name) return (check.textContent = "");
    if (!/^[a-z0-9_]{3,16}$/.test(name)) {
      check.classList.add("bad");
      return (check.textContent = t("toast.badName"));
    }
    check.textContent = "…";
    setTimeout(async () => {
      if (mine !== seq) return;
      const key = keccak256(toBytes(name));
      const [owner, banned] = await Promise.all([read("nicknameOwner", [key]).catch(() => null), read("nicknameBanned", [key]).catch(() => false)]);
      if (mine !== seq) return;
      const free = !banned && (owner === null || BigInt(owner) === 0n || owner.toLowerCase() === me());
      check.classList.add(free ? "ok" : "bad");
      check.textContent = t(free ? "profile.free" : "profile.taken", { name });
      save.disabled = !free;
    }, 300);
  });
  // Removed right away rather than on "close" alone, which some embedded browsers never fire.
  const done = () => {
    if (dlg.open) dlg.close();
    dlg.remove();
  };
  dlg.addEventListener("submit", async (ev) => {
    ev.preventDefault(); // the page-wide submit handler cancels method="dialog" anyway, so the dialog closes itself
    if (ev.submitter?.value !== "save") return done();
    save.disabled = true;
    if (await saveNickname(input.value)) done();
    else save.disabled = false;
  });
  dlg.addEventListener("close", () => dlg.remove()); // Escape
  dlg.showModal();
  input.focus();
}

async function visit(input) {
  const q = input.trim();
  if (!q) return;
  let owner = null;
  if (isAddress(q)) owner = getAddress(q);
  else {
    const found = await read("nicknameOwner", [keccak256(toBytes(q.toLowerCase()))]);
    if (found !== "0x0000000000000000000000000000000000000000") owner = found;
  }
  if (!owner) {
    sfx.error();
    return toast(t("toast.noGardener", { q }), "error");
  }
  if (owner.toLowerCase() === me()) return leaveVisit();
  state.visit = { owner, name: nameOf(owner), plots: [], plotCount: BASE_PLOTS };
  state.selectedPlot = 0;
  state.tipPlot = null;
  history.replaceState(null, "", withParam("g", state.visit.name.includes("…") ? owner : state.visit.name));
  sfx.select();
  await loadVisit();
  render();
  $("field").scrollIntoView({ behavior: "smooth", block: "center" });
}

function leaveVisit() {
  state.visit = null;
  history.replaceState(null, "", withParam("g", null));
  sfx.select();
  render();
}

function withParam(key, value) {
  const u = new URL(location.href);
  if (value == null) u.searchParams.delete(key);
  else u.searchParams.set(key, value);
  return u.toString();
}

// ------------------------------------------------------------------ artwork

// Optional hand-made scene art in web/public/art (see art-prompts.md). Without it the stage draws its own sky.
const hero = { day: false, night: false };
// Absolute, because a relative url() inside a custom property resolves against the stylesheet, not the page.
const heroURL = (k) => new URL(`art/hero-${k}.png`, document.baseURI).href;
for (const k of Object.keys(hero)) {
  const probe = new Image();
  probe.onload = () => {
    hero[k] = true;
    renderStage();
  };
  probe.src = heroURL(k);
}

// Where the wheel stands in the scene art: the meadow at the far left, in image pixels.
const SCENE = { width: 2000, height: 328, grassX: 125 };
const WHEEL_SHARE = 0.56; // wheel height as a share of the scene height

/**
 * Pins the live wheel to the grass point of the art (drawn at full height, anchored by --focus) and stacks the status
 * text right above the wheel, left-aligned with it.
 */
function placeSceneHamster() {
  const scene = document.querySelector(".scene");
  const ham = document.querySelector(".scene-hamster");
  if (!scene || !ham) return;
  const w = scene.clientWidth;
  const h = scene.clientHeight;
  const scale = h / SCENE.height;
  const parsed = parseFloat(getComputedStyle(scene).getPropertyValue("--focus"));
  const focus = Number.isFinite(parsed) ? parsed : 0;
  const offset = (SCENE.width * scale - w) * focus;
  const x = SCENE.grassX * scale - offset;
  const u = (h * WHEEL_SHARE) / 64;
  ham.style.left = `${Math.round(x)}px`;
  ham.style.setProperty("--scene-u", `${u.toFixed(2)}px`);

  const status = document.querySelector(".scene-status");
  if (!status) return;
  const left = Math.max(8, x - u * 32);
  status.style.left = `${Math.round(left)}px`;
  status.style.maxWidth = `${Math.round(w - left - 12)}px`;
  const wheelTop = h * 0.985 - u * 62;
  status.style.top = `${Math.max(4, Math.round(wheelTop - status.offsetHeight - 4))}px`;
}
addEventListener("resize", placeSceneHamster);

/** Which scene image to show: the night one while he runs or after dark, falling back to whichever exists. */
function heroFor(nightScene) {
  if (nightScene) return hero.night ? "night" : hero.day ? "day" : null;
  return hero.day ? "day" : hero.night ? "night" : null;
}

{
  const t = textures();
  const root = document.documentElement.style;
  root.setProperty("--px-grass", `url(${t.grass})`);
  root.setProperty("--px-fence", `url(${t.fence})`);
  root.setProperty("--px-bed", `url(${t.bed})`);
  root.setProperty("--px-bed-wet", `url(${t.bedWet})`);
  root.setProperty("--px-bed-grass", `url(${t.bedGrass})`);
}

// ------------------------------------------------------------------ rendering

/** Replaces an element's markup only when it changed, so CSS animations and focus survive polling. */
function paint(el, html) {
  if (typeof el === "string") el = $(el);
  if (!el || el.dataset.painted === html) return;
  el.innerHTML = html;
  el.dataset.painted = html;
}

function renderTop() {
  if (!state.account) {
    paint("wallet", `<button class="primary big" data-action="connect">${isLocal ? t("wallet.local") : t("wallet.connect")}</button>`);
  } else {
    paint(
      "wallet",
      `<div class="chip who"><span class="avatar" style="--hue:${parseInt(state.account.slice(2, 6), 16) % 360}"></span><span>${state.nickname ? esc(state.nickname) : short(state.account)}</span></div>
      ${levelStat()}
      <div class="stat points"><span>${t("stat.points")}</span><strong id="points-num">${fmt(state.stats.points)}</strong></div>
      <div class="stat"><span>SQK</span><strong>${sqk(state.sqkBalance)}</strong></div>`,
    );
    if (state.pointsChanged) {
      const [from, to] = state.pointsChanged;
      if (to > from) tickNumber($("points-num"), Number(from), Number(to));
      state.pointsChanged = null;
    }
  }
  $("mute").textContent = isMuted() ? "🔇" : "🔊";
  $("mute").setAttribute("aria-label", isMuted() ? t("sound.off") : t("sound.on"));
}

/** The player's level with a bar to the next one. */
function levelStat() {
  const level = myLevel();
  const from = pointsForLevel(level);
  const next = pointsForLevel(level + 1);
  const pts = Number(state.stats.points);
  const pct = Math.min(100, ((pts - from) / (next - from)) * 100);
  const hint = t("level.next", { n: fmt(next - pts), level: level + 1 });
  return `<div class="stat level" title="${hint}"><span>${t("stat.level")}</span><strong>${level}</strong>
      <div class="level-bar" role="progressbar" aria-label="${hint}" aria-valuenow="${pct.toFixed(0)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct.toFixed(1)}%"></i></div></div>`;
}

/** The stage badge; while the hamster runs it is a play button to Squeekchain's live stream on X. */
function stageBadge(running, night) {
  if (!running) return `<span class="badge">${night ? t("stage.night") : t("stage.day")}</span>`;
  return `<a class="badge live watch" href="${LIVE_STREAM_URL}" target="_blank" rel="noopener" aria-label="${t("stage.watchLive")}"><svg class="play" viewBox="0 0 10 10" aria-hidden="true"><path d="M2.5 1.5v7l6-3.5z"/></svg>${t("stage.live")}</a>`;
}

function renderStage() {
  const h = state.hamster;
  const running = Boolean(h?.running);
  const spin = running && h.rpm > 0 ? Math.max(0.35, Math.min(3, 60 / h.rpm)) : running ? 1 : 0;
  const night = isNightUtc();
  const r = state.readings;
  const liveWork = liveReadings()?.liveWork;
  const pending = h && r && liveWork > r.work ? liveWork - r.work : 0n;
  const label = !h ? t("stage.unreachable") : running ? t("stage.running") : h.online ? t("stage.napping") : t("stage.offline");
  const detail = !h
    ? t("stage.detailNone")
    : running
      ? t("stage.detailRun", { kmh: h.kmh.toFixed(1), today: h.todayKm.toFixed(2) })
      : t("stage.detailNap", { today: h.todayKm.toFixed(2) });
  const badge = stageBadge(running, night);
  const snacks = tp("pantry.snacks", Number(state.pantry), { n: fmt(state.pantry) });

  const nextSeed = state.seeds
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => BigInt(s.unlockSnacks) > state.pantry)
    .sort((a, b) => a.s.unlockSnacks - b.s.unlockSnacks)[0];
  const goal = nextSeed ? BigInt(nextSeed.s.unlockSnacks) : state.pantry || 1n;
  const fill = Math.min(1, Number(state.pantry) / Number(goal || 1n));
  const dev = isDev
    ? `<div class="row dev"><button data-action="run" data-n="1000">Dev: run 1,000</button><button data-action="run" data-n="5000">Dev: run 5,000</button><button data-action="nap" data-n="12">Dev: nap 2 h</button></div>`
    : "";

  const info = `<div class="hamster-info">
      ${badge}
      <strong>${label}</strong>
      <p>${detail}</p>
      <div class="readings">
        <div><span>${t("hud.work")}</span><b>${r ? fmt(r.work) : "…"}</b></div>
        <div><span>${t("hud.block")}</span><b>${r ? fmt(r.blockHeight) : "…"}</b></div>
        <div class="${pending > 0n ? "glow" : ""}"><span>${t("hud.onWay")}</span><b>${pending > 0n ? `+${fmt(pending)}` : "0"}</b></div>
      </div>
      ${dev}
    </div>`;
  const pantry = `<div class="pantry">
      <div class="pantry-jar">${pantryArt(fill)}</div>
      <div class="pantry-info">
        <span>${t("hud.pantry")}</span>
        <b>${snacks}</b>
        <small>${nextSeed ? t("pantry.more", { n: fmt(goal - state.pantry), seed: esc(seedName(nextSeed.s.name)) }) : t("pantry.allFull")}</small>
        <div class="mini-bar"><i style="width:${(fill * 100).toFixed(1)}%"></i></div>
      </div>
    </div>`;

  const art = heroFor(running || night);
  const sceneDetail = !h
    ? t("scene.lastSettled")
    : running
      ? t("scene.run", { kmh: h.kmh.toFixed(1), today: h.todayKm.toFixed(2) })
      : t("scene.nap", { today: h.todayKm.toFixed(2) });
  if (art) {
    // Scene art at its natural strip shape: a short status in the empty sky, the live wheel on the meadow, and one
    // slim row of readings underneath.
    paint(
      "stage",
      `<div class="stage-card ${art}">
        <div class="scene" style="--hero:url(${heroURL(art)})">
          <div class="scene-status">
            ${badge}
            <strong>${label}</strong>
            <p>${sceneDetail}</p>
          </div>
          <div class="scene-hamster" role="img" aria-label="${art === "night" ? t("scene.ariaNight") : t("scene.aria")}">${hamsterArt(spin)}</div>
        </div>
        <div class="hud">
          <div class="hud-item hud-work"><span>${t("hud.work")}</span><b>${r ? fmt(r.work) : "…"}</b></div>
          <div class="hud-item hud-block ${running ? "mining" : ""}">
            <span>${h ? t("hud.mining", { n: fmt(h.liveBlock + 1n) }) : t("hud.block")}</span>
            <b>${h ? `${Math.floor(h.blockProgress * 100)}%` : r ? fmt(r.blockHeight) : "…"}</b>
            ${h ? `<div class="mini-bar block-bar"><i style="width:${(h.blockProgress * 100).toFixed(1)}%"></i></div>` : ""}
          </div>
          <div class="hud-item ${pending > 0n ? "glow" : ""}"><span>${t("hud.onWay")}</span><b>${pending > 0n ? `+${fmt(pending)}` : "0"}</b></div>
          <div class="hud-pantry">
            <span class="hud-jar">${pantryArt(fill)}</span>
            <div class="hud-pantry-text">
              <span>${t("hud.pantry")}</span>
              <b>${nextSeed ? tp("pantry.snacks", Number(goal), { n: `${fmt(state.pantry)} / ${fmt(goal)}` }) : snacks}</b>
              <div class="mini-bar"><i style="width:${(fill * 100).toFixed(1)}%"></i></div>
            </div>
            <small>${nextSeed ? t("pantry.unlocks", { seed: esc(seedName(nextSeed.s.name)) }) : t("pantry.all")}</small>
          </div>
          ${dev}
        </div>
      </div>`,
    );
    placeSceneHamster();
    return;
  }
  paint(
    "stage",
    `<div class="sky ${night ? "night" : "day"} ${running ? "is-running" : ""}">
      <div class="celestial"></div>
      <div class="clouds"><i></i><i></i><i></i></div>
      <div class="hills"></div>
      <div class="house">
        <div class="wheel-wrap">${hamsterArt(spin)}</div>
        ${info}
      </div>
      ${pantry}
    </div>`,
  );
}

function renderProfile() {
  const el = $("profile");
  if (state.visit) {
    el.hidden = false;
    paint(
      el,
      `<div class="visit-banner"><span class="avatar big" style="--hue:${parseInt(state.visit.owner.slice(2, 6), 16) % 360}"></span>
        <div><b>${t("profile.visiting", { name: esc(state.visit.name) })}</b><p>${t("profile.visitHelp")}</p></div>
        <button data-action="leave">${t("profile.back")}</button></div>`,
    );
    return;
  }
  if (state.account && state.invite && !state.inviteDismissed) {
    el.hidden = false;
    paint(
      el,
      `<div class="visit-banner invite-banner"><span class="avatar big" style="--hue:${parseInt(state.invite.owner.slice(2, 6), 16) % 360}"></span>
        <div><b>${t("invited.title", { name: esc(state.invite.name) })}</b><p>${t("invited.p", { name: esc(state.invite.name) })}</p></div>
        <div class="row"><button class="primary" data-action="accept-invite">${t("invited.accept")}</button><button class="ghost" data-action="decline-invite">${t("invited.decline")}</button></div></div>`,
    );
    return;
  }
  if (state.account && !state.nickname && !state.nameDismissed) {
    el.hidden = false;
    paint(
      el,
      `<form class="name-form" id="name-form"><span class="avatar big" style="--hue:${parseInt(state.account.slice(2, 6), 16) % 360}"></span>
        <div class="grow"><b>${t("profile.pick")}</b><p>${t("profile.pickHelp")}</p>
        <div class="row"><input name="nick" maxlength="16" placeholder="hay_hero" autocomplete="off" spellcheck="false" /><button class="primary" type="submit">${t("profile.save")}</button><button type="button" class="ghost" data-action="dismiss-name">${t("profile.later")}</button></div></div></form>`,
    );
    return;
  }
  el.hidden = true;
}

function renderSeeds() {
  paint(
    "seeds",
    state.seeds
      .map((s, i) => {
        const id = i + 1;
        if (!s.active) return "";
        const levelLocked = s.level > myLevel();
        const locked = levelLocked || BigInt(s.unlockSnacks) > state.pantry;
        const left = plantsLeft(id);
        const spent = !locked && left === 0;
        const price = spent ? t("seeds.tomorrow") : s.price === 0n ? t("seeds.free") : `${sqk(s.price)} SQK`;
        const mode = MODE[s.mode];
        const limit = s.dailyLimit ? `<span class="packet-limit">${state.account ? t("seeds.left", { left, limit: s.dailyLimit }) : t("seeds.perDay", { limit: s.dailyLimit })}</span>` : "";
        return `
        <button class="packet ${state.selectedSeed === id ? "selected" : ""} ${locked ? "locked" : ""} ${spent ? "spent" : ""}" data-action="select-seed" data-seed="${id}" aria-pressed="${state.selectedSeed === id}" style="--seed:${SEED_COLOR[s.name] ?? "#4f9d43"}" title="${mode.label}${s.needsFreshRun ? `, ${t("seeds.freshOnly")}` : ""}">
          <span class="packet-art">${seedArt(s.name)}${locked ? `<span class="lock">🔒</span>` : ""}</span>
          <span class="packet-body">
            <span class="packet-name">${esc(seedName(s.name))}${s.rare ? ` <i class="rare">${t("seeds.rare")}</i>` : ""}</span>
            <span class="packet-mode">${mode.icon}${s.needsFreshRun ? " 🌙" : ""} ${seedRequirement(s)}</span>
            ${limit}
          </span>
          <span class="packet-end">
            <b class="packet-pts">${t("seeds.pts", { n: s.basePoints })}</b>
            <span class="price-tag ${s.price === 0n ? "free" : ""}">${levelLocked ? `⭐ ${t("level.short", { n: s.level })}` : locked ? `🫙 ${fmt(s.unlockSnacks)}` : price}</span>
          </span>
        </button>`;
      })
      .join(""),
  );
}

function ensurePlots() {
  const g = $("garden");
  if (g.children.length === MAX_PLOTS) return;
  g.innerHTML = Array.from({ length: MAX_PLOTS }, (_, i) => `<button class="plot" data-action="plot" data-plot="${i}" aria-label="${t("plot.aria", { n: i + 1 })}"></button>`).join("");
}

const GROWS_WITH = [t("grows.0"), t("grows.1"), t("grows.2")];

function growLabel(v) {
  if (v.ripe || v.wilted) return "";
  return `<span class="grow-pct" title="${GROWS_WITH[v.seed.mode]}"><span aria-hidden="true">${MODE[v.seed.mode].icon}</span>${v.exactPct.toFixed(2)}%</span>`;
}

// Last shown growth per planting, so a rise can flash "+0.31%" over the plant.
const lastPct = new Map();

function flashGrowth(v) {
  if (v.empty || v.locked || v.visiting || v.ripe || v.wilted) return;
  const key = `${v.i}:${v.seed.name}:${v.plot.plantedBlock}`;
  const before = lastPct.get(key);
  lastPct.set(key, v.exactPct);
  const gain = before == null ? 0 : v.exactPct - before;
  if (gain < 0.01) return;
  const label = plotEl(v.i)?.querySelector(".grow-pct");
  label?.classList.remove("up");
  void label?.offsetWidth;
  label?.classList.add("up");
  floatFrom(plotEl(v.i)?.querySelector(".plant"), `+${gain.toFixed(2)}%`, "grow");
}

function plotMarkup(v) {
  if (v.locked) {
    return { cls: "plot locked", html: `<span class="bed"></span><span class="sign">${signArt()}<small>${state.nftOn ? t("plot.holders") : t("plot.soon")}</small></span>` };
  }
  const spinner = v.pending ? `<span class="spinner" title="${t("plot.waiting")}"></span>` : "";
  if (v.empty) {
    const s = state.seeds[state.selectedSeed - 1];
    const hint = v.visiting ? "" : `<span class="ghost-seed">${s ? seedArt(s.name) : ""}</span><span class="cta">${s ? t("plot.plantCta", { seed: esc(seedName(s.name)) }) : ""}</span>`;
    return { cls: `plot empty ${v.visiting ? "" : "can-plant"}`, html: `<span class="bed"></span>${hint}${spinner}` };
  }
  const settledW = v.pct;
  const liveW = Math.max(0, v.livePct - v.pct);
  const drops = Array.from({ length: MAX_WATERINGS }, (_, k) => `<i class="${k < v.waterings ? "full" : ""}"></i>`).join("");
  const helpers = v.plot.helps ? `<span class="helpers" title="${t("plot.neighbourWaterings")}">🤝${v.plot.helps}</span>` : "";
  const action = v.visiting ? (v.canHelp ? "can-help" : "") : v.canHarvest ? "can-harvest" : v.canWater ? "can-water" : "";
  const badge = v.wilted
    ? `<span class="badge-pill bad">${t("badge.wilted")}</span>`
    : v.ripe
      ? v.freshBlocked
        ? `<span class="badge-pill moon">${t("badge.afterRun")}</span>`
        : `<span class="badge-pill ${v.overripe ? "bad" : "good"}">${v.overripe ? t("badge.overripe") : t("badge.ripe")} · ${v.value}</span>`
      : "";
  return {
    cls: `plot planted ${v.ripe ? "ripe" : ""} ${v.overripe ? "overripe" : ""} ${v.wilted ? "wilted" : ""} ${v.waterings ? "wet" : ""} ${action}`,
    html: `<span class="bed"></span>
      <span class="plant">${plantArt(v.seed.name, v.pct, { overripe: v.overripe, wilt: v.wilted })}</span>
      ${badge}
      <span class="plot-foot">
        <span class="meter" role="progressbar" aria-label="${t("plot.meterAria", { seed: esc(seedName(v.seed.name)) })}" aria-valuenow="${v.pct}" aria-valuemin="0" aria-valuemax="100"><i class="settled" style="width:${settledW}%"></i><i class="live" style="width:${liveW}%"></i></span>
        <span class="icons">${growLabel(v)}<span class="drops">${drops}</span>${helpers}</span>
      </span>
      ${spinner}`,
  };
}

function renderGarden() {
  ensurePlots();
  for (let i = 0; i < MAX_PLOTS; i++) {
    const v = plotView(i);
    const { cls, html } = plotMarkup(v);
    const el = plotEl(i);
    const full = `${cls} ${state.selectedPlot === i ? "selected" : ""} ${v.pending ? "is-pending" : ""}`;
    if (el.className !== full) el.className = full;
    paint(el, html);
    flashGrowth(v);
    el.setAttribute(
      "aria-label",
      v.locked
        ? t("plot.ariaLocked", { n: i + 1 })
        : v.empty
          ? t("plot.ariaEmpty", { n: i + 1 })
          : v.ripe
            ? t("plot.ariaRipe", { n: i + 1, seed: seedName(v.seed.name) })
            : t("plot.ariaGrown", { n: i + 1, seed: seedName(v.seed.name), pct: v.pct }),
    );
  }
  $("field").classList.toggle("visiting", Boolean(state.visit));
  $("field").classList.toggle("running", Boolean(state.hamster?.running));
  $("garden-title").textContent = state.visit ? t("garden.of", { name: state.visit.name }) : state.nickname ? t("garden.of", { name: state.nickname }) : t("garden.yours");

  const views = Array.from({ length: MAX_PLOTS }, (_, i) => plotView(i));
  const ripe = views.filter((v) => v.canHarvest && !v.pending).map((v) => v.i);
  const waterable = views.filter((v) => !v.empty && v.canWater && !v.pending).map((v) => v.i);
  const empty = views.filter((v) => v.empty && !v.locked && !v.pending).map((v) => v.i);
  const price = state.seeds[state.selectedSeed - 1]?.price ?? 0n;
  empty.splice(Math.min(empty.length, plantsLeft(state.selectedSeed)));
  paint(
    "bulk",
    state.account && !state.visit
      ? `${ripe.length > 1 ? `<button class="primary" data-action="harvest-all">${t("bulk.harvest", { n: ripe.length })}</button>` : ""}
         ${waterable.length > 1 ? `<button data-action="water-all">${t("bulk.water", { n: waterable.length })}</button>` : ""}
         ${empty.length > 1 ? `<button data-action="plant-all">${price > 0n ? t("bulk.fillCost", { n: empty.length, amount: sqk(price * BigInt(empty.length)) }) : t("bulk.fill", { n: empty.length })}</button>` : ""}`
      : "",
  );
  $("garden-note").textContent = state.visit
    ? t("note.visit")
    : t("note.mine");
}

// ------------------------------------------------------------------ plot tooltip

function tipEl() {
  let tip = $("plot-tip");
  if (!tip) {
    tip = document.createElement("div");
    tip.id = "plot-tip";
    tip.className = "plot-tip";
    tip.setAttribute("role", "tooltip");
    tip.hidden = true;
    document.body.append(tip);
  }
  return tip;
}

/** Shows what is growing on the hovered (or tapped, or focused) plot right next to it. */
function renderTip() {
  const tip = tipEl();
  const v = state.tipPlot == null ? null : plotView(state.tipPlot);
  if (!v || (v.empty && !v.locked)) {
    tip.hidden = true;
    return;
  }
  paint(tip, tipMarkup(v));
  tip.hidden = false;
  positionTip();
}

function positionTip() {
  const tip = $("plot-tip");
  const el = state.tipPlot == null ? null : plotEl(state.tipPlot);
  if (!tip || tip.hidden || !el) return;
  const r = el.getBoundingClientRect();
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  const gap = 10;
  const above = r.top + r.height * 0.15 - h - gap >= 8;
  const top = above ? r.top + r.height * 0.15 - h - gap : r.bottom + gap;
  const centre = r.left + r.width / 2;
  const left = Math.min(Math.max(8, centre - w / 2), innerWidth - w - 8);
  tip.style.top = `${Math.round(top)}px`;
  tip.style.left = `${Math.round(left)}px`;
  tip.style.setProperty("--arrow-x", `${Math.round(centre - left)}px`);
  tip.classList.toggle("below", !above);
}

function tipMarkup(v) {
  if (v.locked) {
    return state.nftOn
      ? `<div class="tip-head"><b>${t("tip.lockedTitle")}</b></div><p class="tip-text">${t("tip.lockedOn")}</p>`
      : `<div class="tip-head"><b>${t("tip.lockedTitle")}</b></div><p class="tip-text">${t("tip.lockedOff")}</p>`;
  }
  const mode = MODE[v.seed.mode];
  const liveExtra = Math.max(0, v.livePct - v.pct);
  const settledExact = Math.min(100, (Number(v.progress) / Number(v.needed)) * 100);
  const waterLine =
    v.waterings >= MAX_WATERINGS
      ? t("tip.fullyWatered")
      : Date.now() / 1000 < v.waterReadyAt
        ? t("tip.nextWater", { time: new Date(v.waterReadyAt * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) })
        : t("tip.canWater");
  return `<div class="tip-head"><b>${esc(seedName(v.seed.name))}</b><span class="mode-chip">${mode.icon} ${mode.label}${v.seed.needsFreshRun ? " · 🌙" : ""}</span></div>
    <p class="tip-text">${remainingText(v)}</p>
    <div class="meter big"><i class="settled" style="width:${v.pct}%"></i><i class="live" style="width:${liveExtra}%"></i></div>
    <p class="tip-sub">${t("tip.settled", { pct: settledExact.toFixed(2) })}${v.exactPct - settledExact >= 0.01 ? ` · ${t("tip.live", { pct: (v.exactPct - settledExact).toFixed(2) })}` : ""}</p>
    <ul class="facts">
      <li>💧 ${v.waterings}/3 · ${waterLine}</li>
      <li>🤝 ${t("tip.helps", { n: v.plot.helps })}</li>
      <li>⭐ ${v.ripe ? t("tip.pointsNow", { n: v.value }) : t("tip.pointsRipe", { n: v.maxValue })}</li>
    </ul>
    <p class="tip-hint">${v.pending ? t("tip.waiting") : tipHint(v)}</p>`;
}

/** What a click does on this plot; the tooltip itself is see-through, so the plot is the only control. */
function tipHint(v) {
  const touch = lastPointer === "touch";
  const click = touch ? t("hint.tap") : t("hint.click");
  if (v.visiting) return v.canHelp ? t("hint.helpIt", { click }) : t("hint.helped");
  const now = v.canHarvest
    ? `<b>${t("hint.harvest", { click })}</b>`
    : v.ripe && v.freshBlocked
      ? t("hint.afterRun")
      : v.canWater
        ? `<b>${t("hint.water", { click })}</b>`
        : v.wilted
          ? t("hint.wilted")
          : t("hint.growing");
  return `${now} · ${t("hint.pull", { how: touch ? t("hint.longPress") : t("hint.rightClick") })}`;
}

let hideTimer = 0;
let lastPointer = "mouse";

function showTip(i) {
  clearTimeout(hideTimer);
  if (state.tipPlot !== i) {
    state.tipPlot = i;
    state.selectedPlot = i;
    document.querySelectorAll(".plot.selected").forEach((p) => p.classList.remove("selected"));
    plotEl(i)?.classList.add("selected");
  }
  renderTip();
}

function hideTipSoon(ms = 160) {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    state.tipPlot = null;
    renderTip();
  }, ms);
}

const TABS = [
  { key: "points", label: t("tab.points"), value: (p) => p.points },
  { key: "harvests", label: t("tab.harvests"), value: (p) => BigInt(p.harvests) },
  { key: "rare", label: t("tab.rare"), value: (p) => BigInt(p.rareHarvests) },
  { key: "helps", label: t("tab.helps"), value: (p) => BigInt(p.helps) },
  { key: "invites", label: t("tab.invites"), value: (p) => p.referralPoints },
];
const MEDALS = ["🥇", "🥈", "🥉"];

function renderBoard() {
  paint("board-tabs", TABS.map((t) => `<button role="tab" class="tab ${state.boardTab === t.key ? "on" : ""}" aria-selected="${state.boardTab === t.key}" data-action="tab" data-tab="${t.key}">${t.label}</button>`).join(""));
  const tab = TABS.find((t) => t.key === state.boardTab);
  const ranked = state.players
    .map((p) => ({ p, v: tab.value(p) }))
    .filter((x) => x.v > 0n)
    .sort((a, b) => (b.v > a.v ? 1 : b.v < a.v ? -1 : 0));
  const mine = ranked.findIndex((x) => x.p.player.toLowerCase() === me());
  const top = ranked.slice(0, 15);
  const best = Number(ranked[0]?.v ?? 1n) || 1;
  // Each row carries a bar of its value against the leader, so name and number read as one line.
  const row = ({ p, v }, i) => {
    const isMe = p.player.toLowerCase() === me();
    const share = Math.max(4, (Number(v) / best) * 100);
    return `<li class="${isMe ? "me" : ""} ${i < 3 ? "podium" : ""}"><span class="rank">${MEDALS[i] ?? i + 1}</span>
      <span class="board-who">
        <button class="link who" data-action="visit-player" data-owner="${p.player}"><span class="avatar" style="--hue:${parseInt(p.player.slice(2, 6), 16) % 360}"></span><span class="board-name">${p.nickname ? esc(p.nickname) : `<span class="mono">${short(p.player)}</span>`}</span><span class="lvl">${t("level.short", { n: levelFor(p.points) })}</span>${isMe ? `<span class="you">${t("board.you").replace(/[()（）]/g, "")}</span>` : ""}</button>
        <span class="board-bar" aria-hidden="true"><i style="width:${share.toFixed(1)}%"></i></span>
      </span>
      <strong>${fmt(v)}</strong></li>`;
  };
  const head = `<li class="board-head" aria-hidden="true"><span class="rank">#</span><span class="board-who">${t("board.gardener")}</span><span>${tab.label}</span></li>`;
  paint(
    "board",
    top.length
      ? head + top.map(row).join("") + (mine >= 15 ? `<li class="gap">…</li>${row(ranked[mine], mine)}` : "")
      : `<li class="empty-board">${t("board.empty")}</li>`,
  );
}

function ago(ts) {
  const s = Math.max(0, Date.now() / 1000 - ts);
  if (s < 60) return t("ago.now");
  if (s < 3600) return t("ago.min", { n: Math.floor(s / 60) });
  if (s < 86400) return t("ago.h", { n: Math.floor(s / 3600) });
  return t("ago.d", { n: Math.floor(s / 86400) });
}

function renderFeed() {
  const plantName = (id) => {
    const s = state.seeds[Number(id) - 1];
    return s ? seedName(s.name) : t("feed.aPlant");
  };
  const who = (a) => `<button class="link" data-action="visit-player" data-owner="${a}">${esc(nameOf(a))}</button>`;
  const line = (l) => {
    const a = l.args;
    switch (l.eventName) {
      case "Harvested":
        return t("feed.harvested", { who: who(a.player), seed: esc(plantName(a.seedId)), n: a.points });
      case "Planted":
        return t("feed.planted", { who: who(a.player), seed: esc(plantName(a.seedId)) });
      case "Helped":
        return t("feed.helped", { who: who(a.helper), owner: who(a.owner) });
      case "ReferrerSet":
        return t("feed.referred", { who: who(a.player), ref: who(a.referrer) });
      case "NicknameSet":
        return a.nickname ? t("feed.joined", { who: who(a.player), name: esc(a.nickname) }) : "";
      default:
        return "";
    }
  };
  const items = state.feed.map((l) => [line(l), blockTimes.get(l.blockNumber)]).filter(([t]) => t);
  paint(
    "feed",
    items.length
      ? items.map(([t, ts]) => `<li><span class="feed-line">${t}</span>${ts ? `<time>${ago(ts)}</time>` : ""}</li>`).join("")
      : `<li class="empty-board">${t("feed.empty")}</li>`,
  );
}

function renderBusy() {
  document.body.classList.toggle("tx-busy", pendingTx.count > 0);
}

function inviteLink() {
  const u = new URL(location.href);
  u.search = "";
  if (isLocal) u.searchParams.set("net", "local");
  u.searchParams.set("ref", state.nickname || state.account);
  return u.toString();
}

function renderInvite() {
  if (!state.account) {
    paint("invite", `<p class="hint">${t("invite.connect")}</p>`);
    return;
  }
  const by = state.referrer ? `<p class="invite-by">🤝 ${t("invite.yours", { name: esc(nameOf(state.referrer)) })}</p>` : "";
  paint(
    "invite",
    `<div class="invite-link"><input id="invite-url" readonly value="${esc(inviteLink())}" aria-label="${t("invite.h")}" /><button class="primary" data-action="copy-invite">${t("invite.copy")}</button></div>
     <div class="invite-stats">
       <div class="stat"><span>${t("invite.friends")}</span><strong>${fmt(state.stats.referrals ?? 0)}</strong></div>
       <div class="stat"><span>${t("invite.points")}</span><strong>${fmt(state.stats.referralPoints ?? 0n)}</strong></div>
       ${by}
     </div>`,
  );
}

function render() {
  renderTop();
  renderStage();
  if (!deployment) {
    paint("seeds", `<p class="hint">${t("deploy.none", { chain: net.chain.name })}</p>`);
    return;
  }
  renderProfile();
  renderSeeds();
  renderGarden();
  renderTip();
  renderBoard();
  renderFeed();
  renderInvite();
  $("foot").innerHTML =
    t("foot.main", { garden: `<span class="mono">${short(deployment.garden)}</span>`, chain: esc(net.chain.name), core: `<span class="mono">${short(state.core ?? deployment.squeekCore)}</span>` }) +
    (isLocal && !isDev ? ` · ${t("foot.local")}` : "");
}

// ------------------------------------------------------------------ toasts

function toast(text, kind = "info") {
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = text;
  $("toasts").append(el);
  setTimeout(() => el.remove(), kind === "error" ? 6000 : 4500);
}

// ------------------------------------------------------------------ wiring

document.addEventListener("click", async (ev) => {
  const btn = ev.target.closest("[data-action]");
  if (!btn || btn.disabled) return;
  const { action } = btn.dataset;
  const plot = btn.dataset.plot === undefined ? undefined : Number(btn.dataset.plot);

  if (action === "connect") {
    try {
      Object.assign(state, await connectWallet());
      sfx.select();
      await refresh();
      openNameDialog();
      const g = new URLSearchParams(location.search).get("g");
      if (g) visit(g);
    } catch (e) {
      toast(e.shortMessage ?? e.message, "error");
    }
    return;
  }
  if (action === "mute") {
    setMuted(!isMuted());
    sfx.tap();
    return renderTop();
  }
  if (action === "select-seed") {
    state.selectedSeed = Number(btn.dataset.seed);
    sfx.select();
    squish(btn);
    return render();
  }
  if (action === "tab") {
    state.boardTab = btn.dataset.tab;
    sfx.tap();
    return renderBoard();
  }
  if (action === "visit-player") return visit(btn.dataset.owner);
  if (action === "leave") return leaveVisit();
  if (action === "accept-invite") return acceptInvite();
  if (action === "decline-invite") {
    forgetRef();
    state.inviteDismissed = true;
    state.invite = null;
    return renderProfile();
  }
  if (action === "copy-invite") {
    const url = inviteLink();
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      $("invite-url")?.select();
      document.execCommand?.("copy");
    }
    sfx.select();
    return toast(t("invite.copied"), "ok");
  }
  if (action === "dismiss-name") {
    state.nameDismissed = true;
    return renderProfile();
  }
  if (action === "run" || action === "nap") {
    const n = BigInt(btn.dataset.n);
    await send(action === "run" ? `Dev: run ${n}` : "Dev: nap", { address: deployment.squeekCore, abi: mockCoreAbi, functionName: action, args: [n] }).catch(() => {});
    return refresh();
  }
  if (!state.account) return toast(t("toast.connect"), "error");
  if (action === "plot") return tapPlot(plot);
  if (action === "harvest") return harvest([plot]);
  if (action === "water") return water([plot]);
  if (action === "uproot") return uproot(plot);
  const views = Array.from({ length: MAX_PLOTS }, (_, i) => plotView(i));
  if (action === "harvest-all") return harvest(views.filter((v) => v.canHarvest && !v.pending).map((v) => v.i));
  if (action === "water-all") return water(views.filter((v) => !v.empty && v.canWater && !v.pending).map((v) => v.i));
  if (action === "plant-all") return plant(views.filter((v) => v.empty && !v.locked && !v.pending).map((v) => v.i));
});

// Mouse: the tooltip follows the hovered plot. It lets the pointer through, so plots under it stay reachable.
document.addEventListener("pointerover", (ev) => {
  if (ev.pointerType === "touch") return;
  const plot = ev.target.closest(".plot");
  if (plot) return showTip(Number(plot.dataset.plot));
  if (state.tipPlot != null) hideTipSoon(80);
});

// Touch: a tap on a plot opens its tooltip for a few seconds; a tap anywhere else closes it.
document.addEventListener("pointerdown", (ev) => {
  lastPointer = ev.pointerType;
  if (ev.pointerType === "touch" && !ev.target.closest(".plot")) hideTipSoon(0);
});

// Keyboard: focusing a plot shows its tooltip.
document.addEventListener("focusin", (ev) => {
  const plot = ev.target.closest(".plot");
  if (plot) showTip(Number(plot.dataset.plot));
});
document.addEventListener("focusout", (ev) => {
  if (ev.target.closest(".plot") && !ev.relatedTarget?.closest?.(".plot")) hideTipSoon();
});

/** Pull up a plant from your own garden: right-click, long-press (browsers send contextmenu) or Delete. */
function pullUpFromPlot(el) {
  const i = Number(el.dataset.plot);
  const v = plotView(i);
  if (!state.account || v.visiting || v.empty || v.locked || v.pending) return false;
  uproot(i);
  return true;
}

document.addEventListener("contextmenu", (ev) => {
  const plot = ev.target.closest(".plot");
  if (plot && pullUpFromPlot(plot)) ev.preventDefault();
});

document.addEventListener("keydown", (ev) => {
  if (ev.key !== "Delete" && ev.key !== "Backspace") return;
  const plot = document.activeElement?.closest?.(".plot");
  if (plot && pullUpFromPlot(plot)) ev.preventDefault();
});

addEventListener("scroll", positionTip, { passive: true });
addEventListener("resize", positionTip);

document.addEventListener("submit", (ev) => {
  ev.preventDefault();
  if (ev.target.id === "name-form") saveNickname(new FormData(ev.target).get("nick") ?? "");
  if (ev.target.id === "visit") visit(new FormData(ev.target).get("name") ?? "");
});

// Connecting fires these events too, so only a change to an already connected wallet reloads the page; the reload
// then reconnects silently through restoreWallet().
onWalletChange((kind, value) => {
  if (!state.account) return;
  if (kind === "accounts" && value[0]?.toLowerCase() === me()) return;
  if (kind === "chain" && parseInt(value, 16) === net.chain.id) return; // the switch our own connect asked for
  location.reload();
});
restoreWallet()
  .then((restored) => restored && Object.assign(state, restored))
  .catch(() => {})
  .then(refresh)
  .then(() => {
    const g = new URLSearchParams(location.search).get("g");
    if (g && deployment) visit(g);
  });
setInterval(refresh, net.pollMs);
// Re-render once a minute so watering cooldowns and "ago" times stay current between chain changes.
setInterval(render, 60_000);
