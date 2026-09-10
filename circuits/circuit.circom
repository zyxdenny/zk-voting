pragma circom 2.2.2;
include "../node_modules/circomlib/circuits/poseidon.circom";

template HashLeftRight() {
    signal input left;
    signal input right;
    signal output hash;

    component hasher = Poseidon(2);
    hasher.inputs[0] <== left;
    hasher.inputs[1] <== right;
    hash <== hasher.out;
}

// Orders (current, sibling) into (left, right) according to one path bit.
template Selector() {
    signal input input_elem;
    signal input lemma_elem;
    signal input path_elem;
    signal output left;
    signal output right;

    signal left_selector_1;
    signal left_selector_2;
    signal right_selector_1;
    signal right_selector_2;

    // Ensure path_elem is binary (0 or 1)
    path_elem * (1 - path_elem) === 0;

    // Calculate selectors based on path direction
    left_selector_1 <== (1 - path_elem) * input_elem;
    left_selector_2 <== path_elem * lemma_elem;
    right_selector_1 <== path_elem * input_elem;
    right_selector_2 <== (1 - path_elem) * lemma_elem;

    // Determine final left and right values
    left <== left_selector_1 + left_selector_2;
    right <== right_selector_1 + right_selector_2;
}

// Recomputes the Merkle root from a leaf and its authentication path.
// siblings[i] is the sibling hash at level i; path[i] is 0 when the running
// hash is the left child at that level and 1 when it is the right child.
template MerkleRoot(depth) {
    signal input leaf;
    signal input siblings[depth];
    signal input path[depth];
    signal output root;

    component selectors[depth];
    component hashers[depth];
    signal levelHash[depth + 1];

    levelHash[0] <== leaf;
    for (var i = 0; i < depth; i++) {
        selectors[i] = Selector();
        hashers[i] = HashLeftRight();

        selectors[i].input_elem <== levelHash[i];
        selectors[i].lemma_elem <== siblings[i];
        selectors[i].path_elem <== path[i];

        hashers[i].left <== selectors[i].left;
        hashers[i].right <== selectors[i].right;
        levelHash[i + 1] <== hashers[i].hash;
    }
    root <== levelHash[depth];
}

// One anonymous ballot.
//
// Public signals, in this order (which is also the order snarkjs emits them
// and the order DAOVoting.submitVote expects them):
//   root       Merkle root of the registered commitments. The contract only
//              accepts its own root, so the proof is bound to one voter set.
//   pollId     Identifier of the poll, derived by the contract from the chain
//              id and its own address. The contract only accepts its own id.
//   nullifier  Poseidon(pollId, secret). Deterministic per identity per poll:
//              a second ballot from the same identity in the same poll is
//              detected, while the same identity in a different poll produces
//              an unrelated nullifier, so ballots cannot be linked across polls.
//   vote       0 = no, 1 = yes. Part of the proof, so whoever relays the
//              transaction cannot change it.
//
// Private signals:
//   secret     The voter's identity secret. Its commitment Poseidon(secret) is
//              the leaf that was registered; the secret itself never leaves the
//              voter's machine.
//   siblings   Merkle authentication path for that leaf
//   path       Direction bits for the path
template Vote(depth) {
    signal input root;
    signal input pollId;
    signal input nullifier;
    signal input vote;
    signal input secret;
    signal input siblings[depth];
    signal input path[depth];

    // 1. The leaf is the commitment to the secret the prover holds. Knowing a
    //    registered commitment is not enough; the preimage is required.
    component commitment = Poseidon(1);
    commitment.inputs[0] <== secret;

    // 2. That leaf is in the tree with the public root.
    component tree = MerkleRoot(depth);
    tree.leaf <== commitment.out;
    tree.siblings <== siblings;
    tree.path <== path;
    tree.root === root;

    // 3. The nullifier is derived from this poll and this secret, nothing else.
    component nullifierHasher = Poseidon(2);
    nullifierHasher.inputs[0] <== pollId;
    nullifierHasher.inputs[1] <== secret;
    nullifierHasher.out === nullifier;

    // 4. The ballot is binary.
    vote * (1 - vote) === 0;
}

component main { public [root, pollId, nullifier, vote] } = Vote(10);
