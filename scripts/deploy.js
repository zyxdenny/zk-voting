// Deploys the Groth16 verifier snarkjs generated for this circuit and one
// DAOVoting poll bound to the current votersList.json.
//
//   npm run node      (terminal 1)
//   npm run deploy    (terminal 2)  -> writes deployment.json
const hre = require("hardhat");
const fs = require("fs");
const { voters, buildMerkleTree } = require("./merkleUtils");
const { VERIFIER_SOL_PATH } = require("./proofUtils");
const { DEPLOYMENT_PATH } = require("./votingSystem");

async function main() {
    if (!fs.existsSync(VERIFIER_SOL_PATH)) {
        throw new Error("contracts/Verifier.sol not found. Run `npm run start-poll` to build the circuit and export the verifier.");
    }

    const { root } = await buildMerkleTree();
    const [deployer] = await hre.ethers.getSigners();
    const net = await hre.ethers.provider.getNetwork();

    console.log(`Deploying to ${hre.network.name} (chain ${net.chainId}) from ${deployer.address}`);
    console.log(`Voter set: ${voters.length} addresses, Merkle root ${root}`);

    const verifier = await hre.ethers.deployContract("Groth16Verifier");
    await verifier.waitForDeployment();
    const verifierAddress = await verifier.getAddress();
    console.log(`Groth16Verifier deployed to: ${verifierAddress}`);

    const daoVoting = await hre.ethers.deployContract("DAOVoting", [verifierAddress, root]);
    await daoVoting.waitForDeployment();
    const daoVotingAddress = await daoVoting.getAddress();
    console.log(`DAOVoting deployed to:       ${daoVotingAddress}`);

    const deployment = {
        network: hre.network.name,
        chainId: Number(net.chainId),
        verifier: verifierAddress,
        daoVoting: daoVotingAddress,
        merkleRoot: root,
        voters: voters.length,
        deployedAt: new Date().toISOString(),
    };
    fs.writeFileSync(DEPLOYMENT_PATH, JSON.stringify(deployment, null, 2));
    console.log(`Wrote ${DEPLOYMENT_PATH}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error.message || error);
        process.exit(1);
    });
