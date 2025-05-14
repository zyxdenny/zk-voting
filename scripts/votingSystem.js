const appRoot = require('app-root-path');
const fs = require('fs');
const { saveToFile } = require('./proofUtils');
const { voters } = require(`${appRoot}/votersList.json`);

/**
 * Initializes voter registration data
 */
async function registerVoters() {
    let voter = {};
    for(let i = 0; i < voters.length; i++) {
        voter[voters[i]] = i;
    }
    await saveToFile(voter, "voter");
    console.log("Voter registration completed");
}

/**
 * Processes a vote using the provided ticket
 * @param {String} voteOption The voting option (a or b)
 * @returns {Boolean} True if vote was successful
 */
async function processVote(voteOption) {
    try {
        // Load ticket and result
        const ticketPath = `${appRoot}/ticket.json`;
        const resultPath = `${appRoot}/result.json`;
        
        if (!fs.existsSync(ticketPath)) {
            console.log("Error: Ticket not found. Please download your ticket first.");
            return false;
        }
        
        const { proof, publicSignals } = require(ticketPath);
        const result = require(resultPath);
        
        // Validate vote option
        if (voteOption !== 'a' && voteOption !== 'b') {
            console.log("Error: Invalid vote option. Please choose 'a' or 'b'.");
            return false;
        }
        
        // Verify ticket hasn't been spent
        if (result.spentTickets[publicSignals[1]]) {
            console.log("Error: Ticket has already been used.");
            return false;
        }
        
        // Verify the proof with the verification module
        const { verifyProof } = require('./proofUtils');
        const isValid = await verifyProof(proof, publicSignals);
        
        if (!isValid) {
            console.log("Error: Invalid ticket.");
            return false;
        }
        
        // Record the vote
        result.votes[voteOption] += 1;
        result.votingID = publicSignals[0];
        result.spentTickets[publicSignals[1]] = 1;
        
        // Save updated results
        await saveToFile(result, "result");
        
        console.log("Vote cast successfully!");
        return true;
        
    } catch (error) {
        console.error("Error processing vote:", error);
        return false;
    }
}

/**
 * Gets the current voting results
 * @returns {Object} The voting results
 */
function getVotingResults() {
    try {
        const result = require(`${appRoot}/result.json`);
        return {
            votingID: result.votingID,
            votes: result.votes,
            totalVotes: result.votes.a + result.votes.b
        };
    } catch (error) {
        console.error("Error getting voting results:", error);
        return null;
    }
}

module.exports = {
    registerVoters,
    processVote,
    getVotingResults
};
