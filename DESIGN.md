# Squeek Garden design and wording validation

## Overview

Squeek Garden is an existing pixel farming game on Ethereum Sepolia. Its cottage scene, grass plots and snack sprites carry the visual identity; plain interface text explains readings and transactions. This document records the existing implementation.

The November 6, 2026 update syncs the site with the source repository `0xyvz/squeek-garden` at commit `981426474da736cc6341b89777f6831a144cd69a` after Squeekchain reinstalled its Sepolia contracts. `README.md`, `scripts/squeekchain.js`, the new `scripts/switch-core.js`, `web/src/chain.js`, `web/src/main.js`, `web/src/nft.js`, `web/src/deployments.json` and the six `web/src/locales/*.js` files are byte-for-byte copies of that commit (the locales were already identical). At runtime the garden page now reads round 0 from the garden's current SqueekCore (`configuration()`, `web/src/chain.js:128`), falling back to `GENESIS_TS = 1793735400` (`web/src/main.js:40`). The NFT page reads the current Squeek collection from the Squeekchain API (`web/src/chain.js:138`) and falls back to `deployments.json`. The garden stays at `0xc97FcB52230CC29B37D458bF64818e1550395D6E`. Texts, styles and game rules are unchanged. The only other source edit adds share metadata to `web/index.html:8-11` (see Components).

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

## Validation record

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
