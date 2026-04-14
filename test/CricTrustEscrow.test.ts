import pkg from "hardhat";
const { ethers } = pkg;
import { expect } from "chai";

describe("CricTrustEscrow", function () {
  let escrow: any;
  let umpire: HardhatEthersSigner;
  let client: HardhatEthersSigner;
  let builder: HardhatEthersSigner;

  const ONE_ETH = ethers.parseEther("1");
  const FUTURE = Math.floor(Date.now() / 1000) + 86400 * 30;

  beforeEach(async function () {
    [umpire, client, builder] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("CricTrustEscrow");
    escrow = await Factory.deploy(umpire.address);
    await escrow.waitForDeployment();
  });

  describe("Match Creation", function () {
    it("should create a match with correct initial state", async function () {
      await escrow.connect(client).createMatch("Build DeFi App", "A DeFi dashboard", FUTURE, 0, { value: ONE_ETH });
      const match = await escrow.getMatch(1);
      expect(match.client).to.equal(client.address);
      expect(match.bounty).to.equal(ONE_ETH);
      expect(match.status).to.equal(0n); // TossWon
      const title = await escrow.matchTitles(1);
      expect(title).to.equal("Build DeFi App");
    });

    it("should revert if no bounty deposited", async function () {
      await expect(
        escrow.connect(client).createMatch("Test", "desc", FUTURE, 0)
      ).to.be.revertedWith("Must deposit bounty");
    });

    it("should revert if deadline is in the past", async function () {
      await expect(
        escrow.connect(client).createMatch("Test", "desc", 1000, 0, { value: ONE_ETH })
      ).to.be.revertedWith("Deadline must be in the future");
    });

    it("should increment match IDs", async function () {
      await escrow.connect(client).createMatch("M1", "d1", FUTURE, 0, { value: ONE_ETH });
      await escrow.connect(client).createMatch("M2", "d2", FUTURE, 1, { value: ONE_ETH });
      expect(await escrow.nextMatchId()).to.equal(3n);
    });
  });

  describe("Builder Actions", function () {
    beforeEach(async function () {
      await escrow.connect(client).createMatch("Build App", "desc", FUTURE, 0, { value: ONE_ETH });
    });

    it("should let a builder accept the match", async function () {
      await escrow.connect(builder).acceptMatch(1);
      const match = await escrow.getMatch(1);
      expect(match.builder).to.equal(builder.address);
      expect(match.status).to.equal(1n); // FirstInnings
    });

    it("should not let client accept their own match", async function () {
      await expect(escrow.connect(client).acceptMatch(1)).to.be.revertedWith("Client cannot be builder");
    });

    it("should not let a second builder accept", async function () {
      await escrow.connect(builder).acceptMatch(1);
      const [, , , builder2] = await ethers.getSigners();
      await expect(escrow.connect(builder2).acceptMatch(1)).to.be.revertedWith("Not open");
    });

    it("should let builder confirm delivery", async function () {
      await escrow.connect(builder).acceptMatch(1);
      await escrow.connect(builder).confirmDelivery(1);
      const match = await escrow.getMatch(1);
      expect(match.builderConfirmed).to.be.true;
    });
  });

  describe("Fund Release", function () {
    beforeEach(async function () {
      await escrow.connect(client).createMatch("Build App", "desc", FUTURE, 0, { value: ONE_ETH });
      await escrow.connect(builder).acceptMatch(1);
    });

    it("should release funds when all conditions met", async function () {
      await escrow.connect(umpire).setComplexityScore(1, 75);
      await escrow.connect(builder).confirmDelivery(1);

      const balBefore = await ethers.provider.getBalance(builder.address);
      await escrow.connect(client).approveDelivery(1);
      const balAfter = await ethers.provider.getBalance(builder.address);

      expect(balAfter).to.be.greaterThan(balBefore);
      const match = await escrow.getMatch(1);
      expect(match.status).to.equal(3n); // MatchWon
    });

    it("should NOT release if complexity score too low", async function () {
      await escrow.connect(umpire).setComplexityScore(1, 30);
      await escrow.connect(builder).confirmDelivery(1);
      // approveDelivery should revert since score < 40
      await expect(escrow.connect(client).approveDelivery(1)).to.be.revertedWith("AI not validated");
    });
  });

  describe("Scam Detection", function () {
    beforeEach(async function () {
      await escrow.connect(client).createMatch("Build App", "desc", FUTURE, 0, { value: ONE_ETH });
      await escrow.connect(builder).acceptMatch(1);
    });

    it("should auto-release to builder with penalty on scam", async function () {
      const balBefore = await ethers.provider.getBalance(builder.address);
      await escrow.connect(umpire).triggerScamDetection(1);
      const balAfter = await ethers.provider.getBalance(builder.address);

      const match = await escrow.getMatch(1);
      expect(match.scamDetected).to.be.true;
      expect(match.status).to.equal(3n); // MatchWon

      // Builder gets 95%
      const expectedPayout = ONE_ETH - (ONE_ETH * 500n) / 10000n;
      expect(balAfter - balBefore).to.equal(expectedPayout);
    });

    it("should only be callable by umpire", async function () {
      await expect(escrow.connect(client).triggerScamDetection(1)).to.be.revertedWith("Only umpire");
    });
  });

  describe("DRS (Dispute)", function () {
    beforeEach(async function () {
      await escrow.connect(client).createMatch("Build App", "desc", FUTURE, 0, { value: ONE_ETH });
      await escrow.connect(builder).acceptMatch(1);
    });

    it("should allow client to raise DRS", async function () {
      await escrow.connect(client).raiseDRS(1);
      const match = await escrow.getMatch(1);
      expect(match.status).to.equal(2n); // DRS
    });

    it("should resolve DRS in favor of builder", async function () {
      await escrow.connect(client).raiseDRS(1);
      const balBefore = await ethers.provider.getBalance(builder.address);
      await escrow.connect(umpire).resolveDRS(1, true);
      const balAfter = await ethers.provider.getBalance(builder.address);
      expect(balAfter - balBefore).to.equal(ONE_ETH);
    });

    it("should resolve DRS in favor of client", async function () {
      await escrow.connect(client).raiseDRS(1);
      const balBefore = await ethers.provider.getBalance(client.address);
      await escrow.connect(umpire).resolveDRS(1, false);
      const balAfter = await ethers.provider.getBalance(client.address);
      expect(balAfter).to.be.greaterThan(balBefore);
    });
  });

  describe("Abandon", function () {
    it("should let client abandon before builder accepts", async function () {
      await escrow.connect(client).createMatch("Build App", "desc", FUTURE, 0, { value: ONE_ETH });
      const balBefore = await ethers.provider.getBalance(client.address);
      await escrow.connect(client).abandonMatch(1);
      const balAfter = await ethers.provider.getBalance(client.address);
      expect(balAfter).to.be.greaterThan(balBefore);
    });

    it("should NOT abandon after builder accepts", async function () {
      await escrow.connect(client).createMatch("Build App", "desc", FUTURE, 0, { value: ONE_ETH });
      await escrow.connect(builder).acceptMatch(1);
      await expect(escrow.connect(client).abandonMatch(1)).to.be.revertedWith("Builder already assigned");
    });
  });

  describe("PSL Team Lifecycle", function () {
    it("should track team changes through match lifecycle", async function () {
      await escrow.connect(client).createMatch("Build App", "desc", FUTURE, 0, { value: ONE_ETH });
      let match = await escrow.getMatch(1);
      expect(match.team).to.equal(0n); // LahoreQalandars

      await escrow.connect(builder).acceptMatch(1);
      match = await escrow.getMatch(1);
      expect(match.team).to.equal(1n); // IslamabadUnited

      await escrow.connect(umpire).setComplexityScore(1, 80);
      await escrow.connect(builder).confirmDelivery(1);
      match = await escrow.getMatch(1);
      expect(match.team).to.equal(3n); // MultanSultans

      await escrow.connect(client).approveDelivery(1);
      match = await escrow.getMatch(1);
      expect(match.team).to.equal(4n); // PeshawarZalmi
    });
  });
});
