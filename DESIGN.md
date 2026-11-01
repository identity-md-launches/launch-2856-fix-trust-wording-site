# Squeek Garden design and wording validation

## Overview

Squeek Garden is an existing pixel farming game on Ethereum Sepolia. Its cottage scene, grass plots and snack sprites carry the visual identity; plain interface text explains readings and transactions. This document records the existing implementation. The November 1, 2026 update changes only `faq.a3` and `guide.intro` in English, Turkish, Spanish, Chinese, Hindi and Arabic, then rebuilds `dist/`.

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

Measured on the rendered guide's solid card background, the introduction has 13.89:1 contrast in light and 13.60:1 in dark; the expanded FAQ answer has 5.60:1 and 6.28:1 respectively. These measurements apply to the two edited paragraphs, not the whole site.

## Typography

Body copy uses `16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`. Guide paragraphs and lists use a 1.6 line height. `--display` requests `"Pixelify Sans", system-ui, sans-serif`, loaded by the existing Google Fonts stylesheet at weights 500, 600 and 700. It serves headings and selected game labels. The page remains usable with system fallbacks when fonts are unavailable.

Shared headings are 1.6rem/700 (`h1`), 1.25rem/600 (`h2`) and 1.05rem/600 (`h3`). The guide introduction is 1.02rem, its contents links 0.85rem, and FAQ paragraphs inherit the 16px body size. `--num` uses Segoe UI/system fallbacks with tabular figures; addresses and code use monospace. The incumbent game has additional sizes; it does not meet the probe's six-size target.

## Layout

`web/src/style.css:108` constrains shared header, main and footer content to 1180px with 16px horizontal padding. Main sections have an 18px gap; cards have 18px padding. The guide's `.doc` is at most 920px wide. Its contents navigation wraps, paragraphs have natural height, and FAQ answers expand in document flow.

The garden's `.play` grid has a flexible field and 340px seed sidebar. At 980px it becomes one column; at 760px the lower panels and guide grids become one column and the garden uses three plot columns. At 520px the wallet moves to a full row, navigation becomes more compact and seed cards reduce their artwork column. Arabic sets document `dir="rtl"`; scene, field, addresses and numeric readings preserve their intended direction.

The revised guide was measured at 320, 390, 768 and 1440px in every locale: no horizontal overflow or clipping of either edited paragraph. Garden and NFT pages were also checked at 390px in each language. At 390×844, Connect wallet and the start of the garden are visible on the first screen.

## Elevation & Depth

Cards use `--shadow`: two warm translucent layers in light mode and a small black shadow in dark mode. `.stage-card` and `.field` use a 4px dark brown border and a 6px downward shadow, matching the pixel artwork. Primary controls use a 3px downward accent shadow, reduced when pressed. These existing border-and-shadow combinations were preserved.

## Shapes

`--radius` is 18px for cards, controls generally use 12px, seed cards 14px, stage and field frames 10px. Navigation and language controls use pill shapes. The field and scene retain crisp pixel rendering.

## Components

- `web/src/nav.js` / `.nav`: shared Garden, Guide and NFT links; the current page uses `aria-current="page"` and the accent fill.
- `web/src/i18n.js` / `.lang-select`: native language select with browser-language fallback, saved selection, page reload, and document language/direction updates. Dictionaries live in `web/src/locales/`.
- `web/guide.html` / `.doc-hero`, `.doc-toc`, `.doc-section`: reading cards, wrapping anchor links and native `details`/`summary` questions. Enter toggles the FAQ and exposes the complete answer without a fixed height.
- `web/src/main.js`: wallet entry, plot buttons, selected seed packets, leaderboard tabs, sound toggle and transaction/error feedback. The unconnected actions show the existing wallet instructions; transaction behavior was not changed.
- `web/src/style.css:2143`: reduced-motion override shortens animations and transitions. The probe found no infinite animations still running with this preference.

## Do's and Don'ts

Reuse the existing shared navigation, cards, tokens and full-string locale dictionaries when adding a page. Keep complete passages together for translation, retain natural wrapping, and set language and direction through `initNav()`. Keep addresses and game readings separate from display typography. This wording repair leaves other copy, styles, game rules, contract addresses, wallet logic, build configuration and dependencies unchanged.

## Validation record

The existing README documents installation, the local Vite preview (`npm run web`) and rebuilding. A production-only preview can also be run with `npm --prefix web run preview -- --host 127.0.0.1` after building.

Actual checks performed on November 1, 2026:

