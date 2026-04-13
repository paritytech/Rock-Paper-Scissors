import MyProfile from "./MyProfile.tsx";

export default function Home({ account, onSolo, refreshKey }: {
    account: { address: string } | null;
    onSolo: () => void;
    refreshKey?: number;
}) {
    return (
        <div>
            {account && <MyProfile account={account} refreshKey={refreshKey} />}

            <div className="home">
                <div className="home-title">Rock Paper Scissors</div>
                <div className="home-subtitle">Play against the computer</div>

                <div className="home-modes">
                    <div className="mode-card" onClick={onSolo}>
                        <div className="mode-card-title">Solo</div>
                        <div className="mode-card-desc">Best of 3 vs computer — results saved locally</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
