import { useState, useEffect } from "react";
import { getContract, short } from "../utils.ts";
import type { LeaderboardEntry } from "../types.ts";

export default function Leaderboard({ onPlayerClick }: {
    onPlayerClick: (address: string) => void;
}) {
    const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const lb = getContract();
                if (!lb) {
                    setLoading(false);
                    return;
                }

                const countRes = await lb.getPlayerCount.query();
                if (!countRes.success || cancelled) return;
                const count = Number(countRes.value);

                const items: LeaderboardEntry[] = [];
                for (let i = 0; i < count; i++) {
                    if (cancelled) return;
                    const addrRes = await lb.getPlayerAt.query(BigInt(i));

                    if (!addrRes.success) continue;
                    const addrBytes: Uint8Array = addrRes.value.asBytes();
                    const address = "0x" + [...addrBytes].map((b: number) => b.toString(16).padStart(2, "0")).join("");

                    const pRes = await lb.getPlayerPoints.query(address);
                    const points = pRes.success ? Number(pRes.value) : 0;

                    items.push({ address, points, rank: 0 });
                }

                // Sort by points descending
                items.sort((a, b) => b.points - a.points);
                items.forEach((item, i) => { item.rank = i + 1; });

                if (!cancelled) setEntries(items);
            } catch (err) {
                console.error("Failed to load leaderboard:", err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    if (loading) return <div className="spinner">Loading leaderboard...</div>;

    const lb = getContract();
    if (!lb) return <div className="empty">Contract not deployed yet.<br />Run `cdm deploy -n paseo` first.</div>;
    if (entries.length === 0) return <div className="empty">No players yet.<br />Play a game to get on the board!</div>;

    return (
        <div className="leaderboard">
            <h2>Leaderboard</h2>
            <div className="lb-table">
                {entries.map(e => (
                    <div
                        key={e.address}
                        className="lb-row"
                        onClick={() => onPlayerClick(e.address)}
                    >
                        <div className={`lb-rank ${e.rank === 1 ? "gold" : e.rank === 2 ? "silver" : e.rank === 3 ? "bronze" : ""}`}>
                            #{e.rank}
                        </div>
                        <div className="lb-address">{short(e.address)}</div>
                        <div className={`lb-points ${e.points > 0 ? "positive" : e.points < 0 ? "negative" : ""}`}>
                            {e.points > 0 ? `+${e.points}` : e.points} pts
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
