// End-to-end: real circuit, real Groth16 proofs, the verifier snarkjs exported.
// Needs `npm run build-circuit` to have run; skips itself otherwise.
const { expect } = require("chai");
const hre = require("hardhat");
const { ethers } = hre;
const fs = require("fs");

const {
  circuitIsBuilt,
  VERIFIER_SOL_PATH,
  generateProof,
  verifyProof,
  toSolidityCalldata,
} = require("../scripts/proofUtils");
const { buildMerkleTree, computeNullifier } = require("../scripts/merkleUtils");
const { generateIdentity } = require("../scripts/identity");
const { castBallot, readResults } = require("../scripts/votingSystem");

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
  let identities;
  let commitments;
  let root;
  let pollA;
  let pollB;
  let pollIdA;
  let pollIdB;

  const ballotFor = (identity, pollId, vote) => ({ identity, commitments, pollId, vote });

  before(async function () {
    if (!circuitIsBuilt() || !fs.existsSync(VERIFIER_SOL_PATH)) {
      console.log("      circuit not built; run `npm run build-circuit` to enable the end-to-end tests");
      this.skip();
    }

    identities = [];
    for (let i = 0; i < 5; i++) identities.push(await generateIdentity());
    commitments = identities.map((id) => id.commitment);
    ({ root } = await buildMerkleTree(commitments));

    const verifier = await ethers.deployContract("Groth16Verifier");
    pollA = await ethers.deployContract("DAOVoting", [await verifier.getAddress(), root]);
    pollB = await ethers.deployContract("DAOVoting", [await verifier.getAddress(), root]);
    pollIdA = (await pollA.pollId()).toString();
    pollIdB = (await pollB.pollId()).toString();
  });

  after(async function () {
    // snarkjs keeps a worker pool alive; release it so mocha can exit.
    if (globalThis.curve_bn128) await globalThis.curve_bn128.terminate();
  });

  it("emits public signals in the order the contract expects", async function () {
    const { proof, publicSignals } = await generateProof(ballotFor(identities[0], pollIdA, 1));
    expect(publicSignals).to.deep.equal([
      root,
      pollIdA,
      await computeNullifier(pollIdA, identities[0].secret),
      "1",
    ]);
    expect(await verifyProof(proof, publicSignals)).to.equal(true);
  });

  it("accepts a valid ballot", async function () {
    const { proof, publicSignals } = await generateProof(ballotFor(identities[0], pollIdA, 1));
    await expect(submit(pollA, proof, publicSignals))
      .to.emit(pollA, "VoteSubmitted")
      .withArgs(BigInt(publicSignals[2]), 1);
    expect(await readResults(pollA)).to.deep.equal({ yes: 1, no: 0 });
  });

  it("casts a ballot through the CLI code path", async function () {
    const { nullifier, results } = await castBallot(
      hre,
      { identity: identities[1], vote: 0 },
      { poll: pollA, commitments }
    );
    expect(nullifier).to.equal(await computeNullifier(pollIdA, identities[1].secret));
    expect(results).to.deep.equal({ yes: 1, no: 1 });
  });

  it("rejects the same identity twice, even with a fresh proof for the other option", async function () {
    const { proof, publicSignals } = await generateProof(ballotFor(identities[0], pollIdA, 0));
    await expect(submit(pollA, proof, publicSignals)).to.be.revertedWith("Vote already cast");
    expect(await readResults(pollA)).to.deep.equal({ yes: 1, no: 1 });
  });

  it("rejects a relayer that flips the vote, then accepts the honest ballot", async function () {
    const { proof, publicSignals } = await generateProof(ballotFor(identities[2], pollIdA, 1));
    const { a, b, c, input } = await toSolidityCalldata(proof, publicSignals);

    await expect(pollA.submitVote(a, b, c, [input[0], input[1], input[2], 0])).to.be.revertedWith("Invalid proof");
    expect(await readResults(pollA)).to.deep.equal({ yes: 1, no: 1 });

    await pollA.submitVote(a, b, c, input);
    expect(await readResults(pollA)).to.deep.equal({ yes: 2, no: 1 });
  });

  it("rejects cross-poll replay and keeps one identity's ballots unlinkable across polls", async function () {
    // A ballot made for poll A is refused by poll B, which shares the voter set ...
    const forA = await generateProof(ballotFor(identities[0], pollIdA, 1));
    await expect(submit(pollB, forA.proof, forA.publicSignals)).to.be.revertedWith("Wrong poll");

    // ... while the same identity can vote in B, under an unrelated nullifier.
    const forB = await generateProof(ballotFor(identities[0], pollIdB, 0));
    expect(forB.publicSignals[2]).to.not.equal(forA.publicSignals[2]);
    await submit(pollB, forB.proof, forB.publicSignals);
    expect(await readResults(pollB)).to.deep.equal({ yes: 0, no: 1 });
  });

  it("refuses to prove with a registered commitment but the wrong secret", async function () {
    // The attacker knows identities[3]'s commitment and its position in the
    // public registry, but not the secret behind it.
    const attacker = await generateIdentity();
    await expectRejection(
      generateProof(ballotFor(identities[3], pollIdA, 1), {
        secret: attacker.secret,
        nullifier: await computeNullifier(pollIdA, attacker.secret),
      }),
      /Assert Failed/
    );
  });

  it("refuses to prove for an identity that is not registered", async function () {
    const stranger = await generateIdentity();
    await expectRejection(generateProof(ballotFor(stranger, pollIdA, 1)), /not registered/);
  });

  it("rejects a ballot proven against a forged registry", async function () {
    // The attacker registers themselves in a registry of their own. The proof
    // is valid ...
    const attacker = await generateIdentity();
    const forged = { identity: attacker, commitments: [attacker.commitment], pollId: pollIdA, vote: 1 };
    const { proof, publicSignals } = await generateProof(forged);
    expect(await verifyProof(proof, publicSignals)).to.equal(true);

    // ... but it is for a different voter set, so the contract refuses it.
    await expect(submit(pollA, proof, publicSignals)).to.be.revertedWith("Unknown voter set");

    // And the circuit refuses to attach the forged path to the real root.
    await expectRejection(generateProof(forged, { root }), /Assert Failed/);
  });

  it("refuses to prove a nullifier that does not belong to the secret", async function () {
    const stolen = await computeNullifier(pollIdA, identities[4].secret);
    await expectRejection(
      generateProof(ballotFor(identities[3], pollIdA, 1), { nullifier: stolen }),
      /Assert Failed/
    );
  });

  it("refuses to prove a non-binary vote", async function () {
    await expectRejection(generateProof(ballotFor(identities[3], pollIdA, 1), { vote: "2" }), /Assert Failed/);
  });
});
