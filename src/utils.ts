import { useState, useEffect } from "react";
import { SignerManager, type SignerState } from "@polkadot-apps/signer";
import { BulletinClient } from "@polkadot-apps/bulletin";
import { createCdm } from "@dotdm/cdm";
import type { Move, RoundResult } from "./types.ts";

// ---------------------------------------------------------------------------
// Signer Manager
// ---------------------------------------------------------------------------

export const signerManager = new SignerManager({ dappName: "rps-game" });

export function useSignerState(): SignerState {
    const [state, setState] = useState<SignerState>(signerManager.getState());
    useEffect(() => signerManager.subscribe(setState), []);
    return state;
}

// ---------------------------------------------------------------------------
// CDM
// ---------------------------------------------------------------------------

// cdm.json will be created after `cdm deploy`
// For now we use a placeholder that will be replaced
let _cdm: ReturnType<typeof createCdm> | null = null;
let _contract: any = null;

export function initCdm(cdmJson: any) {
    _cdm = createCdm(cdmJson);
    _contract = _cdm.getContract("@example/leaderboard") as any;
}

export function getCdm() {
    return _cdm!;
}

export function getContract() {
    return _contract!;
}

// ---------------------------------------------------------------------------
// Bulletin
// ---------------------------------------------------------------------------

let _bulletinClient: BulletinClient | null = null;

export async function getBulletinClient() {
    if (!_bulletinClient) _bulletinClient = await BulletinClient.create("paseo");
    return _bulletinClient;
}

export async function uploadToBulletin(bytes: Uint8Array): Promise<string> {
    const client = await getBulletinClient();
    const result = await client.upload(bytes);
    console.log("[Bulletin] Upload complete. CID:", result.cid);
    return result.cid;
}

// ---------------------------------------------------------------------------
// Account mapping
// ---------------------------------------------------------------------------

const _mappedAccounts = new Set<string>();

export async function ensureMapping(account: { address: string; getSigner: () => any }) {
    if (!_cdm) return;
    if (_mappedAccounts.has(account.address)) return;
    try {
        const mapped = await _cdm.inkSdk.addressIsMapped(account.address);
        if (mapped) {
            _mappedAccounts.add(account.address);
            return;
        }
        console.log("[Mapping] Mapping account:", account.address);
        const api = _cdm.client.getUnsafeApi() as any;
        const tx = api.tx.Revive.map_account();
        await tx.signAndSubmit(account.getSigner());
        _mappedAccounts.add(account.address);
    } catch (err) {
        console.warn("[Mapping] Error:", err);
    }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const IPFS_GATEWAY = "https://paseo-ipfs.polkadot.io/ipfs/";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const short = (addr: string) => addr.slice(0, 6) + "..." + addr.slice(-4);

export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return Promise.race([
        promise,
        new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
        ),
    ]);
}

export function determineWinner(player: Move, opponent: Move): RoundResult {
    if (player === opponent) return "draw";
    if (
        (player === "rock" && opponent === "scissors") ||
        (player === "paper" && opponent === "rock") ||
        (player === "scissors" && opponent === "paper")
    ) {
        return "win";
    }
    return "loss";
}

export function pointsForResult(result: RoundResult): number {
    if (result === "win") return 2;
    if (result === "loss") return -1;
    return 0;
}

const MOVES: Move[] = ["rock", "paper", "scissors"];

export function randomMove(): Move {
    return MOVES[Math.floor(Math.random() * 3)];
}

export function generateRoomCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}
