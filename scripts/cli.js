// Interactive entry points. Every prompt can be pre-answered with an
// environment variable so the same commands work in scripts and CI:
//   IDENTITY=alice.json npm run identity     (default: identity.json)
//   COMMITMENT=123...   npm run register     (default: the identity file's commitment)
//   VOTE=yes            npm run vote
const promptSync = require("prompt-sync");
const { buildMerkleTree } = require("./merkleUtils");
const { generateIdentity, saveIdentity, loadIdentity, identityPath } = require("./identity");
const { loadRegistry, saveRegistry, addCommitment, REGISTRY_PATH } = require("./registry");
const { parseVote } = require("./proofUtils");
const { castBallot, getPoll, readResults } = require("./votingSystem");

function ask(envName, question) {
    const preset = process.env[envName];
    if (preset !== undefined && preset !== "") return preset;
    const prompt = promptSync({ sigint: true });
    const answer = prompt(question);
    if (answer === null) throw new Error("Aborted");
    return answer;
}

/**
 * Voter: create an identity. The file holds the secret; only the commitment
 * is handed to the organiser.
 */
async function createIdentity() {
    const identity = await generateIdentity();
    const file = saveIdentity(identity, identityPath(), { force: process.env.FORCE === "1" });
    console.log(`Identity saved to ${file}`);
    console.log(`Commitment: ${identity.commitment}`);
    console.log("Keep the file private. Give only the commitment to the poll organiser (`npm run register`).");
}

/**
 * Organiser: add a commitment to the registry. Defaults to the local
 * identity file so a single machine can play both roles.
 */
async function registerIdentity() {
    const registry = loadRegistry();
    let commitment = process.env.COMMITMENT;
    if (!commitment) {
        const identity = await loadIdentity();
        commitment = identity.commitment;
    }
    addCommitment(registry, commitment);
    saveRegistry(registry);

    const { root } = await buildMerkleTree(registry.commitments);
    console.log(`Registered commitment ${commitment}`);
    console.log(`Registry: ${registry.commitments.length} voter(s), Merkle root ${root}`);
    console.log("The root is fixed when the poll is deployed, so register everyone before `npm run deploy`.");
}

/** Prints the registry and the root a deployment would use. */
async function showRegistry() {
    const registry = loadRegistry();
    console.log(`${REGISTRY_PATH}: ${registry.commitments.length} commitment(s)`);
    registry.commitments.forEach((c, i) => console.log(`  [${i}] ${c}`));
    if (registry.commitments.length > 0) {
        const { root } = await buildMerkleTree(registry.commitments);
        console.log(`Merkle root: ${root}`);
    }
}

/**
 * Voter: prove eligibility with the local identity and submit the ballot to
 * the deployed DAOVoting contract.
 * @param {Object} hre Hardhat runtime environment
 */
async function castVote(hre) {
    const identity = await loadIdentity();
    const vote = parseVote(ask("VOTE", "Vote yes or no? "));

    console.log(`Proving that identity ${identity.commitment.slice(0, 12)}... may vote ...`);
    const { receipt, nullifier, results } = await castBallot(hre, { identity, vote });

    console.log(`Ballot accepted in block ${receipt.blockNumber} (tx ${receipt.hash})`);
    console.log(`Nullifier spent: ${nullifier}`);
    printResults(results);
}

/**
 * Prints the tally.
 * @param {Object} hre Hardhat runtime environment
 */
async function showResults(hre) {
    const poll = await getPoll(hre);
    console.log(`Poll ${await poll.getAddress()}`);
    console.log(`  pollId: ${await poll.pollId()}`);
    console.log(`  root:   ${await poll.merkleRoot()}`);
    printResults(await readResults(poll));
}

function printResults({ yes, no }) {
    console.log("\nCurrent voting results:");
    console.log(`  Yes: ${yes}`);
    console.log(`  No:  ${no}`);
    console.log(`  Total: ${yes + no}`);
}

module.exports = {
    createIdentity,
    registerIdentity,
    showRegistry,
    castVote,
    showResults,
};
