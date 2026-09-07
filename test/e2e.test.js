// End-to-end: real circuit, real Groth16 proofs, the verifier snarkjs exported.
// Needs `npm run start-poll` to have run; skips itself otherwise.
const { expect } = require("chai");
const hre = require("hardhat");
const { ethers } = hre;
const fs = require("fs");

const {
  circuitIsBuilt,
  VERIFIER_SOL_PATH,
  generateProof,
  proveInputs,
  verifyProof,
  toSolidityCalldata,
} = require("../scripts/proofUtils");
const {
  DEPTH,
  voters,
  buildMerkleTree,
  generateNullifier,
  merkleTree,
  getPoseidon,
} = require("../scripts/merkleUtils");
const { castBallot, readResults } = require("../scripts/votingSystem");

const ATTACKER = "0x000000000000000000000000000000000000dEaD";

async function expectRejection(promise, pattern) {
  let error;
  try {
    await promise;
  } catch (err) {
    error = err;
  }
  expect(error, "expected a rejection").to.not.equal(undefined);
  expect(String(error.message || error)).to.match(pattern);
}

async function submit(poll, proof, publicSignals) {
  const { a, b, c, input } = await toSolidityCalldata(proof, publicSignals);
  return poll.submitVote(a, b, c, input);
}

// The tests that expect the circuit to refuse an input make the witness
// calculator print "ERROR: 4 Error in template Vote_... line: N" to stderr.
// That line is the circuit rejecting the input, and is what the test asserts.
describe("DAOVoting (end to end, Groth16 verifier)", function () {
  let poll;
  let root;

  before(async function () {
    if (!circuitIsBuilt() || !fs.existsSync(VERIFIER_SOL_PATH)) {
      console.log("      circuit not built; run `npm run start-poll` to enable the end-to-end tests");
      this.skip();
    }
    ({ root } = await buildMerkleTree());
    const verifier = await ethers.deployContract("Groth16Verifier");
    poll = await ethers.deployContract("DAOVoting", [await verifier.getAddress(), root]);
  });

  after(async function () {
    // snarkjs keeps a worker pool alive; release it so mocha can exit.
    if (globalThis.curve_bn128) await globalThis.curve_bn128.terminate();
  });

  it("emits public signals in the order the contract expects", async function () {
    const { proof, publicSignals } = await generateProof(voters[0], 1);
    expect(publicSignals).to.deep.equal([root, await generateNullifier(root, voters[0]), "1"]);
    expect(await verifyProof(proof, publicSignals)).to.equal(true);
  });

  it("accepts a valid ballot", async function () {
    const { proof, publicSignals } = await generateProof(voters[0], 1);
    await expect(submit(poll, proof, publicSignals))
      .to.emit(poll, "VoteSubmitted")
      .withArgs(BigInt(publicSignals[1]), 1, BigInt(root));
    expect(await readResults(poll)).to.deep.equal({ yes: 1, no: 0 });
  });

  it("casts a ballot through the CLI code path", async function () {
    const { nullifier, results } = await castBallot(hre, { address: voters[1], vote: 0 }, { poll });
    expect(nullifier).to.equal(await generateNullifier(root, voters[1]));
    expect(results).to.deep.equal({ yes: 1, no: 1 });
  });

  it("rejects the same voter twice, even with a fresh proof for the other option", async function () {
    const { proof, publicSignals } = await generateProof(voters[0], 0);
    await expect(submit(poll, proof, publicSignals)).to.be.revertedWith("Vote already cast");
    expect(await readResults(poll)).to.deep.equal({ yes: 1, no: 1 });
  });

  it("rejects a relayer that flips the vote, then accepts the honest ballot", async function () {
    const { proof, publicSignals } = await generateProof(voters[2], 1);
    const { a, b, c, input } = await toSolidityCalldata(proof, publicSignals);

    await expect(poll.submitVote(a, b, c, [input[0], input[1], 0])).to.be.revertedWith("Invalid proof");
    expect(await readResults(poll)).to.deep.equal({ yes: 1, no: 1 });

    await poll.submitVote(a, b, c, input);
    expect(await readResults(poll)).to.deep.equal({ yes: 2, no: 1 });
  });

  it("rejects a ballot proven against a forged voter tree", async function () {
    // The attacker builds a private tree that contains them and proves
    // membership in it. The proof is valid ...
    const poseidon = await getPoseidon();
    const forged = await merkleTree(
      new Array(2 ** DEPTH).fill(ATTACKER),
      (x) => poseidon([x]),
      (l, r) => poseidon([l, r])
    );
    const forgedRoot = poseidon.F.toString(forged.root);
    const merkleProof = forged.getMerkleProof(0);
    const inputs = {
      root: forgedRoot,
      nullifier: await generateNullifier(forgedRoot, ATTACKER),
      vote: "1",
      lemma: merkleProof.lemma.map((x) => poseidon.F.toString(x)),
      path: Array.from(merkleProof.circompath, Number),
    };
    const { proof, publicSignals } = await proveInputs(inputs);
    expect(await verifyProof(proof, publicSignals)).to.equal(true);

    // ... but it is for a different poll, so the contract refuses it.
    await expect(submit(poll, proof, publicSignals)).to.be.revertedWith("Unknown voter set");

    // And the circuit refuses to attach the forged path to the real root.
    await expectRejection(
      proveInputs({ ...inputs, root, nullifier: await generateNullifier(root, ATTACKER) }),
      /Assert Failed/
    );
  });

  it("refuses to prove for an address that is not registered", async function () {
    await expectRejection(generateProof(ATTACKER, 1), /not a registered voter/);
  });

  it("refuses to prove a nullifier that does not belong to the leaf", async function () {
    const stolen = await generateNullifier(root, voters[5]);
    await expectRejection(generateProof(voters[4], 1, { nullifier: stolen }), /Assert Failed/);
  });

  it("refuses to prove a non-binary vote", async function () {
    await expectRejection(generateProof(voters[3], 1, { vote: "2" }), /Assert Failed/);
  });
});
