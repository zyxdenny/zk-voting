// Interactive entry points. Every prompt can be pre-answered with an
// environment variable so the same commands work in scripts and CI:
//   VOTER=0x...  npm run get-ticket
//   VOTE=yes     npm run vote
const promptSync = require("prompt-sync");
const { voters, voterIndex, buildMerkleTree, generateNullifier } = require("./merkleUtils");
const { parseVote, saveToFile, loadJson } = require("./proofUtils");
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
 * CLI command to start a new poll: prints the voter set the contract will be
 * deployed with.
 */
async function startPoll() {
    const { root } = await buildMerkleTree();
    console.log(`Registered ${voters.length} voters from votersList.json`);
    console.log(`Merkle root: ${root}`);
    console.log("Next: `npm run node` in another terminal, then `npm run deploy`.");
}

/**
 * CLI command to download a voting ticket. The ticket is the voter's private
 * material for this poll; keep it to yourself.
 */
async function downloadTicket() {
    const address = ask("VOTER", "Enter your account address: ").trim();
    const index = voterIndex(address);
    if (index < 0) {
        throw new Error(`Invalid voter: ${address} is not in votersList.json`);
    }

    const { root } = await buildMerkleTree();
    const nullifier = await generateNullifier(root, address);
    const ticket = {
        address,
        leafIndex: index,
        root,
        nullifier,
        createdAt: new Date().toISOString(),
    };

    const target = saveToFile(ticket, "ticket");
    console.log(`\nTicket saved to ${target}`);
    console.log(`Nullifier: ${nullifier}`);
    console.log("Next: `npm run vote`.");
}

/**
 * CLI command to cast a vote: proves eligibility and submits the ballot to the
 * deployed DAOVoting contract.
 * @param {Object} hre Hardhat runtime environment
 */
async function castVote(hre) {
    const ticket = loadJson("ticket");
    if (!ticket) throw new Error("No ticket.json found. Run `npm run get-ticket` first.");

    const vote = parseVote(ask("VOTE", "Vote yes or no? "));

    console.log(`Proving that ${ticket.address} may vote ...`);
    const { receipt, nullifier, results } = await castBallot(hre, { address: ticket.address, vote });

    console.log(`Ballot accepted in block ${receipt.blockNumber} (tx ${receipt.hash})`);
    console.log(`Nullifier spent: ${nullifier}`);
    printResults(results);
}

/**
 * CLI command to print the tally.
 * @param {Object} hre Hardhat runtime environment
 */
async function showResults(hre) {
    const poll = await getPoll(hre);
    console.log(`Poll ${await poll.getAddress()}`);
    printResults(await readResults(poll));
}

function printResults({ yes, no }) {
    console.log("\nCurrent voting results:");
    console.log(`  Yes: ${yes}`);
    console.log(`  No:  ${no}`);
    console.log(`  Total: ${yes + no}`);
}

module.exports = {
    startPoll,
    downloadTicket,
    castVote,
    showResults,
};
