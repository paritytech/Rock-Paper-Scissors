import { useState, useEffect } from "react";
import { loadPlayerData, short } from "../utils.ts";
import type { PlayerData, Move } from "../types.ts";

const MOVE_EMOJI: Record<Move, string> = { rock: "\u270A", paper: "\u270B", scissors: "\u2702\uFE0F" };

export default function MyProfile({ account, refreshKey }: {
    account: { address: string };
    refreshKey?: number;
}) {
    const [data, setData] = useState<PlayerData | null>(null);
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        setData(loadPlayerData(account.address));
    }, [account.address, refreshKey]);

    if (!data || data.totalGames === 0) {
        return (
            <div className="profile-card">
                <div className="profile-header">
                    <div className="profile-address">{short(account.address)}</div>
                </div>
                <div className="profile-empty">No games yet — play your first match!</div>
            </div>
        );
    }

    const winRate = data.totalGames > 0 ? Math.round((data.wins / data.totalGames) * 100) : 0;

    return (
        <div className="profile-card">
            <div className="profile-header" onClick={() => setExpanded(!expanded)} style={{ cursor: "pointer" }}>
                <div>
                    <div className="profile-address">{short(account.address)}</div>
                    <div className="profile-points">
                        {data.points > 0 ? `+${data.points}` : data.points} pts
                    </div>
                </div>
                <div className="profile-stats-mini">
                    <span className="profile-stat-win">{data.wins}W</span>
                    <span className="profile-stat-loss">{data.losses}L</span>
                    <span className="profile-stat-draw">{data.draws}D</span>
                    <span className="profile-stat-rate">{winRate}%</span>
                    <span className="profile-expand">{expanded ? "\u25B2" : "\u25BC"}</span>
                </div>
            </div>

            {expanded && (
                <div className="profile-games">
                    {data.games.slice().reverse().slice(0, 10).map(game => (
                        <div key={game.id} className="profile-game-row">
                            <span className="profile-game-mode">vs CPU</span>
                            <span className="profile-game-rounds">
                                {game.rounds.map((r, i) => (
                                    <span key={i} title={`${r.playerMove} vs ${r.opponentMove}`}>
                                        {MOVE_EMOJI[r.playerMove]}
                                    </span>
                                ))}
                            </span>
                            <span className={`profile-game-result ${game.result}`}>
                                {game.result === "win" ? "W" : game.result === "loss" ? "L" : "D"}
                            </span>
                            <span className="profile-game-pts">
                                {game.pointsChange > 0 ? `+${game.pointsChange}` : game.pointsChange}
                            </span>
                        </div>
                    ))}
                    {data.games.length > 10 && (
                        <div className="profile-more">...and {data.games.length - 10} more</div>
                    )}
                </div>
            )}
        </div>
    );
}
