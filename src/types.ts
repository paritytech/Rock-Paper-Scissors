export type Move = "rock" | "paper" | "scissors";

export type RoundResult = "win" | "loss" | "draw";

export interface Round {
    playerMove: Move;
    opponentMove: Move;
    result: RoundResult;
}

export interface GameData {
    id: number;
    rounds: Round[];
    result: RoundResult;
    pointsChange: number;
    timestamp: number;
}

export interface PlayerData {
    player: string;
    totalGames: number;
    wins: number;
    losses: number;
    draws: number;
    points: number;
    games: GameData[];
}
