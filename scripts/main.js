// `npm run verify`: proves and verifies one ballot off-chain, without a node.
// Useful to check the circuit build. Nothing is submitted anywhere.
const { voters } = require("./merkleUtils");
const { generateProof, verifyProof, parseVote } = require("./proofUtils");

async function main() {
    const address = process.env.VOTER || voters[0];
    const vote = parseVote(process.env.VOTE || "yes");

    const { proof, publicSignals } = await generateProof(address, vote);
    console.log("-------------- Public Signals [root, nullifier, vote] ------------------");
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