| Check | Result |
| --- | --- |
| `npm --prefix web ci --cache /tmp/imd-wording-npm-cache --ignore-scripts --no-audit --no-fund` | Passed; recovered from the initial Vite executable permission failure. Package manifests and lockfiles unchanged. |
| `npm --prefix web run build` | Passed; all three HTML pages and required assets exported to root `dist/` with Vite's existing `base: "./"`. |
| `npm exec --yes --cache /tmp/imd-wording-npm-cache --package typescript@5.9.3 -- tsc --allowJs --checkJs --noEmit --target ES2022 --module ESNext --moduleResolution bundler web/src/locales/en.js web/src/locales/tr.js web/src/locales/es.js web/src/locales/zh.js web/src/locales/hi.js web/src/locales/ar.js` | Passed, scoped to the six edited JavaScript dictionaries. The existing site has no TypeScript project or typecheck script. |
| `node test/scratch/check-copy.mjs` | Passed: exactly the two requested values changed in each locale; all other locale bytes and keys preserved. English replacement matches the request exactly. |
| `PLAYWRIGHT_BROWSERS_PATH=/opt/imd-tools/ms-playwright node test/scratch/browser-check.mjs` | Passed in Chromium, serving `dist/` at `/preview/`: all six language-picker choices and persistence, exact revised text, Arabic direction, FAQ keyboard opening/closing, navigation between all three pages, missing-wallet and unsigned-plot errors, sound toggle and leaderboard selection. All 36 layout measurements passed; zero JavaScript errors, missing local resources or external request failures during this run. No transactions were signed. |
| Pinned `taste.mjs --out test/scratch/taste` with the provided Playwright module and browser path | Ran successfully: 7/16 checks passed. Render, layout, targets, slogans, repetition, copy budget and reduced motion passed. Existing design failures are listed below. |
| Export integrity | HTML unchanged except generated chunk hashes; production CSS and all runtime artwork byte-for-byte unchanged; relative asset references resolve. |

Browser screenshots were inspected at `test/scratch/taste/shots/390.png` and `1440.png`, the six expanded `test/scratch/interactions/faq-<locale>-390.png` captures, and representative guide introductions including Arabic and Hindi. Scratch scripts, screenshots and raw reports are temporary validation evidence and are not part of the delivery.

### Better Interface coverage and findings

| Domain | Coverage / disposition |
| --- | --- |
| Accessibility | Checked native language controls, FAQ keyboard toggle and visible native summary focus in screenshots; page language/direction, wallet error paths and probe targets. No screen-reader or physical-device session. |
| Layout | Checked all edited passages at four widths in six locales, plus 390px garden/NFT navigation; no new overflow, clipping or overlap. First-screen product and connect action confirmed. Native 200% browser zoom was not tested. |
| Writing | Fixed misleading trust language at `web/src/locales/en.js:283` and `:341` and corresponding values in the other five dictionaries. FAQ now describes migration after a reinstall and preserved progress; introduction qualifies manual acceleration. Scope guard verified every other value unchanged. |
| Typography | Longer passages wrap in all six languages. Existing size/family failures remain: the probe recorded 11 recurring sizes per width and four computed families (`web/src/style.css:90`, `:2330`). |
| Colors | Revised paragraphs pass 4.5:1 in light and dark. Existing game-label contrast failures remain, including the free-seed badge at 3.4:1 (`web/src/style.css:1743`). Artwork/gradient text contrast was not fully measured. |
| UI | Checked FAQ disclosure, language reload, navigation/current page, sound, selected leaderboard and disconnected action feedback. Existing chrome and glyph flags remain (`web/src/style.css:172`, `:603`, `web/src/main.js:908`). Motion probe passed; no slow-motion animation review. |

The nine failed probe categories are contrast, casing, tracking, eyebrows, type sizes, type families, glyphs, chrome and share metadata. Uppercase/tracked HUD labels originate at `web/src/style.css:695`; the scene badge above the status at `:649` produces the eyebrow flag. The initial HTML already has a title, favicon and description but lacks `og:title` and `og:image` (`web/index.html:3`). These unchanged findings are recorded because the assignment explicitly prohibits other text/style changes; they are not claimed fixed.

The browser connector returned `Transport closed`; the supplied local Playwright Chromium runner provided the rendered checks instead. WebKit could not launch because its executable is unavailable. Wallet connection with a real provider, chain switching, signing, screen-reader output, physical phones, native zoom and offline external-font/API behavior remain unverified.

The requested wording correction and rebuild are complete. The broader pre-existing design and metadata gaps remain as documented. This is worker-side validation, not independent certification.

Design review used the pinned Better Interface guidance by Jakub Krehel (MIT); documentation organization follows the pinned Impeccable guidance by Paul Bakaus (Apache-2.0). No guide text or implementation was copied into the site.
