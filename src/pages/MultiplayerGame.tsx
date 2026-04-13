import { useState, useEffect, useRef } from "react";
import { StatementStoreClient } from "@polkadot-apps/statement-store";
import type { Move, Round, GameData, PlayerData, RoundResult } from "../types.ts";
import {
    determineWinner, pointsForResult,
    uploadToBulletin, ensureMapping, getContract, withTimeout,
    IPFS_GATEWAY, short,
} from "../utils.ts";

const MOVE_EMOJI: Record<Move, string> = { rock: "\u270A", paper: "\u270B", scissors: "\u2702\uFE0F" };
const BEST_OF = 3;
const PHASE_TIMEOUT = 30;
const APP_NAME = "rps-game";

type GameMessage =
    | { type: "join"; peerId: string; timestamp: number }
    | { type: "commit"; round: number; hash: string; peerId: string; timestamp: number }
    | { type: "reveal"; round: number; move: Move; salt: string; peerId: string; timestamp: number };

async function hashCommit(move: Move, salt: string): Promise<string> {
    const data = new TextEncoder().encode(move + salt);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export default function MultiplayerGame({ account, roomCode, isCreator, onDone }: {
    account: { address: string; h160Address: string; publicKey: Uint8Array; getSigner: () => any };
    roomCode: string;
    isCreator: boolean;
    onDone: () => void;
}) {
    const myId = account.h160Address;

    const [phase, setPhase] = useState<"connecting" | "pick" | "waiting-commit" | "waiting-reveal" | "round-result" | "game-over">("connecting");
    const [round, setRound] = useState(1);
    const [rounds, setRounds] = useState<Round[]>([]);
    const [currentRoundResult, setCurrentRoundResult] = useState<Round | null>(null);
    const [timer, setTimer] = useState(PHASE_TIMEOUT);
    const [saving, setSaving] = useState(false);
    const [statusMsg, setStatusMsg] = useState("");
    const [pickedMove, setPickedMove] = useState<Move | null>(null);

    // Refs for game state accessed in subscribe callback (avoid stale closures)
    const clientRef = useRef<StatementStoreClient | null>(null);
    const myMoveRef = useRef<Move | null>(null);
    const mySaltRef = useRef<string>("");
    const opponentCommitRef = useRef<string | null>(null);
    const roundRef = useRef(1);
    const phaseRef = useRef<string>("connecting");
    const roundsRef = useRef<Round[]>([]);
    const opponentIdRef = useRef<string | null>(null);

    // Keep refs in sync
    useEffect(() => { phaseRef.current = phase; }, [phase]);
    useEffect(() => { roundRef.current = round; }, [round]);
    useEffect(() => { roundsRef.current = rounds; }, [rounds]);

    // Timer
    useEffect(() => {
        if (phase !== "pick" && phase !== "waiting-commit" && phase !== "waiting-reveal") return;
        setTimer(PHASE_TIMEOUT);
        const interval = setInterval(() => {
            setTimer(t => {
                if (t <= 1) { clearInterval(interval); return 0; }
                return t - 1;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, [phase, round]);

    function processRoundResult(myMove: Move, opponentMove: Move) {
        const result = determineWinner(myMove, opponentMove);
        console.log("[MPGame] Round result:", myMove, "vs", opponentMove, "=", result);
        const roundData: Round = { playerMove: myMove, opponentMove, result };

        setCurrentRoundResult(roundData);
        const newRounds = [...roundsRef.current, roundData];
        setRounds(newRounds);
        roundsRef.current = newRounds;

        const w = newRounds.filter(r => r.result === "win").length;
        const l = newRounds.filter(r => r.result === "loss").length;
        const needed = Math.ceil(BEST_OF / 2);

        setPhase("round-result");

        setTimeout(() => {
            if (w >= needed || l >= needed || newRounds.length >= BEST_OF) {
                setPhase("game-over");
            } else {
                const nextRound = newRounds.length + 1;
                setRound(nextRound);
                roundRef.current = nextRound;
                myMoveRef.current = null;
                mySaltRef.current = "";
                opponentCommitRef.current = null;
                setPickedMove(null);
                setCurrentRoundResult(null);
                setPhase("pick");
            }
        }, 2000);
    }

    function handleMessage(msg: GameMessage) {
        console.log("[MPGame] Processing:", msg.type, "from:", msg.peerId);

        if (msg.type === "join" && msg.peerId !== myId) {
            opponentIdRef.current = msg.peerId;
        }

        if (msg.type === "commit" && msg.peerId !== myId) {
            console.log("[MPGame] Opponent commit round", msg.round);
            opponentCommitRef.current = msg.hash;

            if (phaseRef.current === "waiting-commit" && clientRef.current) {
                setPhase("waiting-reveal");
                phaseRef.current = "waiting-reveal";

                if (myMoveRef.current && mySaltRef.current) {
                    clientRef.current.publish<GameMessage>(
                        { type: "reveal", round: roundRef.current, move: myMoveRef.current, salt: mySaltRef.current, peerId: myId, timestamp: Date.now() },
                        { channel: `${roomCode}/reveal/${roundRef.current}/${myId}`, topic2: roomCode },
                    );
                }
            }
        }

        if (msg.type === "reveal" && msg.peerId !== myId) {
            console.log("[MPGame] Opponent reveal round", msg.round, "move:", msg.move);

            const myMove = myMoveRef.current;
            const theirCommit = opponentCommitRef.current;

            if (!myMove) { console.warn("[MPGame] No myMove yet"); return; }
            if (!theirCommit) { console.warn("[MPGame] No opponent commit"); return; }

            hashCommit(msg.move, msg.salt).then(expectedHash => {
                if (expectedHash !== theirCommit) {
                    console.error("[MPGame] HASH MISMATCH!");
                    setStatusMsg("Opponent cheated!");
                    return;
                }
                processRoundResult(myMove, msg.move);
            });
        }
    }

    // Connect + subscribe + publish join
    useEffect(() => {
        let destroyed = false;

        (async () => {
            try {
                const client = new StatementStoreClient({
                    appName: APP_NAME,
                    defaultTtlSeconds: 600,
                });
                clientRef.current = client;

                console.log("[MPGame] Connecting in host mode...");
                await client.connect({
                    mode: "host",
                    accountId: ["rps-game.dot", 0],
                });
                console.log("[MPGame] Connected");

                // Subscribe with built-in dedup
                client.subscribe<GameMessage>((stmt) => {
                    if (destroyed) return;
                    if (stmt.data.peerId === myId) return; // skip own
                    handleMessage(stmt.data);
                }, { topic2: roomCode });

                // Publish join
                console.log("[MPGame] Publishing join...");
                await client.publish<GameMessage>(
                    { type: "join", peerId: myId, timestamp: Date.now() },
                    { channel: `${roomCode}/presence/${myId}`, topic2: roomCode },
                );

                if (!destroyed) {
                    setPhase("pick");
                    phaseRef.current = "pick";
                }
            } catch (err) {
                console.error("[MPGame] Error:", err);
                setStatusMsg("Connection failed");
            }
        })();

        return () => {
            destroyed = true;
            clientRef.current?.destroy();
            clientRef.current = null;
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const pickMove = async (move: Move) => {
        if (phaseRef.current !== "pick" || !clientRef.current) return;

        const salt = crypto.randomUUID();
        const hash = await hashCommit(move, salt);
        console.log("[MPGame] Picked:", move);

        myMoveRef.current = move;
        mySaltRef.current = salt;
        setPickedMove(move);

        await clientRef.current.publish<GameMessage>(
            { type: "commit", round: roundRef.current, hash, peerId: myId, timestamp: Date.now() },
            { channel: `${roomCode}/commit/${roundRef.current}/${myId}`, topic2: roomCode },
        );

        if (opponentCommitRef.current) {
            console.log("[MPGame] Opponent already committed, revealing...");
            setPhase("waiting-reveal");
            phaseRef.current = "waiting-reveal";
            await clientRef.current.publish<GameMessage>(
                { type: "reveal", round: roundRef.current, move, salt, peerId: myId, timestamp: Date.now() },
                { channel: `${roomCode}/reveal/${roundRef.current}/${myId}`, topic2: roomCode },
            );
        } else {
            setPhase("waiting-commit");
            phaseRef.current = "waiting-commit";
        }
    };

    const playerWins = rounds.filter(r => r.result === "win").length;
    const opponentWins = rounds.filter(r => r.result === "loss").length;
    const overallResult: RoundResult = playerWins > opponentWins ? "win" : opponentWins > playerWins ? "loss" : "draw";
    const pts = pointsForResult(overallResult);

    const saveToChain = async () => {
        setSaving(true);
        try {
            const lb = getContract();
            if (!lb) { setStatusMsg("Contract not available"); setSaving(false); return; }

            let playerData: PlayerData = {
                player: myId, totalGames: 0, wins: 0, losses: 0, draws: 0, points: 0, games: [],
            };
            try {
                const cidRes = await lb.getPlayerCid.query(myId);
                if (cidRes.success && cidRes.value) {
                    const resp = await fetch(IPFS_GATEWAY + cidRes.value);
                    if (resp.ok) playerData = await resp.json();
                }
            } catch { /* first time */ }

            const game: GameData = {
                id: playerData.games.length + 1, mode: "multiplayer",
                opponent: opponentIdRef.current ?? "unknown", roomCode, rounds,
                result: overallResult, pointsChange: pts,
                timestamp: Math.floor(Date.now() / 1000),
            };
            playerData.games.push(game);
            playerData.totalGames++;
            if (overallResult === "win") playerData.wins++;
            else if (overallResult === "loss") playerData.losses++;
            else playerData.draws++;
            playerData.points += pts;

            setStatusMsg("Uploading to Bulletin...");
            const newCid = await uploadToBulletin(new TextEncoder().encode(JSON.stringify(playerData)));
            await ensureMapping(account);
            const regRes = await lb.isRegistered.query(myId);
            if (regRes.success && !regRes.value) {
                setStatusMsg("Registering...");
                await withTimeout(lb.register.tx({ signer: account.getSigner(), origin: account.address }), 120_000, "register");
            }
            setStatusMsg("Updating leaderboard...");
            await withTimeout(lb.updateResult.tx(newCid, BigInt(pts), { signer: account.getSigner(), origin: account.address }), 120_000, "update");
            setStatusMsg("Saved!");
        } catch (err) {
            console.error("[MPGame] Save error:", err);
            setStatusMsg("Failed - check console");
        } finally { setSaving(false); }
    };

    if (phase === "connecting") return <div className="spinner">Connecting to game room...</div>;

    return (
        <div className="mp-game">
            <h2>Room: {roomCode}</h2>
            <div className="phase-label">
                {phase === "pick" && `Round ${round} - Pick your move`}
                {phase === "waiting-commit" && "Waiting for opponent's move..."}
                {phase === "waiting-reveal" && "Revealing moves..."}
                {phase === "round-result" && "Round result"}
                {phase === "game-over" && "Game Over"}
            </div>

            <div className="score-display">
                <div>You: <span>{playerWins}</span></div>
                <div>Round <span>{Math.min(round, BEST_OF)}</span>/{BEST_OF}</div>
                <div>Opponent: <span>{opponentWins}</span></div>
            </div>

            {(phase === "pick" || phase === "waiting-commit") && <div className="timer">{timer}s</div>}

            {phase === "pick" && (
                <div className="move-picker">
                    {(["rock", "paper", "scissors"] as Move[]).map(m => (
                        <div key={m}>
                            <button className="move-btn" onClick={() => pickMove(m)}>{MOVE_EMOJI[m]}</button>
                            <div className="move-label">{m}</div>
                        </div>
                    ))}
                </div>
            )}

            {phase === "waiting-commit" && (
                <div className="waiting-opponent">
                    <div style={{ fontSize: 48, marginBottom: 8 }}>{pickedMove ? MOVE_EMOJI[pickedMove] : ""}</div>
                    <div>You picked {pickedMove}. Waiting for opponent...</div>
                </div>
            )}

            {phase === "waiting-reveal" && <div className="waiting-opponent">Revealing moves...</div>}

            {phase === "round-result" && currentRoundResult && (
                <div className="round-result">
                    <div className="round-result-moves">
                        <span>{MOVE_EMOJI[currentRoundResult.playerMove]}</span>
                        <span className="round-result-vs">VS</span>
                        <span>{MOVE_EMOJI[currentRoundResult.opponentMove]}</span>
                    </div>
                    <div className={`round-result-text ${currentRoundResult.result}`}>
                        {currentRoundResult.result === "win" ? "You win this round!" :
                         currentRoundResult.result === "loss" ? "You lose this round!" : "Draw!"}
                    </div>
                </div>
            )}

            {phase === "game-over" && (
                <div className="round-result">
                    <div className={`round-result-text ${overallResult}`} style={{ fontSize: 24, marginBottom: 8 }}>
                        {overallResult === "win" ? "You won the match!" :
                         overallResult === "loss" ? "You lost the match!" : "Match drawn!"}
                    </div>
                    <div style={{ fontSize: 14, color: "var(--text2)", marginBottom: 8 }}>
                        vs {opponentIdRef.current ? short(opponentIdRef.current) : "opponent"}
                    </div>
                    <div style={{ fontSize: 14, color: "var(--text2)", marginBottom: 16 }}>
                        {playerWins} - {opponentWins} ({pts > 0 ? `+${pts}` : pts} pts)
                    </div>
                    <div className="history-card-rounds" style={{ justifyContent: "center", marginBottom: 16 }}>
                        {rounds.map((r, i) => (
                            <span key={i} className="round-badge">{MOVE_EMOJI[r.playerMove]} vs {MOVE_EMOJI[r.opponentMove]}</span>
                        ))}
                    </div>
                    {statusMsg && <div className="status">{statusMsg}</div>}
                    <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                        <button className="btn btn-primary" onClick={saveToChain} disabled={saving}>
                            {saving ? "Saving..." : "Save to Chain"}
                        </button>
                        <button className="btn btn-ghost" onClick={onDone}>Home</button>
                    </div>
                </div>
            )}

            {statusMsg && phase !== "game-over" && <div className="status">{statusMsg}</div>}
        </div>
    );
}
