const { groth16 } = require("snarkjs");
const appRoot = require('app-root-path');
const fs = require('fs');
const { initiatePoll, generateNullifier } = require('./merkleUtils');

/**
 * Generates a proof for a voter
 * @param {String} addr The voter address
 * @returns {Object} The proof and public signals
 */
async function generateProof(addr) {
    // Load voter data
    const voter = require(`${appRoot}/voter.json`);
    
    if(voter[addr] == undefined) {
        console.log("Invalid Voter");
        process.exit(1);
    }
    
    // Initialize poll and get Merkle tree
    const { tree, root, poseidon } = await initiatePoll();
    
    // Generate nullifier
    const vid = await generateNullifier(root, addr);

    // Get Merkle proof
    let merkleproof = tree.getMerkleProof(voter[addr]);
    console.log("-------------- Merkle Proof ------------------");
    merkleproof.lemma = merkleproof.lemma.map((x) => poseidon.F.toString(x));
    console.log(merkleproof.lemma);
    
    // Generate zkSNARK proof
    const { proof, publicSignals } = await groth16.fullProve(
        {
            votingID: root,
            lemma: merkleproof.lemma, 
            path: merkleproof.circompath,
            nullifier: vid
        },
        `${appRoot}/circuits/build/circuit_js/circuit.wasm`,
        `${appRoot}/circuits/build/keys/circuit_0000.zkey`
    );
    
    console.log("-------------- Public Signals (pp) ------------------");
    console.log(publicSignals);
    console.log("---------------- Proof (pi) ----------------");
    console.log(proof);

    return { proof, publicSignals };
}

/**
 * Verifies a zkSNARK proof
 * @param {Object} proof The proof
 * @param {Array} publicSignals The public signals
 * @returns {Boolean} True if valid, false otherwise
 */
async function verifyProof(proof, publicSignals) {
    const vKey = JSON.parse(fs.readFileSync(`${appRoot}/circuits/build/keys/verification_key.json`));
    const res = await groth16.verify(vKey, publicSignals, proof);

    if (res === true) {
        console.log("Verification OK");
        return true;
    } else {
        console.log("Invalid proof");
        return false;
    }
}

/**
 * Saves data to a JSON file
 * @param {Object} data The data to save
 * @param {String} filename The filename
 */
async function saveToFile(data, filename) {
    try {
        const jsonData = JSON.stringify(data, null, 2);
        fs.writeFileSync(`${appRoot}/${filename}.json`, jsonData, 'utf8');
        console.log(`\n${filename} Successfully Downloaded\n`);
    } catch (error) {
        console.log(error);
    }
}

module.exports = {
    generateProof,
    verifyProof,
    saveToFile
};
