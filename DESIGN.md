# Squeek Garden design and wording validation

## Overview

Squeek Garden is an existing pixel farming game on Ethereum Sepolia. Its cottage scene, grass plots and snack sprites carry the visual identity; plain interface text explains readings and transactions. This document records the existing implementation.

The November 6, 2026 update syncs the site with the source repository `0xyvz/squeek-garden` at commit `981426474da736cc6341b89777f6831a144cd69a` after Squeekchain reinstalled its Sepolia contracts. `README.md`, `scripts/squeekchain.js`, the new `scripts/switch-core.js`, `web/src/chain.js`, `web/src/main.js`, `web/src/nft.js`, `web/src/deployments.json` and the six `web/src/locales/*.js` files are byte-for-byte copies of that commit (the locales were already identical). At runtime the garden page now reads round 0 from the garden's current SqueekCore (`configuration()`, `web/src/chain.js:128`), falling back to `GENESIS_TS = 1793735400` (`web/src/main.js:40`). The NFT page reads the current Squeek collection from the Squeekchain API (`web/src/chain.js:138`) and falls back to `deployments.json`. The garden stays at `0xc97FcB52230CC29B37D458bF64818e1550395D6E`. Texts and game rules are unchanged. The accepted sync added share metadata to `web/index.html:8-11` (see Components). This revision removes only the mobile pantry label/count `white-space: nowrap` rule from `web/src/style.css`, allowing these strings to wrap inside their column.

## Colors

The canonical tokens are in `web/src/style.css:1`. The dark overrides follow at lines 27 and 53, selected by the operating system or `data-theme`. No colors were changed.

| Role / token | Light | Dark |
| --- | --- | --- |
| Page `--bg` | `#f3eddd` | `#17150f` |
| Surface `--surface` | `#fffcf4` | `#221f18` |
| Secondary surface `--surface-2` | `#f1e8d4` | `#2c281f` |
| Text `--text` | `#2f2a22` | `#f0e9da` |
| Secondary text `--muted` | `#6e6555` | `#a99f8c` |
| Border `--border` | `#e2d5ba` | `#3a3428` |
| Action `--accent` / ink | `#3f8f4f` / `#ffffff` | `#62b872` / `#0d1a10` |
| Action surface `--accent-soft` | `#e2f1df` | `#233a29` |
| Ripe `--ripe` / soft | `#e39b22` / `#fff1d6` | `#f0b14e` / `#3c2f1b` |
| Danger `--danger` / soft | `#b5442f` / `#f9e2dc` | `#e27d66` / `#3f241e` |
| Moon `--moon` | `#4f6db0` | `#8aa6e8` |

Grass and soil artwork uses the existing `--grass`, `--grass-dark`, `--soil`, `--soil-top` and `--soil-dark` tokens. Focus on buttons, fields and the language picker uses a 3px accent mix with a 2px offset. Native FAQ summaries retain the browser focus outline.

The November 1 run measured the guide introduction at 13.89:1 (light) and 13.60:1 (dark), and the expanded FAQ answer at 5.60:1 and 6.28:1. Those numbers cover only those two paragraphs. The November 6 probe of the garden page at 1440 measured 4.0:1 for white on `--accent` (Connect wallet and the current nav pill) and 3.9:1 for the "Full player guide →" link. Both are below 4.5:1; they are existing style values and stay unchanged under this brief.

## Typography

Body copy uses `16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`. Guide paragraphs and lists use a 1.6 line height. `--display` requests `"Pixelify Sans", system-ui, sans-serif`, loaded by the existing Google Fonts stylesheet at weights 500, 600 and 700. It serves headings and selected game labels. The page remains usable with system fallbacks when fonts are unavailable.

Shared headings are 1.6rem/700 (`h1`), 1.25rem/600 (`h2`) and 1.05rem/600 (`h3`). The guide introduction is 1.02rem, its contents links 0.85rem, and FAQ paragraphs inherit the 16px body size. `--num` uses Segoe UI/system fallbacks with tabular figures; addresses and code use monospace. The incumbent game has additional sizes; it does not meet the probe's six-size target.

## Layout

`web/src/style.css:108` constrains shared header, main and footer content to 1180px with 16px horizontal padding. Main sections have an 18px gap; cards have 18px padding. The guide's `.doc` is at most 920px wide. Its contents navigation wraps, paragraphs have natural height, and FAQ answers expand in document flow.

