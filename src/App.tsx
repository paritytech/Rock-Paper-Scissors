import { useState, useEffect } from "react";
import { useSignerState, signerManager, short } from "./utils.ts";
import Home from "./pages/Home.tsx";
import SoloGame from "./pages/SoloGame.tsx";

type View = { page: "home" } | { page: "solo" };

export default function App() {
    const { status, accounts, selectedAccount, error } = useSignerState();

    useEffect(() => {
        // Host API only — no dev fallback
        signerManager.connect().then(result => {
            if (result.ok && result.value.length > 0) {
                signerManager.selectAccount(result.value[0].address);
            }
        });
    }, []);

    const account = selectedAccount;
    const [view, setView] = useState<View>({ page: "home" });
    const [refreshKey, setRefreshKey] = useState(0);

    if (status === "connecting") {
        return <div className="spinner">Connecting wallet...</div>;
    }

    const goHome = () => {
        setRefreshKey(k => k + 1);
        setView({ page: "home" });
    };

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
                    refreshKey={refreshKey}
                    onSolo={() => setView({ page: "solo" })}
                />
            )}

            {view.page === "solo" && account && (
                <SoloGame account={account} onDone={goHome} />
            )}

            {view.page === "solo" && !account && (
                <div className="empty">Please connect a wallet to play.</div>
            )}
        </>
    );
}
