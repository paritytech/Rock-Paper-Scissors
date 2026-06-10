#!/usr/bin/env node
// Claim a fresh, unique contract package name so a freshly-modded app never
// collides with a name already owned by another signer — the recurring deploy
// trap where `pg deploy` fails with `already owned by 0x…` (see DEVEX-REPORT.md
// #1 and DEPLOY-LOG.md). The template ships a hardcoded name that someone has
// usually already claimed; this generates a high-entropy org so the name is
// effectively guaranteed unowned, then rewrites the single source of truth
// (cdm.json) and the contract's Cargo.toml. The frontend derives the name from
// cdm.json at runtime (see src/utils.ts: stageCdmJson), so there is nothing else
// to touch — no hand-syncing across files, no silent resolve failures.
//
// Usage:
//   node scripts/new-contract-name.mjs               # -> @rps-<8hex>/leaderboard
//   node scripts/new-contract-name.mjs @me/scoreboard # use an explicit name
//
// or via npm:  npm run name:new

import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const CDM = join(root, "cdm.json");
const CARGO = join(root, "contracts/leaderboard/Cargo.toml");

const cdm = JSON.parse(readFileSync(CDM, "utf8"));
const current =
    Object.keys(cdm.contracts ?? {})[0] ?? Object.keys(cdm.dependencies ?? {})[0];
if (!current) {
    console.error("✖ No contract package found in cdm.json (contracts/dependencies empty).");
    process.exit(1);
}

// Preserve the package suffix (e.g. "leaderboard"); only the org must be unique.
const suffix = current.includes("/") ? current.split("/").slice(1).join("/") : "leaderboard";
const next = process.argv[2] ?? `@rps-${randomBytes(4).toString("hex")}/${suffix}`;

if (!/^@[a-z0-9-]+\/[a-z0-9/-]+$/.test(next)) {
    console.error(`✖ Invalid package name: ${next}`);
    console.error("  Expected @org/name — lowercase letters, digits and dashes only.");
    process.exit(1);
}
if (next === current) {
    console.error(`✖ New name is identical to the current one (${current}). Nothing to do.`);
    process.exit(1);
}

// Text replacement (not JSON round-trip) so formatting and key order are untouched;
// the name appears only as a literal string, so split/join is exact and safe.
let changed = 0;
for (const file of [CDM, CARGO]) {
    const before = readFileSync(file, "utf8");
    const after = before.split(current).join(next);
    if (after !== before) {
        writeFileSync(file, after);
        changed++;
    }
}

console.log(`✓ Contract package renamed:`);
console.log(`    ${current}`);
console.log(`  → ${next}`);
console.log(`  Updated ${changed} file(s): cdm.json, contracts/leaderboard/Cargo.toml.`);
console.log("");
console.log("Next:");
console.log("  1. npm run dev   → verify your mod at http://localhost:3000/?mock");
console.log("  2. pg build");
console.log("  3. pg deploy --contracts --playground --moddable \\");
console.log("       --domain <your-domain> --signer phone --buildDir dist");
console.log("");
console.log("The name is high-entropy and unowned, so it claims cleanly under your signer.");
