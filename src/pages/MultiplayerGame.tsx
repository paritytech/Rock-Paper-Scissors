import { useState, useEffect, useRef, useCallback } from "react";
import {
    createStatementStore,
    type ProductAccountId,
    type SignedStatement,
    type Statement,
    type Topic,
} from "@novasamatech/product-sdk";
import { blake2b256 } from "@polkadot-labs/hdkd-helpers";
import type { Move, Round, GameData, PlayerData, RoundResult } from "../types.ts";
import {
    determineWinner, pointsForResult,
    uploadToBulletin, ensureMapping, getContract, withTimeout,
    IPFS_GATEWAY, short,
} from "../utils.ts";

const MOVE_EMOJI: Record<Move, string> = { rock: "\u270A", paper: "\u270B", scissors: "\u2702\uFE0F" };
const BEST_OF = 3;
const PHASE_TIMEOUT = 30;
const APP_TOPIC = "rps-game";
const ACCOUNT_ID: ProductAccountId = ["rps-game.dot", 0];

function stringToTopic(str: string): Uint8Array {
    return blake2b256(new TextEncoder().encode(str));
}

type GameMessage =
    | { type: "join"; peerId: string; timestamp: number }
    | { type: "commit"; round: number; hash: string; peerId: string; timestamp: number }
    | { type: "reveal"; round: number; move: Move; salt: string; peerId: string; timestamp: number };

