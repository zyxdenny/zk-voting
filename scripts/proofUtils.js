const { groth16 } = require("snarkjs");
const appRoot = require("app-root-path");
const fs = require("fs");
const path = require("path");
const { buildMerkleTree, generateNullifier, voterIndex } = require("./merkleUtils");

const BUILD_DIR = path.join(appRoot.path, "circuits", "build");
const WASM_PATH = path.join(BUILD_DIR, "circuit_js", "circuit.wasm");
const ZKEY_PATH = path.join(BUILD_DIR, "keys", "circuit_0000.zkey");
const VKEY_PATH = path.join(BUILD_DIR, "keys", "verification_key.json");
const VERIFIER_SOL_PATH = path.join(appRoot.path, "contracts", "Verifier.sol");

/** True once `npm run start-poll` has produced the wasm, zkey and vkey. */
function circuitIsBuilt() {
    return [WASM_PATH, ZKEY_PATH, VKEY_PATH].every((p) => fs.existsSync(p));
}

function ensureBuilt() {
    if (!circuitIsBuilt()) {
        throw new Error("Circuit artifacts missing. Run `npm run start-poll` first.");
    }
}

/**
 * Normalises user input into the circuit's vote signal.
 * @param {String|Number} value yes/no, y/n, 1/0, true/false
 * @returns {Number} 1 for yes, 0 for no
 */
function parseVote(value) {
    const v = String(value).trim().toLowerCase();
    if (["1", "yes", "y", "true"].includes(v)) return 1;
    if (["0", "no", "n", "false"].includes(v)) return 0;
    throw new Error(`Invalid vote "${value}". Use yes or no.`);
}

/**
 * Assembles every circuit input for one ballot.
 * @param {String} addr Registered voter address
 * @param {Number} vote 0 or 1
 * @returns {Object} {root, nullifier, vote, lemma, path} with field elements as decimal strings
 */
async function buildBallotInputs(addr, vote) {
    const index = voterIndex(addr);
    if (index < 0) throw new Error(`Address ${addr} is not a registered voter`);

    const { tree, root, poseidon } = await buildMerkleTree();
    const merkleProof = tree.getMerkleProof(index);
    const nullifier = await generateNullifier(root, addr);

    return {
        root,
        nullifier,
        vote: String(vote),
        lemma: merkleProof.lemma.map((x) => poseidon.F.toString(x)),
        path: Array.from(merkleProof.circompath, Number),
    };
}

/**
 * Runs the prover on already-assembled inputs. Throws if the inputs violate a
 * circuit constraint (the witness calculator reports "Assert Failed").
 * @param {Object} inputs see buildBallotInputs
 * @returns {{proof: Object, publicSignals: Array<String>}}
 */
async function proveInputs(inputs) {
    ensureBuilt();
    return groth16.fullProve(inputs, WASM_PATH, ZKEY_PATH);
}

/**
 * Generates a ballot proof for a registered voter.
 * @param {String} addr Voter address
 * @param {Number} vote 0 or 1
 * @param {Object} [overrides] Replace individual circuit inputs (used by tests
 *                             to show that tampered inputs are rejected)
 * @returns {{proof: Object, publicSignals: Array<String>, inputs: Object}}
 *          publicSignals are [root, nullifier, vote]
 */
async function generateProof(addr, vote, overrides = {}) {
    ensureBuilt();
    const inputs = { ...(await buildBallotInputs(addr, vote)), ...overrides };
    const { proof, publicSignals } = await proveInputs(inputs);
    return { proof, publicSignals, inputs };
}

/**
 * Verifies a proof off-chain against the exported verification key.
 * @returns {Boolean}
 */
async function verifyProof(proof, publicSignals) {
    ensureBuilt();
    const vKey = JSON.parse(fs.readFileSync(VKEY_PATH, "utf8"));
    return groth16.verify(vKey, publicSignals, proof);
}

/**
 * Converts a proof into the four arguments DAOVoting.submitVote takes.
 * @returns {{a: Array, b: Array, c: Array, input: Array}} hex strings
 */
async function toSolidityCalldata(proof, publicSignals) {
    const calldata = await groth16.exportSolidityCallData(proof, publicSignals);
    const [a, b, c, input] = JSON.parse(`[${calldata}]`);
    return { a, b, c, input };
}

/**
 * Saves data to <repo root>/<filename>.json
 */
function saveToFile(data, filename) {
    const target = path.join(appRoot.path, `${filename}.json`);
    fs.writeFileSync(target, JSON.stringify(data, null, 2), "utf8");
    return target;
}

function loadJson(filename) {
    const target = path.join(appRoot.path, `${filename}.json`);
    if (!fs.existsSync(target)) return null;
    return JSON.parse(fs.readFileSync(target, "utf8"));
}

module.exports = {
    BUILD_DIR,
    VERIFIER_SOL_PATH,
    circuitIsBuilt,
    parseVote,
    buildBallotInputs,
    proveInputs,
    generateProof,
    verifyProof,
    toSolidityCalldata,
    saveToFile,
    loadJson,
};
