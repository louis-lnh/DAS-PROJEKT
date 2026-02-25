/* idle.js — Idle Miner v0.0.1(2)
   - Tabs echte Panels
   - Number suffix AA/AB/...
   - Max purchase
   - Unlocks pro Business
   - Offline earnings
   - Prestige 3 Arten:
     1) Full reset kostenlos + Cooldown
     3) Reset ALL businesses kostet money
     2) Reset single business kostet money
   - Session report (rot/weiß/grün)
*/

(() => {
  const CFG = window.IDLE_CONFIG;
  if (!CFG) {
    alert("IDLE_CONFIG fehlt. Stelle sicher, dass config.js vor idle.js geladen wird.");
    return;
  }

  const $ = (id) => document.getElementById(id);

  // DOM
  const elMoney = $("money");
  const elIncome = $("incomePerSec");
  const elLifetime = $("lifetime");
  const elToken = $("token");
  const elInvestors = $("investors");
  const elMeta = $("meta");
  const elGlobalMult = $("globalMult");

  const elSessionCard = $("sessionCard");
  const elSessionGain = $("sessionGain");
  const elSessionSub = $("sessionSub");

  const list = $("businessList");
  const unlockGrid = $("unlockGrid");
  const statsList = $("statsList");

  const offlineBanner = $("offlineBanner");
  const offlineText = $("offlineText");
  const offlineCollect = $("offlineCollect");

  const btnSave = $("btnSave");
  const btnHardReset = $("btnHardReset");

  const fullRewardEl = $("fullReward");
  const fullCooldownEl = $("fullCooldown");
  const btnFullReset = $("btnFullReset");

  const allBizCostEl = $("allBizCost");
  const allBizRewardEl = $("allBizReward");
  const btnAllBizReset = $("btnAllBizReset");

  const singleBizSelect = $("singleBizSelect");
  const singleBizCostEl = $("singleBizCost");
  const singleBizRewardEl = $("singleBizReward");
  const btnSingleBizReset = $("btnSingleBizReset");

  // Navigation + Panels
  const navButtons = Array.from(document.querySelectorAll(".nav-btn"));
  const panels = {
    home: $("panel-home"),
    unlocks: $("panel-unlocks"),
    upgrades: $("panel-upgrades"),
    prestige: $("panel-prestige"),
    stats: $("panel-stats"),
    settings: $("panel-settings"),
  };

  // Buy mode buttons
  const modeButtons = Array.from(document.querySelectorAll(".mode-btn"));

  // -------------------------
  // Number formatting (K/M/B/T + AA/AB/..)
  // -------------------------
  function alphaSuffix(n) {
    // n: 1 => AA, 2 => AB, ..., 26 => AZ, 27 => BA ...
    // We want "AA" as first, so treat it like base-26 with offset.
    let x = n;
    let out = "";
    while (x > 0) {
      x -= 1;
      out = String.fromCharCode(65 + (x % 26)) + out;
      x = Math.floor(x / 26);
    }
    if (out.length === 1) out = "A" + out; // ensure AA starts the chain (optional safety)
    return out;
  }

  function fmtMoney(n) {
    if (!Number.isFinite(n)) return "$0";
    const sign = n < 0 ? "-" : "";
    const abs = Math.abs(n);

    const base = CFG.numberFormat.baseSuffixes;
    if (abs < 1000) return `${sign}$${Math.floor(abs).toLocaleString("en-US")}`;

    const exp3 = Math.floor(Math.log10(abs) / 3); // 1=>K,2=>M...
    const scaled = abs / Math.pow(10, exp3 * 3);

    let suffix = "";
    if (exp3 < base.length) {
      suffix = base[exp3];
    } else {
      // after T (exp3=4), exp3=5 is first alpha group => AA
      const alphaIndex = exp3 - (base.length - 1); // exp3=5 => 1
      suffix = alphaSuffix(alphaIndex);
    }

    const decimals = scaled >= 100 ? 1 : scaled >= 10 ? 2 : 3;
    return `${sign}$${scaled.toFixed(decimals)}${suffix}`;
  }

  function fmtPlain(n) {
    return (Math.floor(n)).toLocaleString("en-US");
  }

  // -------------------------
  // Game math
  // -------------------------
  const BUSINESS_DEFS = CFG.businesses;

  function costForLevel(def, level) {
    return Math.floor(def.baseCost * Math.pow(CFG.costGrowth, level));
  }

  function businessMultiplier(biz) {
    return biz.mult || 1;
  }

  function incomePerSecondFor(def, biz, globalMult) {
    if (biz.level <= 0) return 0;
    const perCycle = def.baseIncome * biz.level * businessMultiplier(biz) * globalMult;
    return perCycle / def.cooldown;
  }

  function computeGlobalMultiplier(state) {
    const m = CFG.multipliers;
    const metaMult = 1 + (state.meta * m.metaPerPoint);
    const invMult  = 1 + (state.investors * m.investorsPerPoint);
    const tokMult  = 1 + (state.token * m.tokenPerPoint);
    return metaMult * invMult * tokMult;
  }

  function totalIncomePerSecond(state) {
    const gm = computeGlobalMultiplier(state);
    let sum = 0;
    for (const def of BUSINESS_DEFS) {
      const biz = state.businesses[def.id];
      sum += incomePerSecondFor(def, biz, gm);
    }
    return sum;
  }

  // Unlock rules: every N levels -> biz.mult *= unlockMultiplier
  function applyUnlocksForBusiness(biz) {
    const step = CFG.unlockEveryLevels;
    const wantUnlocks = Math.floor(biz.level / step);
    const haveUnlocks = biz.unlocks || 0;
    const missing = wantUnlocks - haveUnlocks;

    if (missing > 0) {
      biz.unlocks = wantUnlocks;
      biz.mult = (biz.mult || 1) * Math.pow(CFG.unlockMultiplier, missing);
    }
  }

  // -------------------------
  // State
  // -------------------------
  function defaultState() {
    const businesses = {};
    for (const d of BUSINESS_DEFS) {
      businesses[d.id] = {
        level: 0,
        progress: 0,
        mult: 1,
        unlocks: 0,
      };
    }

    return {
      version: "0.0.1(2)",
      money: CFG.starterMoney,
      lifetime: 0,

      // prestige currencies
      token: 0,
      investors: 0,
      meta: 0,

      // session tracking
      sessionStartMoney: CFG.starterMoney,
      lastSessionGain: 0,
      sessionStartAt: Date.now(),

      // offline
      lastSeen: Date.now(),
      pendingOffline: 0,

      // ui
      tab: "home",
      buyMode: "1",

      // prestige tracking
      fullResetReadyAt: 0,
      allBizResets: 0,
      singleBizResets: 0,

      businesses,
    };
  }

  function save(state) {
    state.lastSeen = Date.now();
    localStorage.setItem(CFG.saveKey, JSON.stringify(state));
  }

  function load() {
    try {
      const raw = localStorage.getItem(CFG.saveKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);

      // merge with defaults
      const base = defaultState();
      const merged = {
        ...base,
        ...parsed,
        businesses: { ...base.businesses, ...(parsed.businesses ?? {}) },
      };

      // Ensure each business has fields
      for (const d of BUSINESS_DEFS) {
        const b = merged.businesses[d.id] ?? (merged.businesses[d.id] = {});
        merged.businesses[d.id] = {
          level: b.level ?? 0,
          progress: b.progress ?? 0,
          mult: b.mult ?? 1,
          unlocks: b.unlocks ?? 0,
        };
      }

      // If config starter money changed, do NOT overwrite (we respect save)
      return merged;
    } catch {
      return null;
    }
  }

  let state = load() ?? defaultState();

  // -------------------------
  // Offline
  // -------------------------
  function computeOfflineGain(s) {
    const now = Date.now();
    const deltaSec = Math.max(0, (now - (s.lastSeen ?? now)) / 1000);
    const capped = Math.min(deltaSec, CFG.offlineCapSeconds);

    if (capped <= 2) return 0;

    const ips = totalIncomePerSecond(s);
    return ips * capped * CFG.offlineEfficiency;
  }

  function applyOfflineIfAny() {
    const gain = computeOfflineGain(state);
    if (gain > 0) state.pendingOffline += gain;
    state.lastSeen = Date.now();
    save(state);
  }

  offlineCollect?.addEventListener("click", () => {
    if (state.pendingOffline > 0) {
      addMoney(state.pendingOffline);
      state.pendingOffline = 0;
      save(state);
      render();
    }
  });

  // -------------------------
  // Money add
  // -------------------------
  function addMoney(amount) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    state.money += amount;
    state.lifetime += amount;
  }

  // -------------------------
  // Buy levels (x1/x10/x25/MAX)
  // -------------------------
  function affordableCount(def, currentLevel, money) {
    if (money <= 0) return 0;
    // iterative is ok for small counts; MAX could be large but still fine for our scale.
    // If needed later, we can approximate with logs.
    let lvl = currentLevel;
    let m = money;
    let count = 0;
    while (count < 100000) {
      const c = costForLevel(def, lvl);
      if (m < c) break;
      m -= c;
      lvl += 1;
      count += 1;
    }
    return count;
  }

  function buy(defId) {
    const def = BUSINESS_DEFS.find(d => d.id === defId);
    if (!def) return;

    const biz = state.businesses[defId];

    let want = 1;
    if (state.buyMode === "10") want = 10;
    else if (state.buyMode === "25") want = 25;
    else if (state.buyMode === "max") want = affordableCount(def, biz.level, state.money);

    if (want <= 0) return;

    for (let i = 0; i < want; i++) {
      const cost = costForLevel(def, biz.level);
      if (state.money < cost) break;
      state.money -= cost;
      biz.level += 1;
      applyUnlocksForBusiness(biz);
    }

    save(state);
    render();
  }

  // -------------------------
  // Ticking
  // -------------------------
  function tick(dtSec) {
    const gm = computeGlobalMultiplier(state);

    for (const def of BUSINESS_DEFS) {
      const biz = state.businesses[def.id];
      if (biz.level <= 0) continue;

      biz.progress += dtSec;

      while (biz.progress >= def.cooldown) {
        biz.progress -= def.cooldown;
        const perCycle = def.baseIncome * biz.level * businessMultiplier(biz) * gm;
        addMoney(perCycle);
      }
    }
  }

  // -------------------------
  // UI Builders
  // -------------------------
  function buildBusinesses() {
    list.innerHTML = "";

    for (const def of BUSINESS_DEFS) {
      const card = document.createElement("div");
      card.className = "biz-card";

      card.innerHTML = `
        <div class="biz-icon" aria-hidden="true"></div>
        <div class="biz-mid">
          <div class="biz-title">
            <div class="biz-name">${def.name}</div>
            <div class="biz-level" id="lvl-${def.id}">Lv 0</div>
          </div>

          <div class="biz-bar" aria-label="Progress">
            <span id="bar-${def.id}" style="width:0%"></span>
          </div>

          <div class="biz-sub">
            <span id="ps-${def.id}">$0 / sec</span>
            <span>${def.cooldown}s cycle</span>
            <span id="next-${def.id}">Next: Lv ${CFG.unlockEveryLevels} (x${CFG.unlockMultiplier})</span>
          </div>
        </div>

        <div class="biz-actions">
          <button class="btn" id="buy-${def.id}">BUY</button>
          <div class="price" id="price-${def.id}">$0</div>
        </div>
      `;

      list.appendChild(card);

      card.querySelector(`#buy-${def.id}`).addEventListener("click", () => buy(def.id));
    }
  }

  function buildUnlockGrid() {
    unlockGrid.innerHTML = "";

    for (const def of BUSINESS_DEFS) {
      const biz = state.businesses[def.id];
      const u = biz.unlocks || 0;
      const nextMilestone = (u + 1) * CFG.unlockEveryLevels;

      const card = document.createElement("div");
      card.className = "unlock-card";
      card.innerHTML = `
        <div class="unlock-title">${def.name}</div>
        <div class="unlock-sub">
          Unlocks: ${u} • Mult: x${(biz.mult || 1).toFixed(2)}<br/>
          Next at Lv ${nextMilestone}: x${CFG.unlockMultiplier}
        </div>
      `;
      unlockGrid.appendChild(card);
    }
  }

  function buildStats() {
    const gm = computeGlobalMultiplier(state);
    const ips = totalIncomePerSecond(state);

    const rows = [
      ["Version", state.version],
      ["Money", fmtMoney(state.money)],
      ["Income/sec", `${fmtMoney(ips)} / sec`],
      ["Lifetime", fmtMoney(state.lifetime)],
      ["Global Multiplier", `x${gm.toFixed(3)}`],
      ["Megatoken", fmtPlain(state.meta)],
      ["Investors", fmtPlain(state.investors)],
      ["Token", fmtPlain(state.token)],
      ["All-Business Resets", fmtPlain(state.allBizResets)],
      ["Single-Business Resets", fmtPlain(state.singleBizResets)],
    ];

    statsList.innerHTML = "";
    for (const [k, v] of rows) {
      const line = document.createElement("div");
      line.className = "statline";
      line.innerHTML = `<div class="k">${k}</div><div class="v">${v}</div>`;
      statsList.appendChild(line);
    }
  }

  function setTab(tab) {
    state.tab = tab;

    for (const [k, el] of Object.entries(panels)) {
      if (!el) continue;
      el.classList.toggle("is-active", k === tab);
    }

    navButtons.forEach(btn => {
      btn.classList.toggle("is-active", btn.dataset.tab === tab);
    });

    save(state);
    render(); // ensures unlock grid etc updates
  }

  function setBuyMode(mode) {
    state.buyMode = mode;
    modeButtons.forEach(b => b.classList.toggle("is-active", b.dataset.mode === mode));
    save(state);
    render();
  }

  // -------------------------
  // Prestige
  // -------------------------
  function calcFullReward() {
    const p = CFG.prestige;
    const val = Math.pow(state.lifetime / p.metaDivisor, p.metaPow);
    return Math.max(0, Math.floor(val));
  }

  function calcAllBizCost() {
    const p = CFG.prestige;
    return Math.floor(p.allBizResetBaseCost * Math.pow(p.allBizResetGrowth, state.allBizResets));
  }

  function calcAllBizReward() {
    const p = CFG.prestige;
    const totalLevels = BUSINESS_DEFS.reduce((sum, d) => sum + (state.businesses[d.id].level || 0), 0);
    const val = Math.pow(totalLevels / p.invDivisor, p.invPow);
    return Math.max(0, Math.floor(val));
  }

  function calcSingleBizCost() {
    const p = CFG.prestige;
    return Math.floor(p.singleBizResetBaseCost * Math.pow(p.singleBizResetGrowth, state.singleBizResets));
  }

  function calcSingleBizReward(defId) {
    const p = CFG.prestige;
    const lvl = state.businesses[defId]?.level || 0;
    const val = Math.pow(lvl / p.tokDivisor, p.tokPow);
    return Math.max(0, Math.floor(val));
  }

  function fullReset() {
    const now = Date.now();
    if (now < (state.fullResetReadyAt || 0)) return;

    const reward = calcFullReward();
    state.meta += reward;

    state.fullResetReadyAt = now + CFG.prestige.fullResetCooldownMs;

    // reset everything
    const fresh = defaultState();
    fresh.meta = state.meta;
    fresh.investors = state.investors;
    fresh.token = state.token;

    fresh.fullResetReadyAt = state.fullResetReadyAt;
    fresh.allBizResets = state.allBizResets;
    fresh.singleBizResets = state.singleBizResets;

    state = fresh;
    save(state);
    buildBusinesses();
    buildSingleBizSelect();
    render();
  }

  function resetAllBusinesses() {
    const cost = calcAllBizCost();
    const reward = calcAllBizReward();

    if (state.money < cost) return;
    if (reward <= 0) return;

    state.money -= cost;
    state.investors += reward;
    state.allBizResets += 1;

    // reset businesses only
    for (const d of BUSINESS_DEFS) {
      const b = state.businesses[d.id];
      b.level = 0;
      b.progress = 0;
      b.mult = 1;
      b.unlocks = 0;
    }

    // session baseline updates (money stayed but changed by cost)
    save(state);
    render();
  }

  function resetSingleBusiness(defId) {
    const cost = calcSingleBizCost();
    const reward = calcSingleBizReward(defId);

    if (state.money < cost) return;
    if (reward <= 0) return;

    state.money -= cost;
    state.token += reward;
    state.singleBizResets += 1;

    const b = state.businesses[defId];
    b.level = 0;
    b.progress = 0;
    b.mult = 1;
    b.unlocks = 0;

    save(state);
    render();
  }

  function buildSingleBizSelect() {
    singleBizSelect.innerHTML = "";
    for (const d of BUSINESS_DEFS) {
      const opt = document.createElement("option");
      opt.value = d.id;
      opt.textContent = d.name;
      singleBizSelect.appendChild(opt);
    }
  }

  // -------------------------
  // Session report coloring
  // -------------------------
  function updateSessionReport() {
    // current session gain = money - sessionStartMoney
    const gain = state.money - (state.sessionStartMoney ?? 0);
    const last = state.lastSessionGain ?? 0;

    elSessionGain.textContent = fmtMoney(gain);
    elSessionSub.textContent = `vs last: ${fmtMoney(last)}`;

    elSessionCard.classList.remove("is-good", "is-bad", "is-mid");
    if (gain > last) elSessionCard.classList.add("is-good");
    else if (gain < last) elSessionCard.classList.add("is-bad");
    else elSessionCard.classList.add("is-mid");
  }

  function closeSessionSnapshot() {
    // store gain to compare next session
    const gain = state.money - (state.sessionStartMoney ?? 0);
    state.lastSessionGain = gain;

    // start next session baseline when user returns
    save(state);
  }

  function startNewSessionBaseline() {
    state.sessionStartMoney = state.money;
    state.sessionStartAt = Date.now();
    save(state);
  }

  // -------------------------
  // Render
  // -------------------------
  function render() {
    const gm = computeGlobalMultiplier(state);
    const ips = totalIncomePerSecond(state);

    elMoney.textContent = fmtMoney(state.money);
    elIncome.textContent = `${fmtMoney(ips)} / sec`;
    elLifetime.textContent = fmtMoney(state.lifetime);

    elToken.textContent = `Token: ${fmtPlain(state.token)}`;
    elInvestors.textContent = `Investors: ${fmtPlain(state.investors)}`;
    elMeta.textContent = `Megatoken: ${fmtPlain(state.meta)}`;
    elGlobalMult.textContent = `x${gm.toFixed(2)}`;

    updateSessionReport();

    // offline banner
    if (state.pendingOffline > 0) {
      offlineBanner.hidden = false;
      offlineText.textContent = `+ ${fmtMoney(state.pendingOffline)}`;
    } else {
      offlineBanner.hidden = true;
    }

    // businesses UI
    for (const def of BUSINESS_DEFS) {
      const b = state.businesses[def.id];

      const lvlEl = $(`lvl-${def.id}`);
      const psEl = $(`ps-${def.id}`);
      const barEl = $(`bar-${def.id}`);
      const priceEl = $(`price-${def.id}`);
      const nextEl = $(`next-${def.id}`);
      const buyBtn = $(`buy-${def.id}`);

      const cost = costForLevel(def, b.level);

      if (lvlEl) lvlEl.textContent = `Lv ${b.level}`;
      if (psEl) psEl.textContent = `${fmtMoney(incomePerSecondFor(def, b, gm))} / sec`;

      const pct = Math.max(0, Math.min(100, (b.progress / def.cooldown) * 100));
      if (barEl) barEl.style.width = `${pct}%`;

      if (priceEl) priceEl.textContent = `${fmtMoney(cost)}`;

      let label = "BUY";
      if (state.buyMode === "10") label = "BUY x10";
      else if (state.buyMode === "25") label = "BUY x25";
      else if (state.buyMode === "max") label = "BUY MAX";

      if (buyBtn) buyBtn.textContent = label;

      // enable check based on mode
      let canBuy = false;
      if (state.buyMode === "max") {
        canBuy = affordableCount(def, b.level, state.money) > 0;
      } else {
        const want = parseInt(state.buyMode, 10) || 1;
        // rough: check first cost only (fast). Later we can calculate sum costs for x10/x25.
        canBuy = state.money >= costForLevel(def, b.level);
        if (want > 1 && state.money < costForLevel(def, b.level)) canBuy = false;
      }

      if (buyBtn) buyBtn.disabled = !canBuy;

      const nextMilestone = (Math.floor(b.level / CFG.unlockEveryLevels) + 1) * CFG.unlockEveryLevels;
      if (nextEl) nextEl.textContent = `Next: Lv ${nextMilestone} (x${CFG.unlockMultiplier})`;
    }

    // unlocks/stats panels refresh only when visible, but cheap anyway
    buildUnlockGrid();
    buildStats();

    // prestige UI
    const fullReward = calcFullReward();
    fullRewardEl.textContent = `+${fullReward} Megatoken`;

    const now = Date.now();
    const readyAt = state.fullResetReadyAt || 0;
    if (now >= readyAt) {
      fullCooldownEl.textContent = `Cooldown: ready`;
      btnFullReset.disabled = false;
    } else {
      const left = readyAt - now;
      const h = Math.floor(left / 3600000);
      const m = Math.floor((left % 3600000) / 60000);
      fullCooldownEl.textContent = `Cooldown: ${h}h ${m}m`;
      btnFullReset.disabled = true;
    }

    const allCost = calcAllBizCost();
    const allReward = calcAllBizReward();
    allBizCostEl.textContent = fmtMoney(allCost);
    allBizRewardEl.textContent = `+${allReward} Investors`;
    btnAllBizReset.disabled = state.money < allCost || allReward <= 0;

    const selectedBiz = singleBizSelect.value || BUSINESS_DEFS[0].id;
    const oneCost = calcSingleBizCost();
    const oneReward = calcSingleBizReward(selectedBiz);
    singleBizCostEl.textContent = fmtMoney(oneCost);
    singleBizRewardEl.textContent = `+${oneReward} Token`;
    btnSingleBizReset.disabled = state.money < oneCost || oneReward <= 0;
  }

  // -------------------------
  // Events
  // -------------------------
  navButtons.forEach(btn => {
    btn.addEventListener("click", () => setTab(btn.dataset.tab || "home"));
  });

  modeButtons.forEach(btn => {
    btn.addEventListener("click", () => setBuyMode(btn.dataset.mode));
  });

  btnSave?.addEventListener("click", () => save(state));

  btnHardReset?.addEventListener("click", () => {
    localStorage.removeItem(CFG.saveKey);
    state = defaultState();
    save(state);
    buildBusinesses();
    buildSingleBizSelect();
    applyOfflineIfAny();
    render();
  });

  btnFullReset?.addEventListener("click", () => fullReset());
  btnAllBizReset?.addEventListener("click", () => resetAllBusinesses());
  btnSingleBizReset?.addEventListener("click", () => {
    const id = singleBizSelect.value;
    resetSingleBusiness(id);
  });

  singleBizSelect?.addEventListener("change", () => render());

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      closeSessionSnapshot();
      save(state);
    } else {
      // coming back = offline + start new session baseline
      applyOfflineIfAny();
      startNewSessionBaseline();
      render();
    }
  });

  window.addEventListener("beforeunload", () => {
    closeSessionSnapshot();
    save(state);
  });

  // -------------------------
  // Init
  // -------------------------
  function init() {
    buildBusinesses();
    buildSingleBizSelect();

    // Ensure unlocks are consistent with levels (if older save)
    for (const def of BUSINESS_DEFS) applyUnlocksForBusiness(state.businesses[def.id]);

    // Apply offline and start session baseline
    applyOfflineIfAny();
    startNewSessionBaseline();

    // restore UI state
    setBuyMode(state.buyMode || "1");
    setTab(state.tab || "home");

    render();

    // main loop
    let last = performance.now();
    setInterval(() => {
      const now = performance.now();
      const dtSec = (now - last) / 1000;
      last = now;

      tick(dtSec);
      render();

      if (Math.random() < CFG.autosaveChancePerTick) save(state);
    }, CFG.tickMs);
  }

  init();
})();