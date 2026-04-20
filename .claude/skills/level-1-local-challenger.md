---
quest: level-1
title: Local Challenger — AI context
---

# Context for Claude / AI pair

You are helping a developer complete **Level 1: Local Challenger** of the Rock Paper Scissors tutorial.

## Starting state

- Host API login via `@polkadot-apps/signer`
- Best-of-3 vs computer
- Results saved in `localStorage` under key `rps-game:<h160Address>`
- Profile card showing W/L/D, win rate, last 10 games
- No smart contracts, no Bulletin, no Statement Store

## Goal

The developer should ship a **modded** version of the starting app to their own `.dot` domain. Modding can be visual (theming, emoji sets) or behavioral (computer "personality", trash-talk, sound effects). Contract/chain changes are explicitly **out of scope** for this level.

## Relevant files

- `src/pages/SoloGame.tsx` — move picker, round logic, match save
- `src/pages/MyProfile.tsx` — reads from localStorage
- `src/pages/Home.tsx` — landing page
- `src/App.css` — dark-theme CSS variables (easy to retheme)
- `src/utils.ts` — `randomMove()`, `determineWinner()`, `appendGame()`

## Packages in play

- `@polkadot-apps/signer` (only dependency beyond React)

## Common gotchas

- **Host API login only works inside Polkadot Desktop.** Don't suggest extension or browser fallbacks — they're intentionally removed for this level.
- **localStorage keys are per-account** (`rps-game:<address>`). Switching accounts swaps the profile.
- **Don't prompt to add contracts/Bulletin** — that's Level 2 / Level 3 territory.
- `dot deploy` can OOM on large bundles. If the user hits this, fall back to `bulletin-deploy ./dist <name>.dot`.

## Ship checklist

1. `npm run build` produces `dist/`
2. `dot deploy` (or `bulletin-deploy ./dist <name>.dot`)
3. Open `<name>.dot` inside Polkadot Desktop to verify
