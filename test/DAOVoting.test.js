// Unit tests for the contract's own checks. The verifier is a mock, so these
// run without circom or a circuit build. See e2e.test.js for real proofs.
const { expect } = require("chai");
const { ethers } = require("hardhat");

const ROOT = 12345n;
const A = [1, 2];
const B = [[3, 4], [5, 6]];
const C = [7, 8];

describe("DAOVoting (unit, MockVerifier)", function () {
  let mock;
  let daoVoting;

  beforeEach(async function () {
    mock = await ethers.deployContract("MockVerifier");
    daoVoting = await ethers.deployContract("DAOVoting", [await mock.getAddress(), ROOT]);
  });

  it("records the verifier and the voter set at deployment", async function () {
    expect(await daoVoting.verifier()).to.equal(await mock.getAddress());
    expect(await daoVoting.merkleRoot()).to.equal(ROOT);
    expect(await daoVoting.getResults()).to.deep.equal([0n, 0n]);
  });

  it("refuses to deploy without a verifier or without a root", async function () {
    const DAOVoting = await ethers.getContractFactory("DAOVoting");
    await expect(DAOVoting.deploy(ethers.ZeroAddress, ROOT)).to.be.revertedWith("Verifier required");
    await expect(DAOVoting.deploy(await mock.getAddress(), 0)).to.be.revertedWith("Merkle root required");
  });

  it("counts a yes ballot and emits VoteSubmitted", async function () {
    await expect(daoVoting.submitVote(A, B, C, [ROOT, 456, 1]))
      .to.emit(daoVoting, "VoteSubmitted")
      .withArgs(456, 1, ROOT);

    const [yes, no] = await daoVoting.getResults();
    expect(yes).to.equal(1);
    expect(no).to.equal(0);
    expect(await daoVoting.nullifiers(456)).to.equal(true);
  });

  it("counts a no ballot", async function () {
    await daoVoting.submitVote(A, B, C, [ROOT, 789, 0]);

    const [yes, no] = await daoVoting.getResults();
    expect(yes).to.equal(0);
    expect(no).to.equal(1);
  });

  it("rejects a proof made against a different voter set", async function () {
    await expect(daoVoting.submitVote(A, B, C, [ROOT + 1n, 456, 1])).to.be.revertedWith("Unknown voter set");
  });

  it("rejects a second ballot with the same nullifier", async function () {
    await daoVoting.submitVote(A, B, C, [ROOT, 456, 1]);
    await expect(daoVoting.submitVote(A, B, C, [ROOT, 456, 0])).to.be.revertedWith("Vote already cast");

    const [yes, no] = await daoVoting.getResults();
    expect(yes).to.equal(1);
    expect(no).to.equal(0);
  });

  it("rejects a vote value other than 0 or 1", async function () {
    await expect(daoVoting.submitVote(A, B, C, [ROOT, 456, 2])).to.be.revertedWith("Invalid vote value");
  });

  it("rejects a ballot the verifier does not accept, and keeps the nullifier unspent", async function () {
    await mock.setAccept(false);
    await expect(daoVoting.submitVote(A, B, C, [ROOT, 456, 1])).to.be.revertedWith("Invalid proof");
    expect(await daoVoting.nullifiers(456)).to.equal(false);

    await mock.setAccept(true);
    await daoVoting.submitVote(A, B, C, [ROOT, 456, 1]);
    expect(await daoVoting.nullifiers(456)).to.equal(true);
  });

  it("does not care which account relays the ballot", async function () {
    const [, relayer] = await ethers.getSigners();
    await daoVoting.connect(relayer).submitVote(A, B, C, [ROOT, 456, 1]);

    const [yes] = await daoVoting.getResults();
    expect(yes).to.equal(1);
  });
});
