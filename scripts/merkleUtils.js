// Hashing primitives and the Poseidon Merkle tree of identity commitments.
// Everything here must agree with circuits/circuit.circom.
const circomlibjs = require("circomlibjs");

// Must match `Vote(10)` in the circuit.
const DEPTH = 10;
const WIDTH = 2 ** DEPTH;

// Order of the BN254 scalar field; all circuit signals live in it.
const SNARK_SCALAR_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

// Value of an empty leaf. No secret has Poseidon(secret) == 0, so padding
// leaves can never be voted with.
const ZERO_LEAF = "0";

let poseidonPromise;
function getPoseidon() {
    if (!poseidonPromise) poseidonPromise = circomlibjs.buildPoseidonOpt();
    return poseidonPromise;
}

/** Normalises a number, BigInt, decimal string or 0x string to a decimal string. */
function toDecimal(value) {
    return BigInt(value).toString();
}

/**
 * Identity commitment: the leaf registered for a voter.
 * Matches `Poseidon(1)(secret)` in the circuit.
 */
async function computeCommitment(secret) {
    const poseidon = await getPoseidon();
    return poseidon.F.toString(poseidon([toDecimal(secret)]));
}

/**
 * Nullifier for one identity in one poll.
 * Matches `Poseidon(2)(pollId, secret)` in the circuit.
 */
async function computeNullifier(pollId, secret) {
    const poseidon = await getPoseidon();
    return poseidon.F.toString(poseidon([toDecimal(pollId), toDecimal(secret)]));
}

/**
 * Builds the Merkle tree over the registered commitments, padded with
 * ZERO_LEAF up to WIDTH leaves.
 * @param {Array<String>} commitments decimal strings, in registration order
 * @returns {{tree: Object, root: String, poseidon: Object}} root is a decimal string
 */
async function buildMerkleTree(commitments) {
    if (!Array.isArray(commitments) || commitments.length === 0) {
        throw new Error("The registry has no commitments; register at least one identity first");
    }
    if (commitments.length > WIDTH) {
        throw new Error(`The registry has ${commitments.length} commitments; the circuit supports at most ${WIDTH}`);
    }

    const poseidon = await getPoseidon();
    const leaves = new Array(WIDTH);
    for (let i = 0; i < WIDTH; i++) {
        leaves[i] = i < commitments.length ? toDecimal(commitments[i]) : ZERO_LEAF;
    }

    // Leaves are already commitments, so the leaf "hash" is the identity map.
    const tree = await merkleTree(leaves, (x) => poseidon.F.e(x), (l, r) => poseidon([l, r]));
    return { tree, root: poseidon.F.toString(tree.root), poseidon };
}

/**
 * Authentication path of one leaf, in the shape the circuit wants.
 * @returns {{siblings: Array<String>, path: Array<Number>}}
 */
function merkleProofOf(tree, poseidon, index) {
    const proof = tree.getMerkleProof(index);
    return {
        siblings: proof.lemma.slice(1, DEPTH + 1).map((x) => poseidon.F.toString(x)),
        path: Array.from(proof.circompath, Number),
    };
}

/**
 * Creates a Merkle tree object from the given input
 * @param {Array<any>} input Leafs of the merkle Tree (length must be a power of two)
 * @param {Function} leafHash Takes one input (leaf) and hashes it
 * @param {Function} nodeHash Takes two inputs (left and right node) and hashes it
 * @returns {Object} A Merkle tree with functionalities
 */
async function merkleTree(input, leafHash, nodeHash) {
    let merkle = {};

    Object.defineProperty(merkle, 'root', {
        get() { return merkle.nodes[merkle.nodes.length - 1] }
    });

    merkle.nodeHash = nodeHash;
    merkle.leafHash = leafHash;
    merkle.inputs = [...input]; // Deep copy of array
    merkle.depth = Math.log2(merkle.inputs.length);
    merkle.nodes = [];

    if (!Number.isInteger(merkle.depth)) throw new Error("Merkle tree width must be a power of two");

    // Calculate all nodes of the Merkle tree
    merkle.calculateNodes = function() {
        let nodes = [];
        for (let i of merkle.inputs) {
            nodes.push(merkle.leafHash(i));
        }
        let width = nodes.length;
        width >>= 1;
        let offset = 0;
        while (width > 0) {
            for (let i = 0; i < width; i++) {
                let j = 2 * i + offset;
                nodes.push(merkle.nodeHash(nodes[j], nodes[j + 1]));
            }
            offset += width * 2;
            width >>= 1;
        }
        return nodes;
    };

    // Returns the root of the Merkle tree
    merkle.getRoot = function() {
        return merkle.nodes[merkle.nodes.length - 1];
    };

    // Creates a Merkle proof from tree
    merkle.getMerkleProof = function(index) {
        if (merkle.inputs.length <= index) throw new Error("Invalid index");

        // Generate path
        let path = new Uint8Array(merkle.depth).fill(0);
        let base2 = (index).toString(2);
        for (let i = 0; i < base2.length; i++) {
            path[i] = Number(base2[base2.length - i - 1]);
        }

        // Build proof
        let lemma = [merkle.nodes[index]];
        let offset = 0;
        let pos = index;
        let width = merkle.inputs.length;
        for (let i = 0; i < merkle.depth; i++) {
            if (path[i]) {
                lemma.push(merkle.nodes[offset + pos - 1]);
            } else {
                lemma.push(merkle.nodes[offset + pos + 1]);
            }
            pos >>= 1;
            offset += width;
            width >>= 1;
        }
        lemma.push(merkle.getRoot());

        let proof = {
            path,
            lemma,
            circompath: [...path],
            calculateRoot: function() {
                let hash = this.lemma[0];
                for (let i = 0; i < this.path.length; i++) {
                    if (this.path[i]) {
                        hash = merkle.nodeHash(this.lemma[i + 1], hash);
                    } else {
                        hash = merkle.nodeHash(hash, this.lemma[i + 1]);
                    }
                }
                return hash;
            }
        };

        return proof;
    };

    // Calculate nodes on initialization
    merkle.nodes = merkle.calculateNodes();

    return merkle;
}

module.exports = {
    DEPTH,
    WIDTH,
    SNARK_SCALAR_FIELD,
    ZERO_LEAF,
    getPoseidon,
    toDecimal,
    computeCommitment,
    computeNullifier,
    buildMerkleTree,
    merkleProofOf,
    merkleTree,
};