async function hashCommit(move: Move, salt: string): Promise<string> {
    const data = new TextEncoder().encode(move + salt);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function publishMessage(
    store: ReturnType<typeof createStatementStore>,
    roomCode: string,
    channel: string,
    msg: GameMessage,
) {
    const data = new TextEncoder().encode(JSON.stringify(msg));
    const expiryTimestampSecs = Math.floor(Date.now() / 1000) + 600;
    const sequenceNumber = Date.now() % 0xFFFFFFFF;
    const expiry = (BigInt(expiryTimestampSecs) << BigInt(32)) | BigInt(sequenceNumber);

    const statement: Statement = {
        proof: undefined,
        decryptionKey: stringToTopic(roomCode),
        expiry,
        channel: stringToTopic(channel),
        topics: [stringToTopic(APP_TOPIC), stringToTopic(roomCode)] as unknown as Topic[],
        data,
    } as unknown as Statement;

    const proof = await store.createProof(ACCOUNT_ID, statement);
    const signed: SignedStatement = { ...statement, proof } as unknown as SignedStatement;
    await store.submit(signed);
}

export default function MultiplayerGame({ account, roomCode, isCreator, onDone }: {
    account: { address: string; h160Address: string; publicKey: Uint8Array; getSigner: () => any };
    roomCode: string;
    isCreator: boolean;
    onDone: () => void;
}) {
    const myId = account.h160Address;
    console.log("[MPGame] Init — room:", roomCode, "isCreator:", isCreator, "myId:", myId);

    const [phase, setPhase] = useState<"connecting" | "pick" | "waiting-commit" | "waiting-reveal" | "round-result" | "game-over">("connecting");
    const [round, setRound] = useState(1);
    const [rounds, setRounds] = useState<Round[]>([]);
    const [myMove, setMyMove] = useState<Move | null>(null);
    const [mySalt, setMySalt] = useState("");
    const [opponentCommit, setOpponentCommit] = useState<string | null>(null);
    const [currentRoundResult, setCurrentRoundResult] = useState<Round | null>(null);
    const [timer, setTimer] = useState(PHASE_TIMEOUT);
    const [saving, setSaving] = useState(false);
    const [statusMsg, setStatusMsg] = useState("");

    const storeRef = useRef<ReturnType<typeof createStatementStore> | null>(null);
    const subRef = useRef<{ unsubscribe: () => void } | null>(null);
    const opponentIdRef = useRef<string | null>(null);

    // Timer
    useEffect(() => {
        if (phase !== "pick" && phase !== "waiting-commit" && phase !== "waiting-reveal") return;
        console.log("[MPGame] Timer started for phase:", phase, "round:", round);
        setTimer(PHASE_TIMEOUT);
        const interval = setInterval(() => {
            setTimer(t => {
                if (t <= 1) { clearInterval(interval); return 0; }
                return t - 1;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, [phase, round]);

    const handleMessage = useCallback((msg: GameMessage) => {
        console.log("[MPGame] Received message:", msg);

        if (msg.type === "join" && msg.peerId !== myId) {
            console.log("[MPGame] Opponent joined:", msg.peerId);
            opponentIdRef.current = msg.peerId;
        }

        if (msg.type === "commit" && msg.peerId !== myId) {
            console.log("[MPGame] Opponent committed round", msg.round, "hash:", msg.hash);
            setOpponentCommit(msg.hash);
            setPhase(prev => {
                const next = prev === "waiting-commit" ? "waiting-reveal" : prev;
                console.log("[MPGame] Phase transition on opponent commit:", prev, "->", next);
                return next;
            });
        }

        if (msg.type === "reveal" && msg.peerId !== myId) {
            console.log("[MPGame] Opponent revealed round", msg.round, "move:", msg.move);
            setMyMove(currentMyMove => {
                setOpponentCommit(currentOpponentCommit => {
                    if (!currentMyMove || !currentOpponentCommit) {
                        console.warn("[MPGame] Cannot process reveal — missing data");
                        return currentOpponentCommit;
                    }

                    hashCommit(msg.move, msg.salt).then(expectedHash => {
                        console.log("[MPGame] Verifying hash — expected:", expectedHash, "got:", currentOpponentCommit);
                        if (expectedHash !== currentOpponentCommit) {
                            console.error("[MPGame] HASH MISMATCH!");
                            setStatusMsg("Opponent's move didn't match their commit!");
                            return;
                        }

                        const result = determineWinner(currentMyMove, msg.move);
                        console.log("[MPGame] Round result:", currentMyMove, "vs", msg.move, "=", result);
                        const roundData: Round = { playerMove: currentMyMove, opponentMove: msg.move, result };

                        setCurrentRoundResult(roundData);
                        setRounds(prev => {
                            const newRounds = [...prev, roundData];
                            const w = newRounds.filter(r => r.result === "win").length;
                            const l = newRounds.filter(r => r.result === "loss").length;
                            const needed = Math.ceil(BEST_OF / 2);
                            console.log("[MPGame] Score:", w, "-", l);

                            setTimeout(() => {
                                if (w >= needed || l >= needed || newRounds.length >= BEST_OF) {
                                    console.log("[MPGame] Game over!");
                                    setPhase("game-over");
                                } else {
                                    setRound(newRounds.length + 1);
                                    setMyMove(null);
                                    setMySalt("");
                                    setOpponentCommit(null);
                                    setCurrentRoundResult(null);
                                    setPhase("pick");
                                }
                            }, 2000);
                            return newRounds;
                        });
                        setPhase("round-result");
                    });

                    return currentOpponentCommit;
                });
                return currentMyMove;
            });
        }
    }, [myId]);

    // Connect and setup
    useEffect(() => {
        let destroyed = false;

        (async () => {
            try {
                console.log("[MPGame] Creating store via product-sdk...");
                const store = createStatementStore();
                storeRef.current = store;

                // Subscribe
                const topics: Topic[] = [
                    stringToTopic(APP_TOPIC),
                    stringToTopic(roomCode),
                ] as unknown as Topic[];

                console.log("[MPGame] Subscribing to room:", roomCode);
                subRef.current = store.subscribe(topics, (statements: SignedStatement[]) => {
                    if (destroyed) return;
                    console.log("[MPGame] Subscribe callback — got", statements.length, "statement(s)");
                    for (const stmt of statements) {
                        try {
                            const raw = stmt as any;
                            const dataField = raw.data;
                            console.log("[MPGame] data type:", typeof dataField, "isUint8:", dataField instanceof Uint8Array, "length:", dataField?.length);

                            let text: string;
                            if (typeof dataField === "string") {
                                text = dataField;
                            } else if (dataField instanceof Uint8Array) {
                                text = new TextDecoder().decode(dataField);
                            } else if (Array.isArray(dataField) || dataField?.buffer) {
                                text = new TextDecoder().decode(new Uint8Array(dataField));
                            } else {
                                console.warn("[MPGame] Unknown data format:", dataField);
                                continue;
                            }

                            console.log("[MPGame] Decoded:", text);
                            const msg: GameMessage = JSON.parse(text);

                            // Skip own messages
                            if (msg.peerId === myId) {
                                console.log("[MPGame] Skipping own message:", msg.type);
                                continue;
                            }

                            console.log("[MPGame] >>> Opponent:", msg.type, msg);
                            handleMessage(msg);
                        } catch (e) {
                            console.warn("[MPGame] Parse error:", e);
                        }
                    }
                });

                // Publish join
                console.log("[MPGame] Publishing join...");
                await publishMessage(store, roomCode, `${roomCode}/presence/${myId}`, {
                    type: "join", peerId: myId, timestamp: Date.now(),
                });
                console.log("[MPGame] Join published, ready to play");

                if (!destroyed) setPhase("pick");
            } catch (err) {
                console.error("[MPGame] Connect error:", err);
                setStatusMsg("Connection failed — " + (err instanceof Error ? err.message : "unknown"));
            }
        })();

        return () => {
            destroyed = true;
            console.log("[MPGame] Cleanup");
            subRef.current?.unsubscribe();
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const pickMove = async (move: Move) => {
        if (phase !== "pick" || !storeRef.current) return;

        const salt = crypto.randomUUID();
        const hash = await hashCommit(move, salt);
        console.log("[MPGame] Picked:", move, "hash:", hash);

        setMyMove(move);
        setMySalt(salt);

        console.log("[MPGame] Publishing commit round", round);
        await publishMessage(storeRef.current, roomCode, `${roomCode}/commit/${round}/${myId}`, {
            type: "commit", round, hash, peerId: myId, timestamp: Date.now(),
        });

        if (opponentCommit) {
            console.log("[MPGame] Opponent already committed — auto-revealing");
            setPhase("waiting-reveal");
            await publishMessage(storeRef.current, roomCode, `${roomCode}/reveal/${round}/${myId}`, {
                type: "reveal", round, move, salt, peerId: myId, timestamp: Date.now(),
            });
        } else {
            setPhase("waiting-commit");
        }
    };

    // Auto-reveal
    useEffect(() => {
        if (phase !== "waiting-reveal" || !myMove || !mySalt || !storeRef.current) return;
        console.log("[MPGame] Auto-reveal round", round);
        publishMessage(storeRef.current, roomCode, `${roomCode}/reveal/${round}/${myId}`, {
            type: "reveal", round, move: myMove, salt: mySalt, peerId: myId, timestamp: Date.now(),
        });
    }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

    const playerWins = rounds.filter(r => r.result === "win").length;
    const opponentWins = rounds.filter(r => r.result === "loss").length;
    const overallResult: RoundResult = playerWins > opponentWins ? "win" : opponentWins > playerWins ? "loss" : "draw";
    const pts = pointsForResult(overallResult);

    const saveToChain = async () => {
        setSaving(true);
        console.log("[MPGame] Saving to chain...");
        try {
            const lb = getContract();
            if (!lb) { setStatusMsg("Contract not available"); setSaving(false); return; }

            setStatusMsg("Fetching existing history...");
            let playerData: PlayerData = {
                player: myId, totalGames: 0, wins: 0, losses: 0, draws: 0, points: 0, games: [],
            };

            try {
                console.log("[Contract] Querying CID for", myId);
                const cidRes = await lb.getPlayerCid.query(myId);
                console.log("[Contract] getPlayerCid:", cidRes);
                if (cidRes.success && cidRes.value) {
                    const resp = await fetch(IPFS_GATEWAY + cidRes.value);
                    if (resp.ok) playerData = await resp.json();
                }
            } catch { /* first time */ }

            const game: GameData = {
                id: playerData.games.length + 1,
                mode: "multiplayer",
                opponent: opponentIdRef.current ?? "unknown",
                roomCode,
                rounds,
                result: overallResult,
                pointsChange: pts,
                timestamp: Math.floor(Date.now() / 1000),
            };

            playerData.games.push(game);
            playerData.totalGames++;
            if (overallResult === "win") playerData.wins++;
            else if (overallResult === "loss") playerData.losses++;
            else playerData.draws++;
            playerData.points += pts;

            setStatusMsg("Uploading to Bulletin...");
            const bytes = new TextEncoder().encode(JSON.stringify(playerData));
            const newCid = await uploadToBulletin(bytes);
            console.log("[Bulletin] New CID:", newCid);

            setStatusMsg("Ensuring account mapping...");
            await ensureMapping(account);

            console.log("[Contract] Checking registration...");
            const regRes = await lb.isRegistered.query(myId);
            console.log("[Contract] isRegistered:", regRes);
            if (regRes.success && !regRes.value) {
                setStatusMsg("Registering player...");
                const regTx = await withTimeout(
                    lb.register.tx({ signer: account.getSigner(), origin: account.address }),
                    120_000, "register.tx",
                );
                console.log("[Contract] register.tx:", regTx);
            }

            setStatusMsg("Updating leaderboard...");
            console.log("[Contract] updateResult.tx CID:", newCid, "pts:", pts);
            const updateTx = await withTimeout(
                lb.updateResult.tx(newCid, BigInt(pts), { signer: account.getSigner(), origin: account.address }),
                120_000, "updateResult.tx",
            );
            console.log("[Contract] updateResult.tx:", updateTx);

            setStatusMsg("Saved!");
            console.log("[Contract] All saved!");
        } catch (err) {
            console.error("[MPGame] Save error:", err);
            setStatusMsg("Failed to save - check console");
        } finally {
            setSaving(false);
        }
    };

    if (phase === "connecting") {
        return <div className="spinner">Connecting to game room...</div>;
    }

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

            {(phase === "pick" || phase === "waiting-commit") && (
                <div className="timer">{timer}s</div>
            )}

            {phase === "pick" && (
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

            {phase === "waiting-commit" && (
                <div className="waiting-opponent">
                    <div style={{ fontSize: 48, marginBottom: 8 }}>{myMove ? MOVE_EMOJI[myMove] : ""}</div>
                    <div>You picked {myMove}. Waiting for opponent...</div>
                </div>
            )}

            {phase === "waiting-reveal" && (
                <div className="waiting-opponent">Verifying moves...</div>
            )}

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
                            <span key={i} className="round-badge">
                                {MOVE_EMOJI[r.playerMove]} vs {MOVE_EMOJI[r.opponentMove]}
                            </span>
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
