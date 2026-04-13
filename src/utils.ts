import { useState, useEffect } from "react";
import { SignerManager, type SignerState } from "@polkadot-apps/signer";
import type { Move, RoundResult, PlayerData, GameData } from "./types.ts";

// ---------------------------------------------------------------------------
// Signer Manager (Host API)
// ---------------------------------------------------------------------------

export const signerManager = new SignerManager({ dappName: "rps-game" });

export function useSignerState(): SignerState {
    const [state, setState] = useState<SignerState>(signerManager.getState());
    useEffect(() => signerManager.subscribe(setState), []);
    return state;
}

// ---------------------------------------------------------------------------
// Game helpers
// ---------------------------------------------------------------------------

export const short = (addr: string) => addr.slice(0, 6) + "..." + addr.slice(-4);

export function determineWinner(player: Move, opponent: Move): RoundResult {
    if (player === opponent) return "draw";
    if (
        (player === "rock" && opponent === "scissors") ||
        (player === "paper" && opponent === "rock") ||
        (player === "scissors" && opponent === "paper")
    ) {
        return "win";
    }
    return "loss";
}

export function pointsForResult(result: RoundResult): number {
    if (result === "win") return 2;
    if (result === "loss") return -1;
    return 0;
}

const MOVES: Move[] = ["rock", "paper", "scissors"];

export function randomMove(): Move {
    return MOVES[Math.floor(Math.random() * 3)];
}

// ---------------------------------------------------------------------------
// LocalStorage persistence
// ---------------------------------------------------------------------------

const STORAGE_PREFIX = "rps-game:";

export function loadPlayerData(address: string): PlayerData {
    try {
        const raw = localStorage.getItem(STORAGE_PREFIX + address);
        if (raw) return JSON.parse(raw);
    } catch { /* fall through */ }
    return {
        player: address,
        totalGames: 0, wins: 0, losses: 0, draws: 0, points: 0,
        games: [],
    };
}

export function savePlayerData(data: PlayerData) {
    localStorage.setItem(STORAGE_PREFIX + data.player, JSON.stringify(data));
}

export function appendGame(address: string, game: Omit<GameData, "id">): PlayerData {
    const data = loadPlayerData(address);
    const fullGame: GameData = { ...game, id: data.games.length + 1 };
    data.games.push(fullGame);
    data.totalGames++;
    if (game.result === "win") data.wins++;
    else if (game.result === "loss") data.losses++;
    else data.draws++;
    data.points += game.pointsChange;
    savePlayerData(data);
    return data;
}
