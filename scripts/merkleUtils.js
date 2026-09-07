const circomlibjs = require("circomlibjs");
const appRoot = require("app-root-path");
const { voters } = require(`${appRoot}/votersList.json`);

// Must match `Vote(10)` in circuits/circuit.circom.
const DEPTH = 10;
const WIDTH = 2 ** DEPTH;

let poseidonPromise;
function getPoseidon() {
    if (!poseidonPromise) poseidonPromise = circomlibjs.buildPoseidonOpt();
    return poseidonPromise;
}

/**
 * Position of an address in votersList.json, or -1 if it is not registered.
 * Case-insensitive: the leaf is Poseidon(address-as-field-element), which
 * does not depend on the hex casing.
 */
function voterIndex(addr) {
    if (typeof addr !== "string") return -1;
    const needle = addr.trim().toLowerCase();
    return voters.findIndex((v) => v.toLowerCase() === needle);
}

/**
 * Builds the Poseidon Merkle tree of registered voters.
 * @returns {{tree: Object, root: String, poseidon: Object}} root is a decimal string
 */
async function buildMerkleTree() {
    if (voters.length === 0) throw new Error("votersList.json has no voters");
    if (voters.length > WIDTH) {
        throw new Error(`votersList.json has ${voters.length} voters; the circuit supports at most ${WIDTH}`);
    }

    const poseidon = await getPoseidon();
    const leafHash = (input) => poseidon([input]);
    const nodeHash = (left, right) => poseidon([left, right]);

    // Pad the tree by repeating the last voter. In this scheme every leaf in
    // the tree is votable, so padding with any *other* value (0, a random
    // number) would create extra ballots. Duplicates of a real voter share
    // that voter's nullifier and therefore add nothing.
    const inputs = new Array(WIDTH);
    for (let i = 0; i < WIDTH; i++) {
        inputs[i] = i < voters.length ? voters[i] : voters[voters.length - 1];
    }

    const tree = await merkleTree(inputs, leafHash, nodeHash);
    const root = poseidon.F.toString(tree.root);
    return { tree, root, poseidon };
}

/** @deprecated kept for older callers; identical to buildMerkleTree */
async function initiatePoll() {
    return buildMerkleTree();
}

/**
 * Nullifier for one voter in one poll: Poseidon(root, Poseidon(addr)).
 * Matches `poseidon(root, lemma[0]) === nullifier` in the circuit.
 * @param {String} root Merkle root (decimal string)
 * @param {String} addr Voter address
 * @returns {String} decimal string
 */
async function generateNullifier(root, addr) {
    const poseidon = await getPoseidon();
    const leaf = poseidon([addr]);
    return poseidon.F.toString(poseidon([root, leaf]));
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
    voters,
    voterIndex,
    getPoseidon,
    buildMerkleTree,
    initiatePoll,
    generateNullifier,
    merkleTree
};
