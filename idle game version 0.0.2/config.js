/* config.js — Idle Miner v0.0.1(2)
   Alles Wichtige an einem Ort.
*/
window.IDLE_CONFIG = {
  saveKey: "dp_idle_crypto_v0_0_1_2",

  tickMs: 120,
  autosaveChancePerTick: 0.05,

  offlineCapSeconds: 12 * 60 * 60,
  offlineEfficiency: 0.9, // 90% payout (macht’s stabiler)

  // Start
  starterMoney: 25,

  // Number formatting
  numberFormat: {
    baseSuffixes: ["", "K", "M", "B", "T"],  // 10^0, 10^3, 10^6, 10^9, 10^12
    alphaAfterT: true,                      // AA, AB, ...
  },

  // Businesses
  businesses: [
    { id: "eth",       name: "ETH Rig",         baseCost: 25,     baseIncome: 0.60, cooldown: 2 },
    { id: "nft",       name: "NFT Printer",     baseCost: 180,    baseIncome: 3.20, cooldown: 4 },
    { id: "farm",      name: "Mining Farm",     baseCost: 900,    baseIncome: 18.0, cooldown: 6 },
    { id: "wallet",    name: "Cold Wallet",     baseCost: 2400,   baseIncome: 46.0, cooldown: 10 },
    { id: "contracts", name: "Smart Contracts", baseCost: 9000,   baseIncome: 120,  cooldown: 14 },
    { id: "chain",     name: "Blockchain Node", baseCost: 42000,  baseIncome: 420,  cooldown: 18 },
  ],

  // Cost scaling
  costGrowth: 1.155, // leicht höher als MVP, stabiler

  // Unlocks (pro Business)
  unlockEveryLevels: 25,
  unlockMultiplier: 2, // x2 für dieses Business, nicht global

  // Multipliers (1 > 3 > 2)
  multipliers: {
    // wird aus currencies berechnet:
    metaPerPoint: 0.08,      // Full reset -> Megatoken -> stark
    investorsPerPoint: 0.035,// All-biz reset -> Investors -> mid
    tokenPerPoint: 0.012,    // Single-biz reset -> Token -> klein
  },

  // Prestige
  prestige: {
    // Full Reset cooldown
    fullResetCooldownMs: 6 * 60 * 60 * 1000, // 6h (kannst du später hochsetzen)

    // Reward Formeln (simpel & stabil)
    // metaReward = floor( (lifetime / metaDivisor) ^ metaPow )
    metaDivisor: 2_000_000,
    metaPow: 0.55,

    // Investors reward für "reset all businesses"
    // investorsReward = floor( (totalLevels / invDivisor) ^ invPow )
    invDivisor: 35,
    invPow: 0.90,

    // Token reward für "reset single business"
    // tokenReward = floor( (bizLevel / tokDivisor) ^ tokPow )
    tokDivisor: 20,
    tokPow: 0.95,

    // Costs (money)
    allBizResetBaseCost: 150_000,
    allBizResetGrowth: 1.60,

    singleBizResetBaseCost: 40_000,
    singleBizResetGrowth: 1.55,
  },
};