The garden's `.play` grid has a flexible field and 340px seed sidebar. At 980px it becomes one column; at 760px the lower panels and guide grids become one column and the garden uses three plot columns. At 520px the wallet moves to a full row, navigation becomes more compact and seed cards reduce their artwork column. Arabic sets document `dir="rtl"`; scene, field, addresses and numeric readings preserve their intended direction.

Below 760px, `.hud-pantry-text` (`web/src/style.css:2232`) retains `flex: 1` and `min-width: 0`; its label and count now use normal wrapping. The pantry row grows naturally, preserving the complete strings, original font sizes, jar, progress bar and unlock explanation. The 18 locale/width measurements and the remaining Turkish page overflow are recorded in the revision validation below.

On November 6, all three pages of the production export were measured at 320, 390 and 1440px with no horizontal overflow. At 390×844 the first screen shows the brand, the page navigation, Connect wallet, and the live scene with its readings (`test/scratch/taste/shots/390.png`, inspected).

## Elevation & Depth

Cards use `--shadow`: two warm translucent layers in light mode and a small black shadow in dark mode. `.stage-card` and `.field` use a 4px dark brown border and a 6px downward shadow, matching the pixel artwork. Primary controls use a 3px downward accent shadow, reduced when pressed. These existing border-and-shadow combinations were preserved.

## Shapes

`--radius` is 18px for cards, controls generally use 12px, seed cards 14px, stage and field frames 10px. Navigation and language controls use pill shapes. The field and scene retain crisp pixel rendering.

## Components

- `web/src/nav.js` / `.nav`: shared Garden, Guide and NFT links; the current page uses `aria-current="page"` and the accent fill.
- `web/src/i18n.js` / `.lang-select`: native language select with browser-language fallback, saved selection, page reload, and document language/direction updates. Dictionaries live in `web/src/locales/`.
- `web/guide.html` / `.doc-hero`, `.doc-toc`, `.doc-section`: reading cards, wrapping anchor links and native `details`/`summary` questions. Enter toggles the FAQ and exposes the complete answer without a fixed height.
- `web/src/main.js`: wallet entry, plot buttons, selected seed packets, leaderboard tabs, sound toggle and transaction/error feedback. The unconnected actions show the existing wallet instructions; transaction behavior was not changed.
- `web/src/main.js` live readings: the HUD maps raw SqueekCore counters through the garden's `coreMapping()`. The nap round estimate uses `state.genesisTs`, which is read once for each core the garden points at (`web/src/main.js:278`). If that read fails, the constant stays in place and the read is retried on the next load.
- `web/src/nft.js` collection notice: shows the garden's `squeekNft()` when holder plots are on. Otherwise it shows Squeekchain's current collection from the API, or the deployment's collection if the API is unreachable.
- `web/index.html:3-12` document head: title "Squeek Garden", hamster favicon, `description`, plus `og:type`, `og:title`, `og:description` and `og:image` (`./art/hero-day.png`, the existing day scene in `web/public/art/`), so a shared link unfurls. `og:image` is relative because the final gateway URL is set at publication; some unfurlers need an absolute URL.
- `web/src/style.css:2143`: reduced-motion override shortens animations and transitions. The probe found no infinite animations still running with this preference.

## Do's and Don'ts

Reuse the existing shared navigation, cards, tokens and full-string locale dictionaries when adding a page. Keep complete passages together for translation, retain natural wrapping, and set language and direction through `initNav()`. Keep addresses and game readings separate from display typography. After a Squeekchain reinstall, follow the README: rehearse and run `scripts/switch-core.js`, then copy the new addresses into `web/src/deployments.json`. The site reads the genesis time and the collection at runtime, so it needs no other change. Never hard-code a core address in the UI: read `core()` from the garden.

## Validation record from the previous accepted run

The following historical record is retained for context. The revision validation below supersedes its browser coverage and completion statement; in particular, the earlier layout pass did not establish that the pantry was clear with real loaded data in every locale.

The README (copied unchanged from the source commit) covers installation (`npm install`, `npm --prefix web install`), the local dev preview (`npm run web`) and the rebuild (`npm run build`, which runs `npm --prefix web ci` and then `vite build` into the root `dist/`). After building, `npm --prefix web run preview` serves the production export.

Checks actually run on November 6, 2026:

