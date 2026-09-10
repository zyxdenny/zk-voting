// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @dev Test double for the snarkjs-generated verifier. Accepts every proof
///      (or rejects every proof after setAccept(false)), so unit tests can
///      exercise DAOVoting's own checks (root, poll id, nullifier, vote range,
///      tally) without building the circuit. Never deploy it.
contract MockVerifier {
    bool public accept = true;

    function setAccept(bool value) external {
        accept = value;
    }

    function verifyProof(
        uint256[2] calldata,
        uint256[2][2] calldata,
        uint256[2] calldata,
        uint256[4] calldata
    ) external view returns (bool) {
        return accept;
    }
}
