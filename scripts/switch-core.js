// Moves the deployed garden to the SqueekCore and SQK in scripts/squeekchain.js after a Squeekchain reinstall.
// Rehearse on a fork first (the owner is impersonated), then run it for real:
//   FORK_SEPOLIA=1 npx hardhat run scripts/switch-core.js
//   npx hardhat run scripts/switch-core.js --network sepolia
const { ethers, network } = require("hardhat");
const { SQUEEK_CORE, SQK_TOKEN } = require("./squeekchain");
const { loadDeployment } = require("./lib");

const same = (a, b) => a.toLowerCase() === b.toLowerCase();

async function main() {
  const forked = Boolean(network.config.forking);
  if (!forked && network.name !== "sepolia") throw new Error("Run with --network sepolia, or FORK_SEPOLIA=1 to rehearse.");
  const garden = await ethers.getContractAt("SqueekGarden", loadDeployment("sepolia").garden);

  let owner;
  if (forked) {
    owner = await ethers.getImpersonatedSigner(await garden.owner());
    await network.provider.send("hardhat_setBalance", [owner.address, "0x8AC7230489E80000"]);
  } else {
    [owner] = await ethers.getSigners();
    if (!same(owner.address, await garden.owner())) throw new Error(`${owner.address} is not the garden owner`);
  }

  const [before] = await garden.readings();
  console.log(`garden ${await garden.getAddress()}, core ${await garden.core()}, sqk ${await garden.sqk()}`);
  console.log(`readings before: work ${before.work}, block ${before.blockHeight}, settled round ${before.settledRound}`);

  // Same small tip as deploy.js: Sepolia's base fee is near zero.
  const tip = ethers.parseUnits(process.env.TIP_GWEI || "0.05", "gwei");
  const { maxFeePerGas } = await ethers.provider.getFeeData();
  const fees = { maxPriorityFeePerGas: tip, maxFeePerGas: maxFeePerGas * 2n + tip };

  if (!same(await garden.core(), SQUEEK_CORE)) {
    const tx = await garden.connect(owner).setCore(SQUEEK_CORE, fees);
    console.log(`setCore(${SQUEEK_CORE}) tx ${tx.hash}`);
    await tx.wait();
  }
  if (!same(await garden.sqk(), SQK_TOKEN)) {
    const tx = await garden.connect(owner).setSqk(SQK_TOKEN, fees);
    console.log(`setSqk(${SQK_TOKEN}) tx ${tx.hash}`);
    await tx.wait();
  }

  const [after, recentWork] = await garden.readings();
  console.log(`readings after: work ${after.work}, block ${after.blockHeight}, settled round ${after.settledRound}, recent work ${recentWork}`);
  if (after.work < before.work || after.blockHeight < before.blockHeight || after.settledRound < before.settledRound) {
    throw new Error("readings went backwards after the switch");
  }
  if (!same(await garden.core(), SQUEEK_CORE) || !same(await garden.sqk(), SQK_TOKEN)) throw new Error("switch did not stick");
  console.log("garden now reads the new SqueekCore and SQK");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
