// `npm run verify`: proves and verifies one ballot off-chain, without a node.
// Uses the local identity, registry.json and POLL_ID (default 1). Nothing is
// submitted anywhere; this only checks the circuit build.
const { loadIdentity } = require("./identity");
const { loadRegistry } = require("./registry");
const { generateProof, verifyProof, parseVote } = require("./proofUtils");

async function main() {
    const identity = await loadIdentity();
    const { commitments } = loadRegistry();
    const pollId = process.env.POLL_ID || "1";
    const vote = parseVote(process.env.VOTE || "yes");

    const { proof, publicSignals } = await generateProof({ identity, commitments, pollId, vote });
    console.log("-------------- Public Signals [root, pollId, nullifier, vote] ------------------");
    console.log(publicSignals);
    console.log("---------------- Proof ----------------");
    console.log(JSON.stringify(proof, null, 2));

    const ok = await verifyProof(proof, publicSignals);
    console.log(ok ? "Verification OK" : "Invalid proof");
    if (!ok) process.exitCode = 1;
}

main()
    .then(() => process.exit(process.exitCode || 0))
    .catch((error) => {
        console.error(error.message || error);
        process.exit(1);
    });