| Check | Result |
| --- | --- |
| Source sync | Fetched `0xyvz/squeek-garden` at `9814264`. Copied the 13 listed files and confirmed each with `cmp`. The six locales were already identical to that commit. The source's `.gitignore` (which ignores `dist/`) was not copied, so the export stays committed. |
| `npm run build` (root) | Passed: `npm --prefix web ci` then `vite build`, 1308 modules, three HTML pages and assets in `dist/` with `./` relative URLs. Rebuilt again after the final source change (`web/index.html` share tags). Package manifests and lockfiles unchanged. |
| `tsc --allowJs --noEmit --moduleResolution bundler` (TypeScript 5.9.3, via `npm exec`) on `web/src/chain.js`, `main.js`, `nft.js` | Exit 0. This checks syntax and module/import resolution only (`checkJs` off). The project is plain JavaScript with no TypeScript project or typecheck script. `node --check` also passed on the five changed scripts/sources. |
| Live Sepolia read (Node + viem, `https://ethereum-sepolia-rpc.publicnode.com`) | Garden `core()` = `0xfd6c…e0c4` and `sqk()` = `0xd78a…fa1e`, both matching `deployments.json`. The core's `configuration()` genesisTimestamp = `1793735400`, equal to the `GENESIS_TS` fallback. The garden's `squeekNft()` is zero, so holder plots are off. |
| Squeekchain API `/economy/state` from Node | Not verified: this machine gets a Cloudflare challenge page instead of JSON. |
| Playwright Chromium interaction run on `dist/` served at `/preview/` (39 checks) | 39/39 passed. No horizontal overflow on all three pages at 320/390/1440, and no missing local resources or script exceptions. Garden HUD readings loaded from chain (92,730 work, block 8,430). The page issued the new core `configuration()` call. Connect wallet is on the 390 first screen. With no wallet, clicking it shows "No browser wallet found…". The mute toggle, leaderboard tab, Garden→Guide→NFT navigation, Turkish and Arabic (`dir=rtl`) language switches and keyboard FAQ disclosure all worked. The NFT page shows collection `0xc4c7…856b`. |
| Console errors in that run | Only the cross-origin calls to `api.squeekchain.com` (`/status`, `/measurement/stats`, `/economy/state`), blocked from this machine by the Cloudflare challenge (no CORS header). The garden then shows "Can't reach the wheel right now / Using the last settled readings". The NFT page fell back to the deployment's collection, which is the same address. The API-success path of `fetchSqueekCollection` and the live wheel status remain unverified here. |
| `taste.mjs --out test/scratch/taste` (pinned probe) | Ran: 9/16 passed (render, layout, targets, eyebrows, slogans, repetition, copy budget, motion, share). Share went from failing to passing after adding `og:title`/`og:image`. Failures are listed below. |

### Better Interface coverage and findings

| Domain | Coverage / disposition |
| --- | --- |
| Accessibility | Checked: native buttons and select, keyboard FAQ, `aria-current` nav, `aria-selected` tabs, live regions on stage and toasts, page language and direction, targets (all ≥24px or spaced). No screen-reader or physical-device session, and no native 200% zoom. |
| Layout | Checked at 320/390/1440 on three pages: no overflow, overlap or clipped text (4 ellipsis truncations in HUD labels, e.g. "SETTLED …" at 390, reported by the probe). First screen at 390 confirmed in the screenshot. |
| Writing | Checked: no copy changed. The disconnected-wallet error is recoverable and names the next step. |
| Typography | Existing failures kept unchanged under the brief: 8–9 repeated sizes per width against a bar of 6, and four families (Pixelify Sans, system-ui, Segoe UI, ui-monospace). |
| Colors | Existing failures kept: 4.0:1 white on `--accent` (`web/src/style.css:218` `button.primary`, `:2375` current nav), 3.9:1 `.more-link` (`:2394`). 12 text boxes over art or gradients were not measured. |
| UI | Existing flags kept: border and shadow together on `button.primary`, `.stage-card` and `.field`; an empty leaderboard row styled as a card inside a card; uppercase and tracked HUD labels (`:695`) and the scene badge (`:649`); emoji in the how-it-works headings (`web/src/locales/en.js`) and mode icons (`web/src/main.js:42`). The motion probe passed. |

Findings and dispositions:

1. MEDIUM, fixed: `web/index.html` lacked `og:title` and `og:image`, so shared links did not unfurl. Added `og:type`, `og:title`, `og:description` and `og:image` (lines 8–11), rebuilt, and the probe's share check now passes.
2. MEDIUM, not fixed (brief says keep styles): Connect wallet and the current nav pill measure 4.0:1 and the guide link 3.9:1, below 4.5:1. The correction would be darkening `--accent` in `web/src/style.css:1`.
3. LOW, not fixed (brief says keep texts and styles): all-caps and tracked HUD labels, type-size and family count, emoji in headings, and border-plus-shadow chrome. These are long-standing parts of the pixel game style.

