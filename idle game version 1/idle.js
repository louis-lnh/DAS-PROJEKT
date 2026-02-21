/* Idle Miner MVP (V1)
   - Auto income/sec
   - Leveling businesses
   - Offline earnings via timestamp delta
   - Local save (localStorage)
*/

(() => {
  const SAVE_KEY = "dp_idle_miner_v1";

  const OFFLINE_CAP_SECONDS = 12 * 60 * 60; // 12h cap
  const TICK_MS = 250;

  // --- Economy helpers ---
  function fmtMoney(n) {
    if (!Number.isFinite(n)) return "$0";
    const abs = Math.abs(n);
    const sign = n < 0 ? "-" : "";
    const units = [
      { v: 1e12, s: "T" },
      { v: 1e9, s: "B" },
      { v: 1e6, s: "M" },
      { v: 1e3, s: "K" },
    ];
    for (const u of units) {
      if (abs >= u.v) return `${sign}$${(abs / u.v).toFixed(abs >= u.v * 10 ? 1 : 2)}${u.s}`;
    }
    return `${sign}$${Math.floor(abs).toLocaleString("en-US")}`;
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  // --- Game data (eigene Namen später easy austauschbar) ---
  const BUSINESS_DEFS = [
    { id: "eth", name: "ETH Rig", baseCost: 25, baseIncome: 0.6, cooldown: 2 },
    { id: "nft", name: "NFT Printer", baseCost: 180, baseIncome: 3.2, cooldown: 4 },
    { id: "farm", name: "Mining Farm", baseCost: 900, baseIncome: 18, cooldown: 6 },
    { id: "wallet", name: "Cold Wallet", baseCost: 2400, baseIncome: 46, cooldown: 10 },
    { id: "contracts", name: "Smart Contracts", baseCost: 9000, baseIncome: 120, cooldown: 14 },
    { id: "chain", name: "Blockchain Node", baseCost: 42000, baseIncome: 420, cooldown: 18 },
  ];

  function costForLevel(def, level) {
    // Exponentielles Scaling – fühlt sich Idle-typisch an
    // cost = baseCost * 1.15^level
    return Math.floor(def.baseCost * Math.pow(1.15, level));
  }

  function incomePerSecondFor(def, level, multipliers) {
    // income per cycle = baseIncome * level * mults
    // convert to per second using cooldown
    if (level <= 0) return 0;
    const perCycle = def.baseIncome * level * multipliers.globalProfit;
    return perCycle / def.cooldown;
  }

  function nextUnlockMultiplier(level) {
    // Kleine Meilensteine, später ausbauen:
    // alle 25 level: x2
    return (level > 0 && level % 25 === 0) ? 2 : 1;
  }

  // --- State ---
  function defaultState() {
    const businesses = {};
    for (const d of BUSINESS_DEFS) businesses[d.id] = { level: 0, progress: 0 };
    return {
      version: 1,
      money: 25,
      lifetime: 0,
      session: 0,
      token: 0,
      investors: 0,
      meta: 0,
      multipliers: {
        globalProfit: 1,
      },
      businesses,
      lastSeen: Date.now(),
      pendingOffline: 0,
      lastTab: "home",
    };
  }

  let state = load() ?? defaultState();

  // --- DOM ---
  const $ = (id) => document.getElementById(id);

  const elMoney = $("money");
  const elIncome = $("incomePerSec");
  const elLifetime = $("lifetime");
  const elSession = $("session");
  const elToken = $("token");
  const elInvestors = $("investors");
  const elMeta = $("meta");

  const list = $("businessList");

  const offlineBanner = $("offlineBanner");
  const offlineText = $("offlineText");
  const offlineCollect = $("offlineCollect");

  const menuDialog = $("menuDialog");
  const btnMenu = $("btnMenu");
  const btnCloseMenu = $("btnCloseMenu");
  const btnSave = $("btnSave");
  const btnHardReset = $("btnHardReset");

  // --- UI build ---
  function buildList() {
    list.innerHTML = "";
    for (const def of BUSINESS_DEFS) {
      const card = document.createElement("div");
      card.className = "biz-card";
      card.dataset.id = def.id;

      card.innerHTML = `
        <div class="biz-icon" aria-hidden="true"></div>
        <div class="biz-mid">
          <div class="biz-title">
            <div class="biz-name">${def.name}</div>
            <div class="biz-level" id="lvl-${def.id}">Lv 0</div>
          </div>
          <div class="biz-bar" aria-label="Progress">
            <span id="bar-${def.id}" style="width: 0%"></span>
          </div>
          <div class="biz-sub">
            <span id="ps-${def.id}">$0 / sec</span>
            <span>${def.cooldown}s cycle</span>
            <span id="unlock-${def.id}">Next: Lv 25</span>
          </div>
        </div>
        <div class="biz-actions">
          <button class="btn" id="buy-${def.id}">BUY +1</button>
          <div class="price" id="price-${def.id}">$0</div>
        </div>
      `;

      list.appendChild(card);

      const buyBtn = card.querySelector(`#buy-${def.id}`);
      buyBtn.addEventListener("click", () => buyLevel(def.id, 1));
    }
  }

  function render() {
    elMoney.textContent = fmtMoney(state.money);
    elLifetime.textContent = fmtMoney(state.lifetime);
    elSession.textContent = fmtMoney(state.session);

    elToken.textContent = `Token: ${state.token}`;
    elInvestors.textContent = `Investors: ${state.investors}`;
    elMeta.textContent = `Megatoken: ${state.meta}`;

    const ips = totalIncomePerSecond();
    elIncome.textContent = `${fmtMoney(ips)} / sec`;

    for (const def of BUSINESS_DEFS) {
      const b = state.businesses[def.id];
      const level = b.level;

      const lvlEl = $(`lvl-${def.id}`);
      const psEl = $(`ps-${def.id}`);
      const barEl = $(`bar-${def.id}`);
      const priceEl = $(`price-${def.id}`);
      const unlockEl = $(`unlock-${def.id}`);
      const buyBtn = $(`buy-${def.id}`);

      if (lvlEl) lvlEl.textContent = `Lv ${level}`;
      if (psEl) psEl.textContent = `${fmtMoney(incomePerSecondFor(def, level, state.multipliers))} / sec`;

      const pct = clamp((b.progress / def.cooldown) * 100, 0, 100);
      if (barEl) barEl.style.width = `${pct}%`;

      const cost = costForLevel(def, level);
      if (priceEl) priceEl.textContent = `${fmtMoney(cost)}`;
      if (buyBtn) buyBtn.disabled = state.money < cost;

      const nextMilestone = Math.ceil((level + 1) / 25) * 25;
      if (unlockEl) unlockEl.textContent = `Next: Lv ${nextMilestone} (x2)`;
    }

    if (state.pendingOffline > 0) {
      offlineBanner.hidden = false;
      offlineText.textContent = `+ ${fmtMoney(state.pendingOffline)}`;
    } else {
      offlineBanner.hidden = true;
    }
  }

  // --- Core mechanics ---
  function totalIncomePerSecond() {
    let sum = 0;
    for (const def of BUSINESS_DEFS) {
      const level = state.businesses[def.id].level;
      sum += incomePerSecondFor(def, level, state.multipliers);
    }
    return sum;
  }

  function addMoney(amount) {
    if (amount <= 0) return;
    state.money += amount;
    state.lifetime += amount;
    state.session += amount;
  }

  function buyLevel(id, amount) {
    const def = BUSINESS_DEFS.find(d => d.id === id);
    if (!def) return;

    for (let i = 0; i < amount; i++) {
      const b = state.businesses[id];
      const cost = costForLevel(def, b.level);
      if (state.money < cost) break;

      state.money -= cost;
      b.level += 1;

      // Unlock milestone: alle 25 Level -> globalProfit x2 (einfacher MVP)
      const mult = nextUnlockMultiplier(b.level);
      if (mult > 1) state.multipliers.globalProfit *= mult;
    }

    save();
    render();
  }

  function tick(dtSec) {
    // Für jedes Business: progress erhöhen. Wenn cycle fertig -> payout
    for (const def of BUSINESS_DEFS) {
      const b = state.businesses[def.id];
      if (b.level <= 0) continue;

      b.progress += dtSec;
      while (b.progress >= def.cooldown) {
        b.progress -= def.cooldown;

        const perCycle = def.baseIncome * b.level * state.multipliers.globalProfit;
        addMoney(perCycle);
      }
    }
  }

  // --- Offline earnings ---
  function computeOffline() {
    const now = Date.now();
    const deltaSec = Math.max(0, (now - (state.lastSeen ?? now)) / 1000);
    const capped = Math.min(deltaSec, OFFLINE_CAP_SECONDS);

    if (capped <= 2) return 0; // ignoriere Mini-Schwankungen
    const ips = totalIncomePerSecond();
    return ips * capped;
  }

  function applyOfflineIfAny() {
    const offlineGain = computeOffline();
    if (offlineGain > 0) {
      state.pendingOffline += offlineGain;
    }
    state.lastSeen = Date.now();
    save();
  }

  offlineCollect?.addEventListener("click", () => {
    if (state.pendingOffline > 0) {
      addMoney(state.pendingOffline);
      state.pendingOffline = 0;
      save();
      render();
    }
  });

  // --- Save/Load ---
  function save() {
    state.lastSeen = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  }

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);

      // Migrations (minimal)
      const base = defaultState();
      return {
        ...base,
        ...parsed,
        businesses: { ...base.businesses, ...(parsed.businesses ?? {}) },
        multipliers: { ...base.multipliers, ...(parsed.multipliers ?? {}) },
      };
    } catch {
      return null;
    }
  }

  function hardReset() {
    localStorage.removeItem(SAVE_KEY);
    state = defaultState();
    buildList();
    render();
  }

  // --- Menu ---
  btnMenu?.addEventListener("click", () => menuDialog?.showModal());
  btnCloseMenu?.addEventListener("click", () => menuDialog?.close());
  btnSave?.addEventListener("click", () => save());
  btnHardReset?.addEventListener("click", () => hardReset());

  // --- Tabs (MVP placeholder) ---
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      state.lastTab = btn.dataset.tab || "home";
      save();
      // Später: echte Panels/Dialogs pro Tab
    });
  });

  // --- Start ---
  buildList();
  applyOfflineIfAny();
  render();

  // Main loop
  let last = performance.now();
  setInterval(() => {
    const now = performance.now();
    const dtSec = (now - last) / 1000;
    last = now;

    tick(dtSec);
    render();

    // autosave sparsam
    if (Math.random() < 0.08) save();
  }, TICK_MS);

  // Save on visibility change
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      save();
    } else {
      // Wenn du zurückkommst: Offline berechnen (auch wenn nur kurz)
      applyOfflineIfAny();
      render();
    }
  });

  window.addEventListener("beforeunload", () => save());
})();