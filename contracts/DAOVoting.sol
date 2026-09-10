// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @dev Matches the verifier snarkjs generates for circuits/circuit.circom
///      (`snarkjs zkey export solidityverifier`), which has four public
///      signals: [merkleRoot, pollId, nullifier, vote].
interface IVerifier {
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[4] calldata input
    ) external view returns (bool);
}

/// @title Anonymous yes/no poll gated by a zk-SNARK membership proof.
/// @notice One contract is one poll. The registered voter set is fixed at
///         deployment as a Merkle root of identity commitments. A ballot is
///         accepted when it carries a valid proof for that root and this
///         poll's id, with a nullifier that has not been seen before. The
///         contract never looks at msg.sender, so ballots can be relayed.
contract DAOVoting {
    /// @dev Order of the BN254 scalar field. Every public signal of the
    ///      circuit lives in this field, so anything the contract compares a
    ///      public signal against must be reduced into it.
    uint256 public constant SNARK_SCALAR_FIELD =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    IVerifier public immutable verifier;

    /// @notice Poseidon Merkle root of the registered identity commitments.
    ///         Proofs for any other root are rejected, so an attacker cannot
    ///         vote with a tree of their own making.
    uint256 public immutable merkleRoot;

    /// @notice External nullifier of this poll: keccak256(chainid, this)
    ///         reduced into the scalar field. Voters derive their nullifier
    ///         from it, so the same identity yields unrelated nullifiers in
    ///         different polls and a ballot cannot be replayed on another
    ///         deployment or another chain.
    uint256 public immutable pollId;

    /// @notice Nullifiers already spent. Poseidon(pollId, secret) is
    ///         deterministic per identity, which is what makes a second
    ///         ballot detectable without learning which leaf it came from.
    mapping(uint256 => bool) public nullifiers;

    uint256 public yesVotes;
    uint256 public noVotes;

    event VoteSubmitted(uint256 indexed nullifier, uint256 voteValue);

    constructor(address _verifier, uint256 _merkleRoot) {
        require(_verifier != address(0), "Verifier required");
        require(_merkleRoot != 0, "Merkle root required");
        require(_merkleRoot < SNARK_SCALAR_FIELD, "Merkle root not in field");
        verifier = IVerifier(_verifier);
        merkleRoot = _merkleRoot;
        pollId = uint256(keccak256(abi.encode(block.chainid, address(this)))) % SNARK_SCALAR_FIELD;
    }

    /**
     * @notice Submit one anonymous ballot.
     * @param a      Groth16 proof, part A
     * @param b      Groth16 proof, part B
     * @param c      Groth16 proof, part C
     * @param input  Public signals, in circuit order:
     *               input[0] Merkle root the proof was made against
     *               input[1] poll id the nullifier was derived from
     *               input[2] nullifier
     *               input[3] vote: 0 = no, 1 = yes
     */
    function submitVote(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[4] calldata input
    ) external {
        uint256 nullifier = input[2];
        uint256 voteValue = input[3];

        // Cheap checks first, proof verification (~200k gas) last.
        require(input[0] == merkleRoot, "Unknown voter set");
        require(input[1] == pollId, "Wrong poll");
        require(!nullifiers[nullifier], "Vote already cast");
        require(voteValue <= 1, "Invalid vote value");
        require(verifier.verifyProof(a, b, c, input), "Invalid proof");

        nullifiers[nullifier] = true;

        if (voteValue == 1) {
            yesVotes++;
        } else {
            noVotes++;
        }

        emit VoteSubmitted(nullifier, voteValue);
    }

    /// @return yes number of yes ballots
    /// @return no  number of no ballots
    function getResults() external view returns (uint256 yes, uint256 no) {
        return (yesVotes, noVotes);
    }
}
