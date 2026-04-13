# RPS Game

Minimalistic rock-paper-scissors game. Log in with a Host API account, play solo against the computer, results are saved to localStorage.

## Tech Stack

- **React 19** + **Vite** + **TypeScript**
- **`@polkadot-apps/signer`** — Host API login
- **localStorage** — game history persistence (per account)

## How it works

1. Auto-connect via Host API — the selected account's address is the profile key
2. Play best-of-3 against the computer
3. Result is stored in `localStorage` under key `rps-game:<address>` as JSON

Switching accounts swaps the visible profile — each account has its own local history.

## Running

```bash
npm install
npm run dev
```

Runs on `http://localhost:5173`. Must be opened inside a Polkadot Desktop container for Host API login.

## Structure

```
src/
├── App.tsx                  # Routing + account selector
├── utils.ts                 # SignerManager + localStorage helpers
├── types.ts                 # Move, Round, GameData, PlayerData
└── pages/
    ├── Home.tsx             # Mode picker + profile
    ├── MyProfile.tsx        # Stats + history (from localStorage)
    └── SoloGame.tsx         # Solo match vs computer
```
