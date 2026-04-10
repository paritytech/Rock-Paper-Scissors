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

interface JoinMessage {
    type: "join";
    peerId: string;
    timestamp: number;
}

const APP_TOPIC = "rps-game";
const ACCOUNT_ID: ProductAccountId = ["rps-game.dot", 0];

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
    const storeRef = useRef<ReturnType<typeof createStatementStore> | null>(null);
    const subRef = useRef<{ unsubscribe: () => void } | null>(null);

    useEffect(() => {
        return () => {
            console.log("[Lobby] Cleanup");
            subRef.current?.unsubscribe();
        };
    }, []);

    const publishMessage = async (
        store: ReturnType<typeof createStatementStore>,
        roomCode: string,
        channel: string,
        msg: JoinMessage,
    ) => {
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

        console.log("[Lobby] Creating proof...");
        const proof = await store.createProof(ACCOUNT_ID, statement);
        console.log("[Lobby] Proof created, submitting...");

        const signed: SignedStatement = { ...statement, proof } as unknown as SignedStatement;
        await store.submit(signed);
        console.log("[Lobby] Submitted successfully");
    };

    const createRoom = async () => {
        const code = generateRoomCode();
        console.log("[Lobby] Creating room:", code);
        setRoomCode(code);
        setMode("create");
        setWaiting(true);
        setStatusMsg("Creating room...");

        try {
            const store = createStatementStore();
            storeRef.current = store;

            // Subscribe for opponent
            const topics: Topic[] = [
                stringToTopic(APP_TOPIC),
                stringToTopic(code),
            ] as unknown as Topic[];

            console.log("[Lobby] Subscribing...");
            subRef.current = store.subscribe(topics, (statements: SignedStatement[]) => {
                console.log("[Lobby] Subscribe callback — got", statements.length, "statement(s)");
                for (const stmt of statements) {
                    try {
                        const raw = stmt as any;
                        const dataField = raw.data;
                        console.log("[Lobby] data type:", typeof dataField, "isUint8:", dataField instanceof Uint8Array, "length:", dataField?.length);

                        let text: string;
                        if (typeof dataField === "string") {
                            text = dataField;
                        } else if (dataField instanceof Uint8Array) {
                            text = new TextDecoder().decode(dataField);
                        } else if (Array.isArray(dataField) || dataField?.buffer) {
                            text = new TextDecoder().decode(new Uint8Array(dataField));
                        } else {
                            console.warn("[Lobby] Unknown data format:", dataField);
                            continue;
                        }

                        console.log("[Lobby] Decoded:", text);
                        const msg: JoinMessage = JSON.parse(text);

                        // Skip own messages
                        if (msg.peerId === account.h160Address) {
                            console.log("[Lobby] Skipping own message");
                            continue;
                        }

                        console.log("[Lobby] >>> Opponent:", msg);
                        if (msg.type === "join") {
                            setStatusMsg("Opponent found! Starting game...");
                            setTimeout(() => {
                                subRef.current?.unsubscribe();
                                onGameStart(code, true);
                            }, 500);
                        }
                    } catch (e) {
                        console.warn("[Lobby] Parse error:", e);
                    }
                }
            });

            // Publish our presence
            console.log("[Lobby] Publishing join for:", account.h160Address);
            await publishMessage(store, code, `${code}/presence/${account.h160Address}`, {
                type: "join", peerId: account.h160Address, timestamp: Date.now(),
            });

            setStatusMsg("Waiting for opponent...");
        } catch (err) {
            console.error("[Lobby] Create room error:", err);
            setStatusMsg("Failed to create room — " + (err instanceof Error ? err.message : "unknown error"));
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
            const store = createStatementStore();
            storeRef.current = store;

            // Publish our join
            console.log("[Lobby] Publishing join for:", account.h160Address);
            await publishMessage(store, code, `${code}/presence/${account.h160Address}`, {
                type: "join", peerId: account.h160Address, timestamp: Date.now(),
            });

            setStatusMsg("Joined! Starting game...");
            setTimeout(() => {
                onGameStart(code, false);
            }, 500);
        } catch (err) {
            console.error("[Lobby] Join room error:", err);
            setStatusMsg("Failed to join room — " + (err instanceof Error ? err.message : "unknown error"));
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
