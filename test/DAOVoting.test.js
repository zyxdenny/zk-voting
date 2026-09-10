// Unit tests for the contract's own checks. The verifier is a mock, so these
// run without circom or a circuit build. See e2e.test.js for real proofs.
const { expect } = require("chai");
const { ethers } = require("hardhat");

const SNARK_SCALAR_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const ROOT = 12345n;
const A = [1, 2];
const B = [[3, 4], [5, 6]];
const C = [7, 8];

async function expectedPollId(poll) {
  const { chainId } = await ethers.provider.getNetwork();
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint256", "address"],
    [chainId, await poll.getAddress()]
  );
  return BigInt(ethers.keccak256(encoded)) % SNARK_SCALAR_FIELD;
}

describe("DAOVoting (unit, MockVerifier)", function () {
  let mock;
  let daoVoting;
  let pollId;

  // Public signals in circuit order: [root, pollId, nullifier, vote]
  const signals = (nullifier, vote, overrides = {}) => [
    overrides.root ?? ROOT,
    overrides.pollId ?? pollId,
    nullifier,
    vote,
  ];

  beforeEach(async function () {
    mock = await ethers.deployContract("MockVerifier");
    daoVoting = await ethers.deployContract("DAOVoting", [await mock.getAddress(), ROOT]);
    pollId = await daoVoting.pollId();
  });

  it("records the verifier and the voter set at deployment", async function () {
    expect(await daoVoting.verifier()).to.equal(await mock.getAddress());
    expect(await daoVoting.merkleRoot()).to.equal(ROOT);
    expect(await daoVoting.getResults()).to.deep.equal([0n, 0n]);
  });

  it("derives its poll id from the chain id and its own address", async function () {
    expect(pollId).to.equal(await expectedPollId(daoVoting));
    expect(pollId).to.be.lessThan(SNARK_SCALAR_FIELD);

    const other = await ethers.deployContract("DAOVoting", [await mock.getAddress(), ROOT]);
    expect(await other.pollId()).to.not.equal(pollId);
  });

  it("refuses to deploy without a verifier, without a root, or with a root outside the field", async function () {
    const DAOVoting = await ethers.getContractFactory("DAOVoting");
    await expect(DAOVoting.deploy(ethers.ZeroAddress, ROOT)).to.be.revertedWith("Verifier required");
    await expect(DAOVoting.deploy(await mock.getAddress(), 0)).to.be.revertedWith("Merkle root required");
    await expect(DAOVoting.deploy(await mock.getAddress(), SNARK_SCALAR_FIELD)).to.be.revertedWith("Merkle root not in field");
  });

  it("counts a yes ballot and emits VoteSubmitted", async function () {
    await expect(daoVoting.submitVote(A, B, C, signals(456, 1)))
      .to.emit(daoVoting, "VoteSubmitted")
      .withArgs(456, 1);

    const [yes, no] = await daoVoting.getResults();
    expect(yes).to.equal(1);
    expect(no).to.equal(0);
    expect(await daoVoting.nullifiers(456)).to.equal(true);
  });

  it("counts a no ballot", async function () {
    await daoVoting.submitVote(A, B, C, signals(789, 0));

    const [yes, no] = await daoVoting.getResults();
    expect(yes).to.equal(0);
    expect(no).to.equal(1);
  });

  it("rejects a proof made against a different voter set", async function () {
    await expect(daoVoting.submitVote(A, B, C, signals(456, 1, { root: ROOT + 1n })))
      .to.be.revertedWith("Unknown voter set");
  });

  it("rejects a proof made for a different poll", async function () {
    await expect(daoVoting.submitVote(A, B, C, signals(456, 1, { pollId: pollId + 1n })))
      .to.be.revertedWith("Wrong poll");
  });

  it("rejects a second ballot with the same nullifier", async function () {
    await daoVoting.submitVote(A, B, C, signals(456, 1));
    await expect(daoVoting.submitVote(A, B, C, signals(456, 0))).to.be.revertedWith("Vote already cast");

    const [yes, no] = await daoVoting.getResults();
    expect(yes).to.equal(1);
    expect(no).to.equal(0);
  });

  it("rejects a vote value other than 0 or 1", async function () {
    await expect(daoVoting.submitVote(A, B, C, signals(456, 2))).to.be.revertedWith("Invalid vote value");
  });

  it("rejects a ballot the verifier does not accept, and keeps the nullifier unspent", async function () {
    await mock.setAccept(false);
    await expect(daoVoting.submitVote(A, B, C, signals(456, 1))).to.be.revertedWith("Invalid proof");
    expect(await daoVoting.nullifiers(456)).to.equal(false);

    await mock.setAccept(true);
    await daoVoting.submitVote(A, B, C, signals(456, 1));
    expect(await daoVoting.nullifiers(456)).to.equal(true);
  });

  it("does not care which account relays the ballot", async function () {
    const [, relayer] = await ethers.getSigners();
    await daoVoting.connect(relayer).submitVote(A, B, C, signals(456, 1));

    const [yes] = await daoVoting.getResults();
    expect(yes).to.equal(1);
  });
});
