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

// Verifies that lemma[0] is a leaf of the tree whose root is lemma[depth + 1].
// lemma[1..depth] are the sibling hashes along the path; path[i] is 0 when
// the running hash is the left child at level i and 1 when it is the right.
template MerkleProof(depth) {
    signal input lemma[depth + 2];
    signal input path[depth];

    component selectors[depth];
    component hashers[depth];

    // Initialize first level
    selectors[0] = Selector();
    hashers[0] = HashLeftRight();

    selectors[0].input_elem <== lemma[0];
    selectors[0].lemma_elem <== lemma[1];
    selectors[0].path_elem <== path[0];

    hashers[0].left <== selectors[0].left;
    hashers[0].right <== selectors[0].right;

    // Process remaining levels
    for (var i = 1; i < depth; i++) {
        selectors[i] = Selector();
        hashers[i] = HashLeftRight();

        selectors[i].path_elem <== path[i];
        selectors[i].lemma_elem <== lemma[i + 1];
        selectors[i].input_elem <== hashers[i - 1].hash;

        hashers[i].left <== selectors[i].left;
        hashers[i].right <== selectors[i].right;
    }

    // Verify root matches
    lemma[depth + 1] === hashers[depth - 1].hash;
}

// One anonymous ballot.
//
// Public signals (in this order, which is also the order snarkjs emits them
// and the order DAOVoting.submitVote expects them):
//   root       Merkle root of the registered voter set. Binds the proof to
//              one specific poll: the contract only accepts its own root.
//   nullifier  Poseidon(root, leaf). Deterministic per voter per poll, so the
//              contract can reject a second ballot without learning who voted.
//   vote       0 = no, 1 = yes. Part of the proof, so a relayer that submits
//              the ballot on the voter's behalf cannot flip it.
//
// Private signals:
//   lemma      [leaf, sibling_0, ..., sibling_{depth-1}, root]
//   path       direction bits for the Merkle path
template Vote(depth) {
    signal input root;
    signal input nullifier;
    signal input vote;
    signal input lemma[depth + 2];
    signal input path[depth];

    // 1. The leaf is in the tree described by lemma/path ...
    component merkleProof = MerkleProof(depth);
    merkleProof.lemma <== lemma;
    merkleProof.path <== path;

    // 2. ... and that tree is the public one. Without this line a prover could
    //    build a private tree containing any leaf and still satisfy step 1.
    lemma[depth + 1] === root;

    // 3. The nullifier is derived from this poll and this leaf, nothing else.
    component poseidon = Poseidon(2);
    poseidon.inputs[0] <== root;
    poseidon.inputs[1] <== lemma[0];
    poseidon.out === nullifier;

    // 4. The ballot is binary.
    vote * (1 - vote) === 0;
}

component main { public [root, nullifier, vote] } = Vote(10);
