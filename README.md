# Squeek Garden

Squeektoshi's garden on Sepolia: hamster snacks that grow only from what the real
[Squeekchain](https://squeekchain.com) hamster does.

Every reading comes straight from the SqueekCore contract (`state()` and `roundPage()`), so there is no oracle and
nobody can speed a plant up. Every action is a transaction.

## How it plays

- Connect a wallet, pick a gardener **nickname** (on-chain, unique, 3-16 of `a-z 0-9 _`); a window asks once, right
  after the first connect.
- Each wallet has **9 plots**; a player who binds a Squeek NFT to their garden (`bindSqueek(tokenId)`) gets **12** once
  the owner switches holder plots on (`setSqueekNft`; off at launch unless `SQUEEK_NFT_PERK=on`). Any ERC-721 with
  `ownerOf` works, and the NFT page reads the collection from the garden, so a new collection needs no site change. A Squeek serves one
  garden at a time and can move to another garden only 7 days after its last binding; plots 10-12 plant and harvest
  only while the bound Squeek is in the wallet, so one NFT passed around cannot open holder plots in many wallets.
- **Seeds** are hamster snacks, and each one grows from a different thing the hamster does:

  | Seed | Level | Grows with | Needs | Points | Notes |
  |---|---|---|---|---|---|
  | Timothy Hay | 1 | wheel work | 800 (~0.7 km) | 8 | starter |
  | Sunflower | 2 | wheel work | 3,500 (~3 km) | 40 | |
  | Block Broccoli | 3 | Squeekchain blocks | 300 blocks | 45 | pace follows chain difficulty |
  | Nap Chamomile | 4 | settled rounds while he rests | 36 rounds (6 h) | 35 | wilts if he runs >300 work first |
  | Pumpkin | 5 | wheel work | 10,000 (~9 km) | 150 | a full night |
  | Golden Carrot | 6 | wheel work | 3,000 | 120 | 100 SQK, 3 a day per player |
  | Moon Melon | 7 | wheel work | 6,000 | 320 | unlocks at 150 pantry snacks; pick only right after a run |
  | Hamster Berry | 8 | wheel work | 8,000 | 600 | 500 SQK, 1 a day per player |

- **Levels** come from a player's points (`levelOf`, `pointsForLevel`): 30, 100, 250 and 600 points for levels
  2-5, so the first ones come within a day or two, then 1,800 / 4,000 / 7,500 / 12,000 / 18,000 for levels 6-10 and
  one more level per 8,000 points after that. A seed can only be planted from its level on; the owner can move a seed
  to another level with `setSeedLevel` without a redeploy. Only Moon Melon's fresh-run check reads
  `SqueekCore.roundPage`, so other harvests never depend on it.

- **Water** your own plant up to 3 times, an hour apart: +10% each.
- **Neighbours** can water your plant once a day (3 times in all): +5% for you, +2 points for them,
  at most 10 helps per helper per day.
- **Harvest** when ripe. Left for another full grow amount, a crop is overripe and pays half.
- Every harvest adds a snack to **Squeektoshi's pantry**, shared by everyone; it unlocks new seeds.
- **Invites**: every gardener has an invite link (`?ref=nickname`). A friend accepts it once, before their first
  harvest (`setReferrer`); from then on the inviter gets 10% of each of the friend's harvests as bonus points on top
  (fractions carry over), and the friend keeps all of theirs. No self-invites, no loops, inviter must be a gardener.
- The **leaderboard** ranks gardeners by points, harvests, rare harvests, helps and invite points (`playersPage`).

- **Squeekchain reinstall**: the owner can move the garden to a new SqueekCore (`setCore`) and SQK token (`setSqk`).
  Garden readings stay continuous (`reading = carried + (counter - base)`, see `coreMapping()`), so growing plants keep
  their progress and carry on with the new hamster counters. If the old core no longer answers (or reset its counters
  in place), `setCore` refuses with `OldCoreUnreadable`; then call `setCoreFrom(newCore, lastReadings)` with the
  garden's `readings()` read at a block before the old core stopped. Ownership cannot be renounced, so this stays
  reachable; `clearNickname` also bans the name (`setNicknameBanned` lifts it). After a reinstall, put the new addresses
  and `GENESIS_TS` in `scripts/squeekchain.js`, rehearse `scripts/switch-core.js` on a fork, run it on Sepolia, and copy
  the addresses into `web/src/deployments.json` and `GENESIS_TS` into `web/src/main.js` (the live nap estimate).

- Paid seeds carry a `dailyLimit` (plantings per player per UTC day) so SQK alone cannot buy the leaderboard;
  `plantedToday(player, seedId)` reports the count.

## Pages

- `index.html`: the garden.
- `guide.html`: the player guide; its seed cards are read live from the contract, so seeds added later show up.
- `nft.html`: the Squeek Garden cover mint (1,000 supply, free, not open yet), what a Squeek NFT does in the garden,
  whether holder plots are on, and a wallet check.

Every page speaks English, 中文, हिन्दी, Español, العربية (right-to-left) and Türkçe. Texts live in `web/src/locales/`
(`en.js` is the source; the others have the same keys), and `web/src/i18n.js` picks the language from the header
picker or the browser.

## What the page shows

- A scene of Squeektoshi's cottage with the live wheel on the meadow. The wheel spins at the real rpm, a LIVE badge
  shows while he runs, and the night art takes over while he runs or after dark.
- A HUD under the scene: settled wheel work, the Squeekchain block being mined (live progress from the API), work on
  its way to Ethereum, and the shared pantry. A finished block or newly settled work plays a short celebration.
- The garden: tap a plot to do the obvious thing (plant, water, harvest); hover a plant for its details. Each growth
  bar shows settled growth (solid) and live, not yet settled growth (striped).

All sprites are pixel art drawn in code (`web/src/pixel.js`, `web/src/art.js`). The two scene images live in
`web/public/art/hero-day.png` and `hero-night.png`; `art-prompts.md` has the prompts used to make them. Without them the
page falls back to a drawn sky.

## Layout

```
contracts/SqueekGarden.sol     the game
contracts/test/                mocks of SqueekCore, SQK and the Squeek NFT
scripts/deploy.js              Sepolia deploy (live SqueekCore, SQK, Squeek NFT)
scripts/deploy-local.js        local playground deploy, started from the real hamster's readings
scripts/mirror-hamster.js      keeps the local mock SqueekCore in step with the real hamster
scripts/fork-check.js          checks the contract against the real SqueekCore on a Sepolia fork
scripts/switch-core.js         moves the deployed garden to a new SqueekCore and SQK after a Squeekchain reinstall
test/                          contract tests
web/                           Vite + viem frontend
web/public/art/                scene art (day and night)
art-prompts.md                 image prompts for the scene art
```

## Run it locally

```bash
npm install
npm --prefix web install
npm test
```

Local playground, growing from the real hamster (three terminals):

```bash
npx hardhat node
npx hardhat run scripts/deploy-local.js --network localhost
npx hardhat run scripts/mirror-hamster.js --network localhost
npm run web
```

Open http://localhost:5173/?net=local. Local mode exists only on the dev server (production builds leave it out),
signs with Hardhat's public test account #1 and only talks to
`127.0.0.1:8545`. Add `&dev=1` for buttons that move the mock hamster by hand (the mirror overwrites them when the
real hamster's readings change).

Check the contract against the real SqueekCore on a Sepolia fork (PowerShell: `$env:FORK_SEPOLIA='1'`):

```bash
FORK_SEPOLIA=1 npx hardhat run scripts/fork-check.js
```

## Deploy to Sepolia

1. Copy `.env.example` to `.env` and set `DEPLOYER_PRIVATE_KEY` to a Sepolia-only wallet with a little Sepolia ETH.
   Optionally set `TREASURY_ADDRESS`.
2. Re-check the addresses in `scripts/squeekchain.js` against `https://api.squeekchain.com/v1/economy/state`
   (`identities`); a testnet reinstall changes them.
3. `npm run deploy:sepolia`. This writes the address into `web/src/deployments.json`.
4. With `ETHERSCAN_API_KEY` in `.env`, run the `npx hardhat verify ...` line the deploy printed so the source shows
   on Sepolia Etherscan (give it a minute after the deploy).
5. `npm run build` and host `dist/` (relative paths, so any folder or IPFS gateway works).
