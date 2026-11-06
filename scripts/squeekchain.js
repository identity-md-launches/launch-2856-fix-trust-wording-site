// Live Sepolia addresses, from https://api.squeekchain.com/v1/economy/state (deployment.components).
// A testnet reinstall changes these; re-check that endpoint before deploying, then run scripts/switch-core.js.
module.exports = {
  SQUEEK_CORE: "0xfd6c166d4b8e2962e65746a13e5a0797cd4de0c4", // deployment.components.core
  SQK_TOKEN: "0xd78a3956cf63164d1fa1c622ad3c66623162fa1e", // deployment.components.token
  SQUEEK_NFT: "0xc4c7982657f00509548f3a3a41db7fa439a6856b", // deployment.components.collection, the ERC-721 "Squeek"
  SQUEEK_DEPLOY_BLOCK: 12057556, // chain.deploymentBlock: where the web app starts looking for Squeek transfers
  GENESIS_TS: 1793735400, // SqueekCore configuration().genesisTimestamp
  SEPOLIA_RPC: "https://ethereum-sepolia-rpc.publicnode.com",
};
