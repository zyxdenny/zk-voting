// A voter identity is one random field element, the secret. Its commitment
// Poseidon(secret) is what gets registered; the secret stays with the voter.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const appRoot = require("app-root-path");
const { computeCommitment, toDecimal } = require("./merkleUtils");

const DEFAULT_IDENTITY_PATH = path.join(appRoot.path, "identity.json");

/** Path of the identity file: $IDENTITY if set, else <repo>/identity.json. */
function identityPath() {
    return process.env.IDENTITY ? path.resolve(process.env.IDENTITY) : DEFAULT_IDENTITY_PATH;
}

/** Generates a fresh identity. 31 random bytes are always below the field order. */
async function generateIdentity() {
    let secret;
    do {
        secret = BigInt("0x" + crypto.randomBytes(31).toString("hex"));
    } while (secret === 0n);

    const secretStr = secret.toString();
    return {
        secret: secretStr,
        commitment: await computeCommitment(secretStr),
        createdAt: new Date().toISOString(),
    };
}

/**
 * Writes an identity file, refusing to overwrite an existing one unless forced.
 * @returns {String} the path written
 */
function saveIdentity(identity, file = identityPath(), { force = false } = {}) {
    if (fs.existsSync(file) && !force) {
        throw new Error(`${file} already exists. Set FORCE=1 to overwrite it (this destroys the old identity for good).`);
    }
    fs.writeFileSync(file, JSON.stringify(identity, null, 2) + "\n", { mode: 0o600 });
    return file;
}

/** Loads an identity file and checks that its commitment matches its secret. */
async function loadIdentity(file = identityPath()) {
    if (!fs.existsSync(file)) {
        throw new Error(`No identity at ${file}. Run \`npm run identity\` first.`);
    }
    const identity = JSON.parse(fs.readFileSync(file, "utf8"));
    if (typeof identity.secret !== "string" || identity.secret === "") {
        throw new Error(`${file} has no secret`);
    }
    const commitment = await computeCommitment(identity.secret);
    if (identity.commitment !== undefined && toDecimal(identity.commitment) !== commitment) {
        throw new Error(`${file} is inconsistent: its commitment does not match its secret`);
    }
    return { ...identity, secret: toDecimal(identity.secret), commitment };
}

module.exports = {
    DEFAULT_IDENTITY_PATH,
    identityPath,
    generateIdentity,
    saveIdentity,
    loadIdentity,
};
