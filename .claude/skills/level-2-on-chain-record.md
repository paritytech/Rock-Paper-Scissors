---
quest: level-2
title: On-Chain Record — AI context
---

# Context for Claude / AI pair

You are helping a developer complete **Level 2: On-Chain Record** of the Rock Paper Scissors tutorial.

## Goal

Move the game history JSON itself to Bulletin Chain (content-addressed). Keep a **CID pointer in localStorage** per account (`rps-game-cid:<address>`) so the app can resolve the latest history back to the player on reload. In Level 3, this pointer moves out of localStorage and into the leaderboard smart contract.

## What to add

1. **Dependency:** `@polkadot-apps/bulletin`
2. **Singleton in `utils.ts`:**
   ```ts
   let _client: BulletinClient | null = null;
   export async function getBulletinClient() {
       if (!_client) _client = await BulletinClient.create("paseo");
       return _client;
   }
   ```
3. **Upload helper:**
   ```ts
   const bytes = new TextEncoder().encode(JSON.stringify(playerData));
   const { cid } = await client.upload(bytes);
   ```
4. **CID pointer in localStorage** (this is the key addition for Level 2):
   ```ts
   const CID_KEY = (addr: string) => `rps-game-cid:${addr}`;
   localStorage.setItem(CID_KEY(account.h160Address), cid);
   // on load:
   const cid = localStorage.getItem(CID_KEY(account.h160Address));
   ```
   This keeps each account's latest CID tracked locally so the app knows which Bulletin blob to fetch. In Level 3 this pointer moves on-chain via `leaderboard.update_result(cid, ...)`.
5. **Read flow:** read CID from localStorage → fetch `https://paseo-ipfs.polkadot.io/ipfs/<cid>` → `.json()` → render profile
6. **Write flow per match:** fetch existing CID (if any) → fetch JSON → append new game → upload new JSON → write new CID to localStorage

## Common gotchas

- `BulletinClient.create("paseo")` works inside Polkadot Desktop (Host API). Standalone will need `getChainAPI()` setup or the Host API preimage path.
- Uploads are signed extrinsics — the selected account pays tx fees on the Bulletin chain. The **Bulletin faucet** is separate from the Asset Hub faucet. If user gets "insufficient balance on Bulletin", point them to `https://paritytech.github.io/polkadot-bulletin-chain/authorizations?tab=faucet`.
- JSON payload must stay under the Bulletin size cap (~1 MB). History grows with each game but typically stays small; no need to paginate at this level.
- CIDs are **deterministic** — re-uploading identical bytes returns the same CID.

## Acceptance check

- Log the CID, paste it into the gateway URL, confirm JSON is readable

## Do NOT

- Don't add a smart contract yet — Level 3
- Don't add multiplayer — Level 4
