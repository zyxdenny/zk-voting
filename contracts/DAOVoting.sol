// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @dev Matches the verifier snarkjs generates for circuits/circuit.circom
///      (`snarkjs zkey export solidityverifier`), which has three public
///      signals: [merkleRoot, nullifier, vote].
interface IVerifier {
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[3] calldata input
    ) external view returns (bool);
}

/// @title Anonymous yes/no poll gated by a zk-SNARK membership proof.
/// @notice One contract is one poll. The registered voter set is fixed at
///         deployment as a Merkle root; a ballot is accepted when it carries a
///         valid proof for that root and an unused nullifier. The contract
///         never looks at msg.sender, so ballots can be relayed.
contract DAOVoting {
    IVerifier public immutable verifier;

    /// @notice Poseidon Merkle root of the eligible voters. Proofs for any
    ///         other root are rejected, so an attacker cannot vote with a tree
    ///         of their own making.
    uint256 public immutable merkleRoot;

    /// @notice Nullifiers already spent. Poseidon(root, leaf) is deterministic
    ///         per voter, which is what makes a second ballot detectable.
    mapping(uint256 => bool) public nullifiers;

    uint256 public yesVotes;
    uint256 public noVotes;

    event VoteSubmitted(uint256 nullifier, uint256 voteValue, uint256 merkleRoot);

    constructor(address _verifier, uint256 _merkleRoot) {
        require(_verifier != address(0), "Verifier required");
        require(_merkleRoot != 0, "Merkle root required");
        verifier = IVerifier(_verifier);
        merkleRoot = _merkleRoot;
    }

    /**
     * @notice Submit one anonymous ballot.
     * @param a      Groth16 proof, part A
     * @param b      Groth16 proof, part B
     * @param c      Groth16 proof, part C
     * @param input  Public signals, in circuit order:
     *               input[0] Merkle root the proof was made against
     *               input[1] nullifier
     *               input[2] vote: 0 = no, 1 = yes
     */
    function submitVote(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[3] calldata input
    ) external {
        uint256 root = input[0];
        uint256 nullifier = input[1];
        uint256 voteValue = input[2];

        // Cheap checks first, proof verification (~200k gas) last.
        require(root == merkleRoot, "Unknown voter set");
        require(!nullifiers[nullifier], "Vote already cast");
        require(voteValue == 0 || voteValue == 1, "Invalid vote value");
        require(verifier.verifyProof(a, b, c, input), "Invalid proof");

        nullifiers[nullifier] = true;

        if (voteValue == 1) {
            yesVotes++;
        } else {
            noVotes++;
        }

        emit VoteSubmitted(nullifier, voteValue, root);
    }

    /// @return yes number of yes ballots
    /// @return no  number of no ballots
    function getResults() external view returns (uint256 yes, uint256 no) {
        return (yesVotes, noVotes);
    }
}
