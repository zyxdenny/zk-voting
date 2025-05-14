// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IVerifier {
    function verifyProof(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[3] memory input
    ) external view returns (bool);
}

contract DAOVoting {
    // The verifier contract that validates zk proofs
    IVerifier public verifier;
    
    // Store used nullifiers to prevent double voting
    mapping(uint256 => bool) public nullifiers;
    
    // Track vote counts (for demonstration purposes)
    uint256 public yesVotes;
    uint256 public noVotes;
    
    // Event emitted when a vote is cast
    event VoteSubmitted(uint256 nullifier, uint256 voteValue, uint256 merkleRoot);
    
    constructor(address _verifierAddress) {
        verifier = IVerifier(_verifierAddress);
    }
    
    /**
     * @dev Submit a vote with a zero-knowledge proof
     * @param _a Part of the zk-SNARK proof
     * @param _b Part of the zk-SNARK proof
     * @param _c Part of the zk-SNARK proof
     * @param _input Public inputs to the proof:
     *        _input[0]: Merkle root of eligible voters
     *        _input[1]: Nullifier hash to prevent double voting
     *        _input[2]: Vote value (0 for No, 1 for Yes)
     */
    function submitVote(
        uint256[2] memory _a,
        uint256[2][2] memory _b,
        uint256[2] memory _c,
        uint256[3] memory _input
    ) external {
        // Extract public inputs
        uint256 merkleRoot = _input[0];
        uint256 nullifier = _input[1];
        uint256 voteValue = _input[2];
        
        // Check that the nullifier hasn't been used before
        require(!nullifiers[nullifier], "Vote already cast");
        
        // Verify the zero-knowledge proof
        require(verifier.verifyProof(_a, _b, _c, _input), "Invalid proof");
        
        // Check vote value is valid (0 or 1)
        require(voteValue == 0 || voteValue == 1, "Invalid vote value");
        
        // Mark the nullifier as used
        nullifiers[nullifier] = true;
        
        // Count the vote
        if (voteValue == 1) {
            yesVotes++;
        } else {
            noVotes++;
        }
        
        // Emit event with vote information
        emit VoteSubmitted(nullifier, voteValue, merkleRoot);
    }
    
    // Get current voting results
    function getResults() external view returns (uint256, uint256) {
        return (yesVotes, noVotes);
    }
}
