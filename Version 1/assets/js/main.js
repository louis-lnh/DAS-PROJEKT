/* =========================================
   Das Projekt — Global JS (main.js)
   - Uhrzeit/Datum (Start + Topbar)
   - Start: Start-Block shrink wenn leer
   - Start: Notizen speichern (localStorage)
========================================= */

(function () {
  const $ = (id) => document.getElementById(id);

  function formatTime(date) {
    const h = String(date.getHours()).padStart(2, "0");
    const m = String(date.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  }

  function formatDateLong(date) {
    return new Intl.DateTimeFormat("de-DE", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "2-digit",
    }).format(date);
  }

  function updateClocks() {
    const now = new Date();

    // Start center
    const timeEl = $("time");
    const dateEl = $("date");
    if (timeEl) timeEl.textContent = formatTime(now);
    if (dateEl) dateEl.textContent = formatDateLong(now);

    // Topbar time (subpages + optional on start if used later)
    const topbarTime = $("topbar-time");
    if (topbarTime) topbarTime.textContent = formatTime(now);
  }

  function initStartNotes() {
    const input = $("start-notes");
    if (!input) return;

    const key = "dp_start_notes";
    input.value = localStorage.getItem(key) || "";

    input.addEventListener("input", () => {
      localStorage.setItem(key, input.value);
    });
  }

  function setCompactStartBlockIfEmpty() {
    const startBlock = $("theme-start");
    const metaLast = $("start-last");
    const metaNote = $("start-note");
    const metaEvent = $("start-event");

    if (!startBlock || !metaLast) return;

    const lastTxt = (metaLast.textContent || "").trim();
    const noteTxt = metaNote ? (metaNote.textContent || "").trim() : "";
    const eventTxt = metaEvent ? (metaEvent.textContent || "").trim() : "";

    // Wenn nur "—" / leer -> compact
    const isEmpty =
      (!lastTxt || lastTxt.endsWith("—") || lastTxt === "—") &&
      (!noteTxt || noteTxt.endsWith("—") || noteTxt === "—") &&
      (!eventTxt || eventTxt.endsWith("—") || eventTxt === "—");

    startBlock.classList.toggle("themeStart--compact", isEmpty);
  }

  function initSidebarPlaceholders() {
    // Fokus-Projekt name placeholder (später aus Projekte/Fokus-state)
    const focusName = localStorage.getItem("dp_focus_project_name") || "—";
    const navFocus = $("nav-focus-project");
    if (navFocus) navFocus.textContent = focusName;

    // Top 5 Projekte placeholder (später aus Projektliste)
    const top = JSON.parse(localStorage.getItem("dp_top_projects") || "[]");
    for (let i = 0; i < 5; i++) {
      const el = $("nav-top-project-" + (i + 1));
      if (!el) continue;
      el.textContent = top[i] || "—";
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    updateClocks();
    setInterval(updateClocks, 1000);

    initStartNotes();
    setCompactStartBlockIfEmpty();
    initSidebarPlaceholders();
  });
})();
