import { useState, useEffect } from "react";
import { useSignerState, signerManager, short, initCdm } from "./utils.ts";
import Home from "./pages/Home.tsx";
import SoloGame from "./pages/SoloGame.tsx";
import MultiplayerLobby from "./pages/MultiplayerLobby.tsx";
import MultiplayerGame from "./pages/MultiplayerGame.tsx";
import Leaderboard from "./pages/Leaderboard.tsx";
import PlayerHistory from "./pages/PlayerHistory.tsx";

// ---------------------------------------------------------------------------
// CDM init — will fail gracefully if cdm.json doesn't exist yet
// ---------------------------------------------------------------------------

try {
    // @ts-ignore — cdm.json is created after `cdm deploy`
    const cdmJson = await import("../cdm.json");
    initCdm(cdmJson.default ?? cdmJson);
} catch {
    console.warn("[CDM] cdm.json not found — contract features disabled until deploy");
}

// ---------------------------------------------------------------------------
// View types
// ---------------------------------------------------------------------------

type View =
    | { page: "home" }
    | { page: "solo" }
    | { page: "lobby" }
    | { page: "multiplayer"; roomCode: string; isCreator: boolean }
    | { page: "leaderboard" }
    | { page: "history"; playerAddress: string };

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
    const { status, accounts, selectedAccount, error } = useSignerState();

    useEffect(() => {
        signerManager.connect().then(async result => {
            if (result.ok && result.value.length > 0) {
                signerManager.selectAccount(result.value[0].address);
            } else {
                // Fallback to dev accounts if host/extension fails
                console.warn("[Signer] Auto-connect failed, trying dev accounts...");
                const devResult = await signerManager.connect("dev");
                if (devResult.ok && devResult.value.length > 0) {
                    signerManager.selectAccount(devResult.value[0].address);
                }
            }
        });
    }, []);

    const account = selectedAccount;
    const [view, setView] = useState<View>({ page: "home" });

    if (status === "connecting") {
        return <div className="spinner">Connecting wallet...</div>;
    }

    const goHome = () => setView({ page: "home" });

    return (
        <>
            <header>
                <h1 onClick={goHome} style={{ cursor: "pointer" }}>RPS</h1>
                {accounts.length > 0 ? (
                    <select
                        className="account-select"
                        value={account?.address ?? ""}
                        onChange={e => signerManager.selectAccount(e.target.value)}
                    >
                        {accounts.map(acc => (
                            <option key={acc.address} value={acc.address}>
                                {acc.name ?? short(acc.address)} ({acc.source})
                            </option>
                        ))}
                    </select>
                ) : (
                    <span className="account-select">{error?.message ?? "No accounts"}</span>
                )}
            </header>

            {view.page !== "home" && (
                <button className="back-btn" onClick={goHome}>
                    &larr; Back
                </button>
            )}

            {view.page === "home" && (
                <Home
                    account={account}
                    onSolo={() => setView({ page: "solo" })}
                    onMultiplayer={() => setView({ page: "lobby" })}
                    onLeaderboard={() => setView({ page: "leaderboard" })}
                />
            )}

            {view.page === "solo" && account && (
                <SoloGame account={account} onDone={goHome} />
            )}

            {view.page === "lobby" && account && (
                <MultiplayerLobby
                    account={account}
                    onGameStart={(roomCode, isCreator) =>
                        setView({ page: "multiplayer", roomCode, isCreator })
                    }
                    onBack={goHome}
                />
            )}

            {view.page === "multiplayer" && account && (
                <MultiplayerGame
                    account={account}
                    roomCode={view.roomCode}
                    isCreator={view.isCreator}
                    onDone={goHome}
                />
            )}

            {view.page === "leaderboard" && (
                <Leaderboard
                    onPlayerClick={addr => setView({ page: "history", playerAddress: addr })}
                />
            )}

            {view.page === "history" && (
                <PlayerHistory
                    playerAddress={view.playerAddress}
                    onBack={() => setView({ page: "leaderboard" })}
                />
            )}

            {(view.page === "solo" || view.page === "lobby" || view.page === "multiplayer") && !account && (
                <div className="empty">Please connect a wallet to play.</div>
            )}
        </>
    );
}
