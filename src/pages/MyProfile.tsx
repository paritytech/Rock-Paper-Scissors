import { useState, useEffect } from "react";
import { getContract, short, IPFS_GATEWAY } from "../utils.ts";
import type { PlayerData, Move } from "../types.ts";

const MOVE_EMOJI: Record<Move, string> = { rock: "\u270A", paper: "\u270B", scissors: "\u2702\uFE0F" };

export default function MyProfile({ account }: {
    account: { address: string; h160Address: string };
}) {
    const [data, setData] = useState<PlayerData | null>(null);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const lb = getContract();
                if (!lb) { setLoading(false); return; }

                console.log("[Profile] Checking registration for", account.h160Address);
                const regRes = await lb.isRegistered.query(account.h160Address);
                console.log("[Profile] isRegistered:", regRes);
                if (!regRes.success || !regRes.value) {
                    setLoading(false);
                    return;
                }

                console.log("[Profile] Fetching CID...");
                const cidRes = await lb.getPlayerCid.query(account.h160Address);
                console.log("[Profile] getPlayerCid:", cidRes);
                if (!cidRes.success || !cidRes.value || cancelled) {
                    // Registered but no games yet
                    console.log("[Profile] Fetching points...");
                    const ptsRes = await lb.getPlayerPoints.query(account.h160Address);
                    console.log("[Profile] getPlayerPoints:", ptsRes);
                    if (!cancelled) {
                        setData({
                            player: account.h160Address,
                            totalGames: 0, wins: 0, losses: 0, draws: 0,
                            points: ptsRes.success ? Number(ptsRes.value) : 0,
                            games: [],
                        });
                    }
                    setLoading(false);
                    return;
                }

                console.log("[Profile] Fetching data from Bulletin:", cidRes.value);
                const resp = await fetch(IPFS_GATEWAY + cidRes.value);
                if (resp.ok && !cancelled) {
                    const pd = await resp.json();
                    console.log("[Profile] Player data loaded:", pd.totalGames, "games");
                    setData(pd);
                }
            } catch (err) {
                console.error("[Profile] Error:", err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [account.h160Address]);

    if (loading) {
        return <div className="profile-card"><div className="spinner">Loading profile...</div></div>;
    }

    if (!data) {
        return (
            <div className="profile-card">
                <div className="profile-header">
                    <div className="profile-address">{short(account.h160Address)}</div>
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
                    <div className="profile-address">{short(account.h160Address)}</div>
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

            {expanded && data.games.length > 0 && (
                <div className="profile-games">
                    {data.games.slice().reverse().slice(0, 10).map(game => (
                        <div key={game.id} className="profile-game-row">
                            <span className="profile-game-mode">{game.mode === "solo" ? "vs CPU" : "vs " + short(game.opponent)}</span>
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

            {expanded && data.games.length === 0 && (
                <div className="profile-empty">No games yet</div>
            )}
        </div>
    );
}
