// On-chain side of a ballot: build the proof, check it locally, submit it to
// the DAOVoting contract, read the tally back.
const appRoot = require("app-root-path");
const fs = require("fs");
const path = require("path");
const { generateProof, verifyProof, toSolidityCalldata } = require("./proofUtils");
const { loadRegistry } = require("./registry");

const DEPLOYMENT_PATH = path.join(appRoot.path, "deployment.json");

function loadDeployment() {
    if (!fs.existsSync(DEPLOYMENT_PATH)) {
        throw new Error("deployment.json not found. Start a node (`npm run node`) and run `npm run deploy` first.");
    }
    return JSON.parse(fs.readFileSync(DEPLOYMENT_PATH, "utf8"));
}

/**
 * Connects to the deployed poll.
 * @param {Object} hre Hardhat runtime environment
 * @param {String} [address] Override the address recorded in deployment.json
 */
async function getPoll(hre, address) {
    let target = address;
    if (!target) {
        const deployment = loadDeployment();
        const net = await hre.ethers.provider.getNetwork();
        if (Number(net.chainId) !== Number(deployment.chainId)) {
            throw new Error(
                `deployment.json is for chain ${deployment.chainId} but the current network is chain ${net.chainId}. ` +
                "Redeploy with `npm run deploy`."
            );
        }
        target = deployment.daoVoting;
    }
    return hre.ethers.getContractAt("DAOVoting", target);
}

/**
 * Reads the tally.
 * @returns {{yes: Number, no: Number}}
 */
async function readResults(poll) {
    const [yes, no] = await poll.getResults();
    return { yes: Number(yes), no: Number(no) };
}

/**
 * Casts one ballot on-chain.
 * @param {Object} hre Hardhat runtime environment
 * @param {{identity: {secret: String}, vote: Number}} ballot the voter's identity and 0/1
 * @param {{poll?: Object, signer?: Object, commitments?: Array<String>}} [options]
 *        poll defaults to deployment.json, commitments to registry.json
 * @returns {{receipt: Object, nullifier: String, results: {yes: Number, no: Number}}}
 */
async function castBallot(hre, { identity, vote }, options = {}) {
    let poll = options.poll || (await getPoll(hre));
    if (options.signer) poll = poll.connect(options.signer);
    const commitments = options.commitments || loadRegistry().commitments;

    const [onchainRoot, pollId] = await Promise.all([poll.merkleRoot(), poll.pollId()]);

    const { proof, publicSignals } = await generateProof({
        identity,
        commitments,
        pollId: pollId.toString(),
        vote,
    });

    if (publicSignals[0] !== onchainRoot.toString()) {
        throw new Error(
            "registry.json does not match the voter set this poll was deployed with. " +
            "Either restore the registry or redeploy."
        );
    }

    if (!(await verifyProof(proof, publicSignals))) {
        throw new Error("Generated proof failed local verification; the circuit build and the verification key disagree");
    }

    const { a, b, c, input } = await toSolidityCalldata(proof, publicSignals);
    let receipt;
    try {
        const tx = await poll.submitVote(a, b, c, input);
        receipt = await tx.wait();
    } catch (err) {
        throw new Error(`Ballot rejected by the contract: ${revertReason(err)}`);
    }

    return { receipt, nullifier: publicSignals[2], results: await readResults(poll) };
}

/** Pulls the require() reason string out of an ethers/Hardhat error. */
function revertReason(err) {
    if (err && err.reason) return err.reason;
    const message = String((err && err.message) || err);
    const match = message.match(/reason string '([^']+)'/);
    return match ? match[1] : message;
}

module.exports = {
    DEPLOYMENT_PATH,
    loadDeployment,
    getPoll,
    readResults,
    castBallot,
};
