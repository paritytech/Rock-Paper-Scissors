---
quest: level-3
title: The Leaderboard — AI context
---

# Context for Claude / AI pair

You are helping a developer complete **Level 3: The Leaderboard** of the Rock Paper Scissors tutorial.

## Goal

Deploy a Rust/PVM contract on Paseo Asset Hub that indexes players by address. Contract stores `(cid, points)` per player; games themselves stay on Bulletin.

## Prerequisite check

Before writing code, confirm the dev has:
- `rustup` installed
- `cdm` CLI installed and on PATH
- An Asset Hub account funded with PAS (Asset Hub faucet: `https://faucet.polkadot.io/`)

## Contract shape (`contracts/leaderboard/lib.rs`)

```rust
#[pvm::storage]
struct Storage {
    player_count: u64,
    player_at: Mapping<u64, [u8; 20]>,
    is_registered: Mapping<[u8; 20], bool>,
    player_cid: Mapping<[u8; 20], String>,
    player_points: Mapping<[u8; 20], i64>,
}

#[pvm::contract(cdm = "@example/leaderboard")]
mod leaderboard {
    fn register() -> u64 { /* ... */ }
    fn update_result(new_cid: String, points_delta: i64) { /* ... */ }
    fn get_player_count() -> u64 { /* ... */ }
    fn get_player_at(index: u64) -> [u8; 20] { /* ... */ }
    fn get_player_cid(player: [u8; 20]) -> String { /* ... */ }
    fn get_player_points(player: [u8; 20]) -> i64 { /* ... */ }
    fn is_registered(player: [u8; 20]) -> bool { /* ... */ }
}
```

## Build + deploy flow

```bash
cdm build
cdm deploy -n paseo
cdm install @example/leaderboard -n paseo   # writes cdm.json + .cdm/cdm.d.ts
```

## Frontend integration

```ts
import { createCdm } from "@dotdm/cdm";
import cdmJson from "../cdm.json";
const cdm = createCdm(cdmJson);
const lb = cdm.getContract("@example/leaderboard");

// Query (read-only)
const pts = await lb.getPlayerPoints.query(account.h160Address);

// Tx (write)
await lb.updateResult.tx(newCid, BigInt(pointsDelta), {
    signer: account.getSigner(),
    origin: account.address,
});
```

## Common gotchas

- **First-time account mapping is required.** Before first tx, call `Revive.map_account()`:
  ```ts
  const mapped = await cdm.inkSdk.addressIsMapped(account.address);
  if (!mapped) await api.tx.Revive.map_account().signAndSubmit(account.getSigner());
  ```
- **H160 vs SS58:** the contract keys by `account.h160Address` (EVM-style, 20 bytes). Use `account.address` (SS58) only for `origin` / signing.
- **Gas stipend / payment errors:** "Invalid::Payment" means the deployer or caller has no PAS on Asset Hub. Fund via faucet.
- **Points can be negative** (i64) — losses subtract. Don't use `u64`.
- **The contract is the index, Bulletin is the data.** Don't put game JSON on-chain — store the CID only.
- **`register()` must be called once per player** before any `update_result()`. Check `isRegistered()` first; auto-register on first save.

## Acceptance check

- New player triggers exactly one `register()` call, then subsequent `update_result()` per match
- Switching browsers with the same account pulls points from the contract and games from Bulletin
- Leaderboard page lists all registered players sorted by points

## Do NOT

- Don't add multiplayer yet — Level 4
- Don't try to store game round data on-chain — too expensive, stays on Bulletin
