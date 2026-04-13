import { useState } from "react";
import type { Move, Round, RoundResult } from "../types.ts";
import {
    determineWinner, pointsForResult, randomMove,
    appendGame,
} from "../utils.ts";

const MOVE_EMOJI: Record<Move, string> = { rock: "\u270A", paper: "\u270B", scissors: "\u2702\uFE0F" };
const RESULT_TEXT: Record<RoundResult, string> = { win: "You win!", loss: "You lose!", draw: "Draw!" };
const BEST_OF = 3;

export default function SoloGame({ account, onDone }: {
    account: { address: string };
    onDone: () => void;
}) {
    const [rounds, setRounds] = useState<Round[]>([]);
    const [currentRound, setCurrentRound] = useState<Round | null>(null);
    const [gameOver, setGameOver] = useState(false);
    const [saved, setSaved] = useState(false);

    const playerWins = rounds.filter(r => r.result === "win").length;
    const computerWins = rounds.filter(r => r.result === "loss").length;
    const roundNumber = rounds.length + 1;

    const overallResult: RoundResult = playerWins > computerWins ? "win" : computerWins > playerWins ? "loss" : "draw";
    const pts = pointsForResult(overallResult);

    const pickMove = (move: Move) => {
        if (currentRound || gameOver) return;

        const opponentMove = randomMove();
        const result = determineWinner(move, opponentMove);
        const round: Round = { playerMove: move, opponentMove, result };

        setCurrentRound(round);

        setTimeout(() => {
            const newRounds = [...rounds, round];
            setRounds(newRounds);
            setCurrentRound(null);

            const w = newRounds.filter(r => r.result === "win").length;
            const l = newRounds.filter(r => r.result === "loss").length;
            const needed = Math.ceil(BEST_OF / 2);

            if (w >= needed || l >= needed || newRounds.length >= BEST_OF) {
                setGameOver(true);
                // Auto-save to localStorage
                const finalResult: RoundResult = w > l ? "win" : l > w ? "loss" : "draw";
                const finalPts = pointsForResult(finalResult);
                appendGame(account.address, {
                    rounds: newRounds,
                    result: finalResult,
                    pointsChange: finalPts,
                    timestamp: Math.floor(Date.now() / 1000),
                });
                setSaved(true);
            }
        }, 1500);
    };

    return (
        <div className="game-page">
            <h2>Solo - Best of {BEST_OF}</h2>

            <div className="score-display">
                <div>You: <span>{playerWins}</span></div>
                <div>Round <span>{Math.min(roundNumber, BEST_OF)}</span>/{BEST_OF}</div>
                <div>CPU: <span>{computerWins}</span></div>
            </div>

            {currentRound && (
                <div className="round-result">
                    <div className="round-result-moves">
                        <span>{MOVE_EMOJI[currentRound.playerMove]}</span>
                        <span className="round-result-vs">VS</span>
                        <span>{MOVE_EMOJI[currentRound.opponentMove]}</span>
                    </div>
                    <div className={`round-result-text ${currentRound.result}`}>
                        {RESULT_TEXT[currentRound.result]}
                    </div>
                </div>
            )}

            {!gameOver && !currentRound && (
                <div className="move-picker">
                    {(["rock", "paper", "scissors"] as Move[]).map(m => (
                        <div key={m}>
                            <button className="move-btn" onClick={() => pickMove(m)}>
                                {MOVE_EMOJI[m]}
                            </button>
                            <div className="move-label">{m}</div>
                        </div>
                    ))}
                </div>
            )}

            {gameOver && (
                <div className="round-result">
                    <div className={`round-result-text ${overallResult}`} style={{ fontSize: 24, marginBottom: 8 }}>
                        {overallResult === "win" ? "You won the match!" :
                         overallResult === "loss" ? "You lost the match!" : "Match drawn!"}
                    </div>
                    <div style={{ fontSize: 14, color: "var(--text2)", marginBottom: 16 }}>
                        {playerWins} - {computerWins} ({pts > 0 ? `+${pts}` : pts} pts)
                    </div>

                    <div className="history-card-rounds" style={{ justifyContent: "center", marginBottom: 16 }}>
                        {rounds.map((r, i) => (
                            <span key={i} className="round-badge">
                                {MOVE_EMOJI[r.playerMove]} vs {MOVE_EMOJI[r.opponentMove]}
                            </span>
                        ))}
                    </div>

                    {saved && <div className="status" style={{ color: "var(--success)" }}>Saved to local storage</div>}

                    <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                        <button className="btn btn-primary" onClick={onDone}>
                            Home
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
