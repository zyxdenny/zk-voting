const prompt = require('prompt-sync')();
const { generateProof, saveToFile } = require('./proofUtils');
const { processVote, getVotingResults, registerVoters } = require('./votingSystem');

/**
 * CLI command to download a voting ticket
 */
async function downloadTicket() {
    try {
        const addr = prompt('Enter your account address: ');
        const { proof, publicSignals } = await generateProof(addr);
        
        const ticket = {
            proof: proof,
            publicSignals: publicSignals
        };
        
        await saveToFile(ticket, "ticket");
    } catch (error) {
        console.error("Error downloading ticket:", error);
        process.exit(1);
    }
}

/**
 * CLI command to cast a vote
 */
async function castVote() {
    try {
        const voteOption = prompt('Enter person you want to vote for (a or b): ');
        const success = await processVote(voteOption);
        
        if (success) {
            const results = getVotingResults();
            console.log("\nCurrent voting results:");
            console.log(`Option A: ${results.votes.a} votes`);
            console.log(`Option B: ${results.votes.b} votes`);
            console.log(`Total votes: ${results.totalVotes}`);
        }
    } catch (error) {
        console.error("Error casting vote:", error);
        process.exit(1);
    }
}

/**
 * CLI command to start a new poll
 */
async function startPoll() {
    console.log("Initializing new poll...");
    await registerVoters();
    console.log("Poll initialized successfully!");
}

module.exports = {
    downloadTicket,
    castVote,
    startPoll
};