Not performed: real wallet connection, chain switch or signing (no wallet available; nothing was signed); `scripts/switch-core.js` (needs the owner key or a hardhat fork, and the live garden already points at the new core); WebKit/Firefox; screen reader; physical phones.

Completion: complete for the stated scope. The sync, rebuild and share metadata are done. The design gaps above already existed and are recorded, not claimed fixed. This is worker-side validation, not independent certification.

Design review used the pinned Better Interface guidance by Jakub Krehel (MIT); documentation organization follows the pinned Impeccable guidance by Paul Bakaus (Apache-2.0). No guide text or implementation was copied into the site.

## Revision validation — November 6, 2026

Scope: reproduce the three reviewer reports, correct the pantry wrapping defect, retain the 13 required source files exactly, and rebuild the existing static site. Review responses are in [`.imd-responses.json`](.imd-responses.json). Machine-readable measurements, source SHA-256 comparisons and check outcomes are in [`docs/revision/validation.json`](docs/revision/validation.json).

### Findings and dispositions

| Finding | Evidence and disposition |
| --- | --- |
| Pantry overlap, `0b804f72…` | **Fixed.** With live Sepolia pantry `33 / 150`, English at 320px had a count/“Moon Melon” overlap of 38.23×14.97px; Turkish at 390px had 41.89×14.97px; Spanish at 390px had a label/“Desbloquea” overlap of 16×5.30px. Deleted only the mobile `white-space: nowrap` rule formerly at `web/src/style.css:2237–2240`. After rebuilding, text-node ranges show zero pantry overlaps for all six languages at 320/360/390 (18/18). English 320px pantry height grows from 48.66px to 83.69px; no copy or size changes. |
| Open Graph fidelity, `ea2ce1f0…` | **Disputed.** A fresh upstream fetch confirms the four head lines are the only `web/index.html` difference. The task explicitly requires `og:title` and `og:image`; deleting all four would break that criterion. The accepted head remains unchanged in this revision, and share passes. An upstream metadata commit would resolve the competing fidelity requirement. |
| Unknown/loading states, `ba18d008…` | **Reproduced; in-place fix disputed.** With RPC delayed 4 seconds, at 1.5 seconds the stage reports “Can't reach the wheel right now”, pantry shows “0 snacks” and “Every seed is unlocked”, and the wallet container is empty. Garden top moves from 540.47px to 620.47px when data and the wallet button arrive. With RPC aborted while the live API succeeds, pantry still says all seeds are unlocked, the board falsely appears empty, and the read-failure toast appears. These branches are at `web/src/main.js:948`, `:1023`, `:1370` and wallet rendering at `:901`. The exact-copy requirement keeps `main.js` untouched. The upstream maintainer must correct these states and supply a new commit for a later sync. |

Before/after evidence: [English 320 before](docs/revision/en-320-before.png), [after](docs/revision/en-320-after.png); [Turkish 390 before](docs/revision/tr-390-before.png), [after](docs/revision/tr-390-after.png).

### Commands and actual results

