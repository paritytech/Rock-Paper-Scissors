import { useState, useEffect, useRef } from "react";
import {
    createStatementStore,
    type ProductAccountId,
    type SignedStatement,
    type Statement,
    type Topic,
} from "@novasamatech/product-sdk";
import { blake2b256 } from "@polkadot-labs/hdkd-helpers";
import { generateRoomCode } from "../utils.ts";

function stringToTopic(str: string): Uint8Array {
    return blake2b256(new TextEncoder().encode(str));
}

// Single store instance — same pattern as meet repro page
const store = createStatementStore();

const APP_TOPIC = "rps-game";
const ACCOUNT_ID: ProductAccountId = ["rps-game.dot", 0];

interface GameMessage {
    type: string;
    peerId: string;
    timestamp: number;
}

async function submitStatement(roomCode: string, channel: string, msg: GameMessage) {
    const data = new TextEncoder().encode(JSON.stringify(msg));
    const expiryTimestampSecs = Math.floor(Date.now() / 1000) + 600;
    const seq = Date.now() % 0xFFFFFFFF;
    const expiry = (BigInt(expiryTimestampSecs) << BigInt(32)) | BigInt(seq);

    const statement = {
        proof: undefined,
        decryptionKey: stringToTopic(roomCode),
        expiry,
        channel: stringToTopic(channel),
        topics: [stringToTopic(APP_TOPIC), stringToTopic(roomCode)],
        data,
    };

    console.log("[Lobby] Creating proof...");
    const proof = await store.createProof(ACCOUNT_ID, statement as any);
    console.log("[Lobby] Proof created, submitting...");
    await store.submit({ ...statement, proof } as any);
    console.log("[Lobby] Submitted!");
}

export default function MultiplayerLobby({ account, onGameStart, onBack }: {
    account: { address: string; h160Address: string; publicKey: Uint8Array; getSigner: () => any };
    onGameStart: (roomCode: string, isCreator: boolean) => void;
    onBack: () => void;
}) {
    const [mode, setMode] = useState<"choose" | "create" | "join">("choose");
    const [roomCode, setRoomCode] = useState("");
    const [joinCode, setJoinCode] = useState("");
    const [waiting, setWaiting] = useState(false);
    const [statusMsg, setStatusMsg] = useState("");
    const subRef = useRef<{ unsubscribe: () => void } | null>(null);

    useEffect(() => {
        return () => { subRef.current?.unsubscribe(); };
    }, []);

    const createRoom = async () => {
        const code = generateRoomCode();
        console.log("[Lobby] Creating room:", code);
        setRoomCode(code);
        setMode("create");
        setWaiting(true);
        setStatusMsg("Creating room...");

        try {
            // Subscribe first — identical to meet repro page pattern
            const topics = [stringToTopic(APP_TOPIC), stringToTopic(code)];
            console.log("[Lobby] Subscribing...");

            subRef.current = store.subscribe(topics as any, (statements: any[]) => {
                console.log("[Lobby] Received", statements.length, "statement(s)");
                for (const stmt of statements) {
                    try {
                        if (!stmt.data) continue;
                        const text = new TextDecoder().decode(stmt.data);
                        console.log("[Lobby] Data:", text);
                        const msg: GameMessage = JSON.parse(text);

                        if (msg.peerId === account.h160Address) {
                            console.log("[Lobby] Own message, skipping");
                            continue;
                        }

                        console.log("[Lobby] >>> Opponent joined:", msg.peerId);
                        setStatusMsg("Opponent found! Starting game...");
                        setTimeout(() => {
                            subRef.current?.unsubscribe();
                            subRef.current = null;
                            onGameStart(code, true);
                        }, 500);
                    } catch (e) {
                        console.warn("[Lobby] Parse error:", e);
                    }
                }
            });

            // Then publish
            console.log("[Lobby] Publishing join for:", account.h160Address);
            await submitStatement(code, `${code}/presence/${account.h160Address}`, {
                type: "join", peerId: account.h160Address, timestamp: Date.now(),
            });

            setStatusMsg("Waiting for opponent...");
        } catch (err) {
            console.error("[Lobby] Error:", err);
            setStatusMsg("Failed: " + (err instanceof Error ? err.message : String(err)));
            setWaiting(false);
        }
    };

    const joinRoom = async () => {
        const code = joinCode.trim().toUpperCase();
        if (code.length < 4) return;

        console.log("[Lobby] Joining room:", code);
        setRoomCode(code);
        setWaiting(true);
        setStatusMsg("Joining room...");

        try {
            await submitStatement(code, `${code}/presence/${account.h160Address}`, {
                type: "join", peerId: account.h160Address, timestamp: Date.now(),
            });

            setStatusMsg("Joined! Starting game...");
            setTimeout(() => onGameStart(code, false), 500);
        } catch (err) {
            console.error("[Lobby] Error:", err);
            setStatusMsg("Failed: " + (err instanceof Error ? err.message : String(err)));
            setWaiting(false);
        }
    };

    if (mode === "choose") {
        return (
            <div className="lobby">
                <h2>Multiplayer</h2>
                <div className="lobby-options">
                    <div className="mode-card" onClick={createRoom}>
                        <div className="mode-card-title">Create Room</div>
                        <div className="mode-card-desc">Get a code and share it with your opponent</div>
                    </div>
                    <div className="mode-card" onClick={() => setMode("join")}>
                        <div className="mode-card-title">Join Room</div>
                        <div className="mode-card-desc">Enter a code to join an existing room</div>
                    </div>
                </div>
            </div>
        );
    }

    if (mode === "create") {
        return (
            <div className="lobby">
                <h2>Your Room</h2>
                <div className="room-code-display">
                    <div className="code">{roomCode}</div>
                    <div className="label">Share this code with your opponent</div>
                </div>
                {statusMsg && <div className="status">{statusMsg}</div>}
                {waiting && <div className="waiting-opponent">Waiting for opponent to join...</div>}
            </div>
        );
    }

    return (
        <div className="lobby">
            <h2>Join Room</h2>
            <div className="room-input">
                <input
                    type="text"
                    placeholder="ROOM CODE"
                    value={joinCode}
                    onChange={e => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                    maxLength={6}
                    disabled={waiting}
                />
                <button
                    className="btn btn-primary"
                    onClick={joinRoom}
                    disabled={joinCode.trim().length < 4 || waiting}
                >
                    {waiting ? "Joining..." : "Join"}
                </button>
            </div>
            {statusMsg && <div className="status">{statusMsg}</div>}
        </div>
    );
}
