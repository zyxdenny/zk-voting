const circomlibjs = require("circomlibjs");
const appRoot = require('app-root-path');
const fs = require('fs');
const { voters } = require(`${appRoot}/votersList.json`);

/**
 * Creates a Merkle tree from the given voters list
 * @returns {Object} The Merkle tree object
 */
async function buildMerkleTree() {
    const poseidon = await circomlibjs.buildPoseidonOpt();

    // Hash functions
    const leafHash = (input) => poseidon([input]);
    const nodeHash = (left, right) => poseidon([left, right]);

    // Create inputs array
    let inputs = new Array(2**10);
    for (let i = 0; i < inputs.length; i++) {
        if(i < voters.length) {
            inputs[i] = voters[i];
        } else {
            inputs[i] = voters[voters.length - 1];
        }
    }

    // Build the tree
    const tree = await merkleTree(inputs, leafHash, nodeHash);
    console.log("-------------- Merkle Tree ------------------");
    console.log("Root: ", poseidon.F.toString(tree.root));

    return { tree, poseidon };
}

/**
 * Builds a Merkle tree and returns key information
 * @returns {Object} Contains tree, root, and poseidon
 */
async function initiatePoll() {
    const { tree, poseidon } = await buildMerkleTree();
    const root = poseidon.F.toString(tree.root);
    return { tree, root, poseidon };
}

/**
 * Generate a nullifier for a voter
 * @param {String} root The Merkle root
 * @param {String} addr The voter address
 * @returns {String} The nullifier
 */
async function generateNullifier(root, addr) {
    const poseidon = await circomlibjs.buildPoseidonOpt();
    const addrHash = poseidon([addr]);
    return poseidon.F.toString(poseidon([root, addrHash]));
}

/**
 * Creates a Merkle tree object from the given input
 * @param {Array<any>} input Leafs of the merkle Tree
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
        if (merkle.inputs.length <= index) throw "Invalid index";

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
    initiatePoll,
    generateNullifier,
    merkleTree
};