| Check | Actual result |
| --- | --- |
| Fresh upstream comparison | All 13 named files are still byte-identical to `981426474da736cc6341b89777f6831a144cd69a`; hashes are in the validation JSON. README installation/dev preview/rebuild instructions remain exact. Production preview command: `npm --prefix web run preview`. |
| `npm run build` after the CSS deletion | Exit 0; 1308 modules; three HTML pages and complete assets in root `dist/`. Build configuration, manifests and lockfiles unchanged. npm reported two existing dependency vulnerabilities; no dependency updates were made. |
| `tsc --allowJs --noEmit --module esnext --moduleResolution bundler --target es2022 --skipLibCheck web/src/chain.js web/src/main.js web/src/nft.js` | TypeScript 5.9.3, exit 0. This checks syntax/import resolution, with `checkJs` off. |
| Same command with `--checkJs` | Exit 2, 112 diagnostics in existing JavaScript, including Vite `ImportMeta.env`/glob declarations and inferred DOM/data types. A full inferred-JS typecheck is **not clean**. No JavaScript, dependency or configuration changes were made to suppress diagnostics. |
| `PLAYWRIGHT_BROWSERS_PATH="$PWD/test/scratch/browsers" node test/scratch/validate.mjs` and `node test/scratch/extra.mjs` with the same browser path | 58/58 assertions passed: 56 functional/measurement assertions plus two assertions confirming the advisory bugs. The latter establish reproduction, not a fix. Normal-path console warnings/errors, script exceptions and missing local resources: zero. Scratch harnesses/dependencies are disposable and excluded from submission; retained results are in the validation JSON. |
| Primary interactions | Connect without an installed wallet gives the existing installation/open-in-wallet guidance; plot click requests a wallet; seed selection, sound toggle, leaderboard tab, all language picks, Arabic RTL, Garden→Guide→NFT navigation, keyboard FAQ disclosure, real neighbour visit through the form and return all worked. NFT collection is read at runtime, with the mint control explicitly disabled. Nothing was signed. |
| Responsive inspection | All 18 pantry cases have no text overlap. English Garden/Guide/NFT have no document overflow at 320/390/1440. Light 390×844 screenshots show the product and Connect wallet on the first screen; desktop 1440×900, Arabic 320 and dark 390 were also inspected. English dark pantry is clear at 320/390. |
| Pinned probe: `IMD_PLAYWRIGHT="$PWD/test/scratch/tooling/node_modules/playwright/index.mjs" PLAYWRIGHT_BROWSERS_PATH="$PWD/test/scratch/browsers" node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` | Ran unchanged: **9/16** pass — render, layout, targets, eyebrows, slogans, repetition, copy-budget, motion, share. Existing contrast, casing, tracking, type-sizes, type-faces, glyphs and chrome findings remain. The probe used direct browser networking and fallback readings; the separate live-data checks above establish pantry behavior. |

The supplied MCP browser could not launch (`Socket path too long`). Standalone Playwright Chromium 141 inspected the real export under `/preview/`. Direct browser external requests returned `ERR_EMPTY_RESPONSE`; forwarding those requests through `curl -A 'Mozilla/5.0'` returned HTTP 200 from the public RPC and Squeekchain `/status`, `/measurement/stats?range=7d` and `/economy/state`. Successful interactive runs used those live, unmodified responses, including the loaded pantry, leaderboard and NFT collection; no synthetic or replayed readings were used. Production network configuration is unchanged. Direct browser network/CORS success remains unverified.

### Better Interface coverage for the final revision

| Domain | Checked coverage and remaining limits |
| --- | --- |
| Accessibility | Native control names/states, language/direction, keyboard FAQ, selected seed/tab state and visible Connect wallet focus ring checked. No screen reader, native zoom, forced-colors or physical-device session. |
| Layout | Mobile pantry wrap measured in 18 cases with real data; English three-page reflow and mobile/desktop first-screen screenshots inspected. Turkish 320px still has pre-existing page overflow: stage width 318.44px at x=16, identical with the original nowrap rule restored. The other 17 locale/width cases have no document overflow. This unrelated layout behavior was left unchanged. |
| Writing | Labels/copy retained exactly; no new UI text. Advisory loading/failed-read statements were reproduced and remain an upstream limitation. |
| Typography | Pantry labels/counts wrap without clipping or font-size changes. Existing tabular-number, body/display stacks retained. Probe scale/family/casing/tracking flags remain under the preserve-styles scope. |
| Colors | Computed pantry text/background pairs measured: label/unlock 5.60:1 light, 6.28:1 dark; count 13.89:1 light, 13.60:1 dark. Existing 4.0:1 action/nav and 3.9:1 guide-link failures remain; art/gradient contrast was not remeasured. |
| UI | Existing surfaces, feedback and disabled mint state retained; sound, seed, board, navigation and visit states exercised. Probe reduced-motion check passes. Transaction pending/success/rejection states and slowed animation playback were not exercised. |

WebKit was installed but could not launch because required shared libraries were unavailable; WebKit and Firefox rendering remain unverified. Real wallet connection, chain switching, signing, contract migration, native 200% zoom and assistive-technology testing were not performed. Hosting/ENS/IPFS publication is after submission; this deliverable supplies the rebuilt `dist/` without claiming an updated live deployment.

Completion: the targeted pantry correction, production export and three review responses are complete. The upstream loading/failure defect, Turkish 320px page overflow, inferred-JS typecheck diagnostics and listed browser/accessibility gaps remain documented. No data, assets, measurements or check results were fabricated.
