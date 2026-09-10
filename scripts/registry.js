// The registry is the organiser's list of identity commitments, in
// registration order. It is public by design: a commitment reveals nothing
// about the secret behind it.
const fs = require("fs");
const path = require("path");
const appRoot = require("app-root-path");
const { SNARK_SCALAR_FIELD, WIDTH, toDecimal } = require("./merkleUtils");

const REGISTRY_PATH = path.join(appRoot.path, "registry.json");

function validateCommitment(value) {
    let c;
    try {
        c = BigInt(value);
    } catch (err) {
        throw new Error(`A commitment must be an integer, got "${value}"`);
    }
    if (c <= 0n || c >= SNARK_SCALAR_FIELD) {
        throw new Error("Commitment is not a valid field element");
    }
    return c.toString();
}

/** @returns {{commitments: Array<String>}} decimal strings */
function loadRegistry(file = REGISTRY_PATH) {
    if (!fs.existsSync(file)) return { commitments: [] };
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!data || !Array.isArray(data.commitments)) {
        throw new Error(`${file}: expected { "commitments": [...] }`);
    }
    return { commitments: data.commitments.map(validateCommitment) };
}

function saveRegistry(registry, file = REGISTRY_PATH) {
    fs.writeFileSync(file, JSON.stringify({ commitments: registry.commitments }, null, 2) + "\n");
    return file;
}

/**
 * Appends a commitment to the registry in memory.
 * @returns {String} the normalised commitment
 */
function addCommitment(registry, value) {
    const commitment = validateCommitment(value);
    if (registry.commitments.map(toDecimal).includes(commitment)) {
        throw new Error("This commitment is already registered");
    }
    if (registry.commitments.length >= WIDTH) {
        throw new Error(`The registry is full (${WIDTH} leaves)`);
    }
    registry.commitments.push(commitment);
    return commitment;
}

module.exports = {
    REGISTRY_PATH,
    validateCommitment,
    loadRegistry,
    saveRegistry,
    addCommitment,
};
