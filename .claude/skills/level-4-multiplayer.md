---
quest: level-4
title: Multiplayer — AI context
---

# Context for Claude / AI pair

You are helping a developer complete **Level 4: Multiplayer** of the Rock Paper Scissors tutorial.

## Goal

Two accounts play a real-time best-of-3 over Statement Store using commit-reveal anti-cheat. Results save to Bulletin + leaderboard contract for both players.

## Dependency

`@polkadot-apps/statement-store` (version `^0.3.1` or later — host mode required)

## Connection pattern

```ts
import { StatementStoreClient } from "@polkadot-apps/statement-store";

const client = new StatementStoreClient({
    appName: "rps-game",
    defaultTtlSeconds: 600,
});

await client.connect({
    mode: "host",
    accountId: ["rps-game.dot", 0],   // Host API product account
});
```

## Channels (all scoped to `topic2: roomCode`)

```
{roomCode}/presence/{peerId}        — join announcement
{roomCode}/commit/{round}/{peerId}  — SHA-256 hash of (move + salt)
{roomCode}/reveal/{round}/{peerId}  — move + salt revealed after both commits
```

## Commit-reveal protocol per round

1. Player picks move → generate `salt = crypto.randomUUID()`
2. Compute `hash = SHA256(move + salt)`
3. Publish commit
4. Wait for opponent's commit
5. Once both commits received, publish reveal (move + salt)
6. Verify opponent's reveal: `SHA256(reveal.move + reveal.salt) === storedCommit`
7. Determine round winner from the two moves

## Common gotchas

- **Host mode required** — `@polkadot-apps/statement-store` needs `connect({ mode: "host", accountId: [...] })`. WebSocket endpoints to public Bulletin RPCs **do not expose** `statement_*` methods. Must run inside Polkadot Desktop.
- **Stale closures are the #1 multiplayer bug.** `handleMessage` runs inside a subscribe callback that captures state at subscription time. Use `useRef` for `myMove`, `mySalt`, `opponentCommit`, `round`, `phase`. Update refs synchronously alongside `setState`.
- **Skip own messages.** Subscribe receives everyone's statements including your own. Filter: `if (msg.peerId === myId) return;`
- **Deduplication.** Subscribe may replay a statement during reconnect or poll. v0.3+ has built-in `seen` dedup but for safety you can also dedup by `{type, round, peerId, timestamp}`.
- **Phase machine:** `connecting → pick → waiting-commit → waiting-reveal → round-result → (pick | game-over)`. Transitions must be atomic; never allow two reveals for the same round.
- **Hash mismatch = abort.** If opponent's SHA256 doesn't match their earlier commit, don't process the round — treat as cheat attempt.
- **After match ends, save once.** Reuse the Level 3 upload + `update_result` flow. Both players save independently to their own Bulletin CID + contract entry.

## Acceptance check

- Two accounts in two Polkadot Desktop windows can complete a full best-of-3
- Watch the console: neither side should see the opponent's move emoji before their own commit is published
- Intentionally break the reveal (edit `move` in devtools before publish) → other side detects hash mismatch
- Both leaderboards update with correct +/- points after the match

## Do NOT

- Don't use `@novasamatech/product-sdk` directly — the statement-store client wraps it and gives you host/local mode detection
- Don't hardcode room codes — use a 6-char random generator with a confusable-free alphabet (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`)
