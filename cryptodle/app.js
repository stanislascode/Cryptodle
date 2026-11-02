/* Cryptodle — Loldle-style daily guessing game for the Aarhus crypto group. */
(() => {
  "use strict";
  const DATA = window.CRYPTODLE_DATA;
  const PEOPLE = DATA.people;
  const BY_ID = Object.fromEntries(PEOPLE.map(p => [p.id, p]));
  const TZ = "Europe/Copenhagen";
  const LAUNCH = "2026-11-02";          // puzzle #1
  const SALT = "aarhus-crypto";          // change to reshuffle the daily order
  const STORE = "cryptodle:v1:";

  // ------------------------------------------------------------- utilities
  const $ = s => document.querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const norm = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ø/g, "o").replace(/æ/g, "ae").replace(/å/g, "a").toLowerCase();
  const load = (k, d) => { try { const v = localStorage.getItem(STORE + k); return v ? JSON.parse(v) : d; } catch { return d; } };
  const save = (k, v) => { try { localStorage.setItem(STORE + k, JSON.stringify(v)); } catch {} };

  function hash(str) { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function shuffled(arr, seed) { const a = arr.slice(), r = rng(seed); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  function todayStr() { return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
  function dayIndex(dateStr) { return Math.round((Date.parse(dateStr + "T00:00:00Z") - Date.parse(LAUNCH + "T00:00:00Z")) / 864e5); }
  function msToMidnight() {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date()).map(p => [p.type, p.value]));
    return ((23 - +parts.hour) * 3600 + (59 - +parts.minute) * 60 + (60 - +parts.second)) * 1000;
  }
  // picks item n of an endless sequence made of reshuffled cycles (no repeat inside a cycle)
  function pick(list, n, salt) {
    const cycle = Math.floor(n / list.length), i = ((n % list.length) + list.length) % list.length;
    return shuffled(list, hash(SALT + salt + cycle))[i];
  }

  const COLORS = ["#7cf3c4", "#8aa8ff", "#f6c177", "#f38ba8", "#a6e3a1", "#cba6f7", "#89dceb", "#fab387", "#94e2d5", "#f5c2e7"];
  function avatar(p) {
    const a = el("div", "avatar");
    if (p.photo) a.innerHTML = `<img src="${esc(p.photo)}" alt="">`;
    else { a.textContent = p.initials; a.style.background = COLORS[hash(p.id) % COLORS.length]; }
    return a;
  }

  // ------------------------------------------------------- paper helpers
  const PAPERS = DATA.papers.filter(x => x.year >= 2010 && x.title.length > 12);
  const COAUTH = {};
  for (const x of DATA.papers) for (const a of x.group) for (const b of x.group) if (a !== b) (COAUTH[a] ||= new Set()).add(b);

  // ------------------------------------------------------ classic columns
  const ROLE_FAMILY = {
    "Full Professor": "fac", "Associate Prof.": "fac", "Assistant Prof.": "fac",
    "Senior Researcher": "res", "Postdoc": "res", "Industry": "ind",
    "PhD Student": "stu", "Master Student": "stu", "Admin Staff": "adm",
  };
  const PHD_KEY = v => v === "ongoing" ? 9999 : v;
  const fmtList = (v, none = "Unknown") => (v && v.length) ? v.map(x => `<span class="multi">${esc(x)}</span>`).join("") : esc(none);

  function cmpSet(a, b) {
    a = a || []; b = b || [];
    if (a.length === b.length && a.every(x => b.includes(x))) return "ok";
    return a.some(x => b.includes(x)) ? "part" : "ko";
  }
  function cmpNum(g, t, key = x => x) {
    if (g === t) return { c: "ok" };
    if (g == null || t == null) return { c: "ko" };
    return { c: "ko", arrow: key(t) > key(g) ? "▲" : "▼" };
  }
  const COLUMNS = [
    { h: "Role", f: (g, t) => ({ c: g.role === t.role ? "ok" : ROLE_FAMILY[g.role] === ROLE_FAMILY[t.role] ? "part" : "ko", v: esc(g.role) }) },
    { h: "At Aarhus", f: (g, t) => ({ c: g.status === t.status ? "ok" : "ko", v: esc(g.status) }) },
    { h: "Aarhus path", f: (g, t) => ({ c: cmpSet(g.path, t.path), v: fmtList(g.path) }) },
    { h: "Research", f: (g, t) => ({ c: cmpSet(g.tags, t.tags), v: fmtList(g.tags, "—") }) },
    { h: "Based in", f: (g, t) => ({ c: g.country == null && t.country == null ? "ok" : cmpSet(g.country, t.country), v: fmtList(g.country, "Unknown") }) },
    { h: "PhD from", f: (g, t) => ({ c: g.phdCountry == null && t.phdCountry == null ? "ok" : cmpSet(g.phdCountry, t.phdCountry), v: fmtList(g.phdCountry, "No PhD") }) },
    { h: "PhD year", f: (g, t) => ({ ...cmpNum(g.phd, t.phd, PHD_KEY), v: g.phd == null ? "No PhD" : g.phd === "ongoing" ? "Ongoing" : g.phd }) },
    { h: "ePrints", f: (g, t) => ({ ...cmpNum(g.eprints, t.eprints), v: g.eprints }) },
  ];

  // ----------------------------------------------------------------- state
  let mode = load("mode", "classic");
  let practice = false;
  let practiceTarget = null;
  let state = null;   // { key, target, guesses: [ids], won }

  function dailyTarget(m, n) {
    return m === "classic" ? pick(PEOPLE.map(p => p.id), n, "classic") : pick(PAPERS.map(x => x.id), n, "paper");
  }
  function paperById(id) { return DATA.papers.find(x => x.id === id); }

  function newPracticeTarget() {
    const list = mode === "classic" ? PEOPLE.map(p => p.id) : PAPERS.map(x => x.id);
    return list[Math.floor(Math.random() * list.length)];
  }

  function loadState() {
    if (practice) {
      practiceTarget ||= newPracticeTarget();
      state = { key: null, target: practiceTarget, guesses: [], won: false, ...(state && state.practiceOf === mode && state.target === practiceTarget ? state : {}) , practiceOf: mode };
      return;
    }
    const day = todayStr(), n = dayIndex(day);
    const key = `${mode}:${day}`;
    const saved = load("day:" + key, null);
    state = { key, n, target: dailyTarget(mode, n), guesses: [], won: false, ...(saved || {}) };
    state.target = dailyTarget(mode, n);
  }
  function persist() { if (!practice) save("day:" + state.key, { guesses: state.guesses, won: state.won }); }

  function isCorrect(id) {
    return mode === "classic" ? id === state.target : paperById(state.target).group.includes(id);
  }

  // --------------------------------------------------------------- render
  function render() {
    document.querySelectorAll(".mode").forEach(b => {
      b.classList.toggle("active", b.dataset.mode === mode);
      const d = load(`day:${b.dataset.mode}:${todayStr()}`, null);
      b.querySelector(".mode-done").hidden = !(d && d.won);
    });
    renderIntro();
    renderBoard(false);
    renderHints();
    renderWin();
    renderYesterday();
    $("#guess-bar").hidden = state.won;
    $("#counter").textContent = state.won ? "" : state.guesses.length ? `${state.guesses.length} guess${state.guesses.length > 1 ? "es" : ""} so far` : "";
    $("#new-practice").hidden = !practice;
    $("#practice").checked = practice;
  }

  function renderIntro() {
    const box = $("#intro"); box.innerHTML = "";
    if (practice) box.append(el("span", "practice-badge", "UNLIMITED MODE"));
    if (mode === "classic") {
      box.append(el("h2", null, "Who is today's cryptographer?"));
      box.append(el("p", null, practice ? "A random member — guess as many as you like." : `Puzzle #${state.n + 1} · type any name to start`));
    } else {
      const x = paperById(state.target);
      box.append(el("h2", null, "Who wrote this ePrint?"));
      box.append(el("p", "paper-title", esc(x.title)));
      box.append(el("p", null, practice ? "Name any author from the group." : `Puzzle #${state.n + 1} · name any author from the group`));
    }
  }

  function renderBoard(animateFirst) {
    const board = $("#board"); board.innerHTML = "";
    if (!state.guesses.length) return;
    if (mode === "classic") {
      const head = el("div", "row head");
      head.append(el("div", "cell", "Who"));
      COLUMNS.forEach(c => head.append(el("div", "cell", c.h)));
      board.append(head);
    }
    const t = mode === "classic" ? BY_ID[state.target] : null;
    [...state.guesses].reverse().forEach((id, i) => {
      const g = BY_ID[id];
      const row = el("div", "row" + (mode === "paper" ? " paper-row" : ""));
      const nameCell = el("div", "cell name"); nameCell.append(avatar(g), el("span", null, esc(g.name)));
      row.append(nameCell);
      const cells = [];
      if (mode === "classic") {
        COLUMNS.forEach(col => {
          const r = col.f(g, t);
          const c = el("div", "cell " + r.c);
          if (r.arrow) c.append(el("div", "arrow-bg", r.arrow));
          c.append(el("span", null, String(r.v)));
          cells.push(c);
        });
      } else {
        const p = paperById(state.target);
        const ok = p.group.includes(id);
        const co = !ok && p.group.some(a => COAUTH[id] && COAUTH[id].has(a));
        const c = el("div", "cell wide " + (ok ? "ok" : co ? "part" : "ko"));
        c.append(el("span", null, ok ? "Author ✓" : co ? "Co-authored with an author" : "Not an author"));
        cells.push(c);
      }
      cells.forEach((c, k) => { if (animateFirst && i === 0) { c.classList.add("flip"); c.style.animationDelay = `${k * 0.18}s`; } row.append(c); });
      board.append(row);
    });
  }

  function renderHints() {
    const box = $("#hints"); box.innerHTML = "";
    const n = state.guesses.length;
    let hints;
    if (mode === "classic") {
      const t = BY_ID[state.target];
      const mine = DATA.papers.filter(x => x.group.includes(t.id));
      const paper = mine.length ? mine[hash(t.id + state.target) % mine.length] : null;
      hints = [
        { at: 4, label: "One of their ePrints", val: paper ? `“${esc(paper.title)}” (${paper.year})` : "No ePrint on record" },
        { at: 8, label: "Current position", val: esc(t.position || "—") },
      ];
    } else {
      const x = paperById(state.target);
      const outside = x.authors.filter(a => !x.group.some(id => [BY_ID[id].name, ...BY_ID[id].aliases].map(norm).includes(norm(a))));
      hints = [
        { at: 2, label: "Year", val: x.year },
        { at: 4, label: "Authors", val: `${x.authors.length} in total, ${x.group.length} from the group` },
        { at: 6, label: "Other co-authors", val: outside.length ? esc(outside.join(", ")) : "none — only group members" },
      ];
    }
    hints.forEach(h => {
      const open = n >= h.at || state.won;
      box.append(el("div", "hint" + (open ? " open" : ""), open ? `<b>${h.label}</b>${h.val}` : `${h.label} · in ${h.at - n} guess${h.at - n > 1 ? "es" : ""}`));
    });
  }

  let timer = null;
  function renderWin() {
    const box = $("#win"); clearInterval(timer);
    if (!state.won) { box.hidden = true; return; }
    box.hidden = false; box.innerHTML = "";
    const last = BY_ID[state.guesses[state.guesses.length - 1]];
    box.append(el("div", "small", "🎉 Found in " + state.guesses.length + " guess" + (state.guesses.length > 1 ? "es" : "")));
    if (mode === "classic") {
      const who = el("div", "who"); who.append(avatar(last));
      who.append(el("div", null, `<h2>${esc(last.name)}</h2><div class="pos">${esc(last.position)}</div>`));
      box.append(who);
    } else {
      const x = paperById(state.target);
      const names = x.group.map(id => BY_ID[id].name);
      box.append(el("h2", null, `<a href="https://eprint.iacr.org/${x.id}" target="_blank" rel="noopener" style="color:inherit">ePrint ${x.id}</a>`));
      box.append(el("p", "pos", "Authors: " + esc(x.authors.join(", "))));
      if (names.length > 1) box.append(el("p", "small", "Group members on it: " + esc(names.join(", "))));
    }
    const actions = el("div", "actions");
    if (!practice) {
      const share = el("button", "btn", "Share result");
      share.onclick = shareResult;
      actions.append(share);
    }
    const other = el("button", "btn ghost", practice ? "Play another ↻" : (mode === "classic" ? "Try the ePrint mode →" : "Try the Classic mode →"));
    other.onclick = () => practice ? (practiceTarget = newPracticeTarget(), state = null, loadState(), render()) : switchMode(mode === "classic" ? "paper" : "classic");
    actions.append(other);
    box.append(actions);
    if (!practice) {
      box.append(el("p", "small", "Next puzzle in"));
      const cd = el("div", "countdown"); box.append(cd);
      const tick = () => { const s = Math.floor(msToMidnight() / 1000); cd.textContent = [s / 3600, (s % 3600) / 60, s % 60].map(v => String(Math.floor(v)).padStart(2, "0")).join(":"); if (s <= 0) location.reload(); };
      tick(); timer = setInterval(tick, 1000);
    }
  }

  function renderYesterday() {
    const p = $("#yesterday");
    if (practice) { p.innerHTML = ""; return; }
    const n = dayIndex(todayStr()) - 1;
    if (n < 0) { p.innerHTML = ""; return; }
    const t = dailyTarget(mode, n);
    p.innerHTML = mode === "classic" ? `Yesterday's cryptographer was <b>${esc(BY_ID[t].name)}</b>` : `Yesterday's ePrint was <b>${esc(paperById(t).title)}</b> (${t})`;
  }

  // ------------------------------------------------------------- guessing
  let sugg = [], sel = 0;
  function candidates(q) {
    q = norm(q.trim());
    if (!q) return [];
    const used = new Set(state.guesses);
    return PEOPLE.filter(p => !used.has(p.id)).map(p => {
      const names = [p.name, ...p.aliases].map(norm);
      let score = -1;
      for (const nm of names) {
        if (nm.startsWith(q)) score = Math.max(score, 3);
        else if (nm.split(/[\s-]+/).some(w => w.startsWith(q))) score = Math.max(score, 2);
        else if (nm.includes(q)) score = Math.max(score, 1);
      }
      return { p, score };
    }).filter(x => x.score >= 0).sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name)).map(x => x.p);
  }
  function showSuggestions() {
    const ul = $("#suggestions");
    sugg = candidates($("#guess-input").value); sel = 0;
    ul.innerHTML = "";
    if (!sugg.length) { ul.hidden = true; return; }
    sugg.slice(0, 8).forEach((p, i) => {
      const li = el("li", i === sel ? "sel" : ""); li.setAttribute("role", "option");
      const q = norm($("#guess-input").value.trim());
      const alias = !norm(p.name).includes(q) ? p.aliases.find(a => norm(a).includes(q)) : null;
      li.append(avatar(p), el("div", null, esc(p.name) + (alias ? `<div class="alias">${esc(alias)}</div>` : "")));
      li.onmousedown = e => { e.preventDefault(); guess(p.id); };
      ul.append(li);
    });
    ul.hidden = false;
  }
  function moveSel(d) {
    const items = [...document.querySelectorAll("#suggestions li")];
    if (!items.length) return;
    sel = (sel + d + items.length) % items.length;
    items.forEach((li, i) => li.classList.toggle("sel", i === sel));
    items[sel].scrollIntoView({ block: "nearest" });
  }
  function guess(id) {
    if (state.won || state.guesses.includes(id)) return;
    state.guesses.push(id);
    $("#guess-input").value = ""; $("#suggestions").hidden = true;
    const correct = isCorrect(id);
    if (correct) state.won = true;
    persist();
    renderBoard(true); renderHints();
    $("#counter").textContent = `${state.guesses.length} guess${state.guesses.length > 1 ? "es" : ""} so far`;
    if (correct) {
      if (!practice) recordWin();
      const delay = mode === "classic" ? COLUMNS.length * 180 + 500 : 600;
      $("#guess-bar").hidden = true;
      setTimeout(() => { render(); $("#win").scrollIntoView({ behavior: "smooth", block: "center" }); confetti(); }, delay);
    }
  }

  // ----------------------------------------------------------------- stats
  function recordWin() {
    const s = load("stats:" + mode, { played: 0, streak: 0, best: 0, last: null, dist: {} });
    if (s.last === state.n) return;
    s.played++;
    s.streak = s.last === state.n - 1 ? s.streak + 1 : 1;
    s.best = Math.max(s.best, s.streak);
    s.last = state.n;
    const k = state.guesses.length > 10 ? "11+" : String(state.guesses.length);
    s.dist[k] = (s.dist[k] || 0) + 1;
    save("stats:" + mode, s);
  }
  function showStats() {
    const s = load("stats:" + mode, { played: 0, streak: 0, best: 0, last: null, dist: {} });
    const streak = s.last != null && s.last >= dayIndex(todayStr()) - 1 ? s.streak : 0;
    const total = Object.entries(s.dist).reduce((a, [k, v]) => a + (k === "11+" ? 11 : +k) * v, 0);
    $("#stats-mode").textContent = mode === "classic" ? "Classic" : "ePrint";
    $("#stat-grid").innerHTML = [
      ["Solved", s.played], ["Streak", streak], ["Best streak", s.best], ["Avg. guesses", s.played ? (total / s.played).toFixed(1) : "–"],
    ].map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join("");
    const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11+"];
    const max = Math.max(1, ...keys.map(k => s.dist[k] || 0));
    $("#dist").innerHTML = keys.map(k => `<div class="bar"><span class="k">${k}</span><i style="width:${Math.max(6, (s.dist[k] || 0) / max * 100)}%">${s.dist[k] || 0}</i></div>`).join("");
    $("#dlg-stats").showModal();
  }

  function shareResult() {
    let grid;
    if (mode === "classic") {
      const t = BY_ID[state.target];
      grid = state.guesses.slice(0, 8).map(id => COLUMNS.map(c => {
        const r = c.f(BY_ID[id], t); return r.c === "ok" ? "🟩" : r.c === "part" ? "🟧" : r.arrow === "▲" ? "⬆️" : r.arrow === "▼" ? "⬇️" : "🟥";
      }).join("")).join("\n");
      if (state.guesses.length > 8) grid += `\n… +${state.guesses.length - 8} more`;
    } else {
      const p = paperById(state.target);
      grid = state.guesses.map(id => p.group.includes(id) ? "🟩" : p.group.some(a => COAUTH[id] && COAUTH[id].has(a)) ? "🟧" : "🟥").join("");
    }
    const text = `🔐 Cryptodle #${state.n + 1} · ${mode === "classic" ? "Classic" : "ePrint"}\nSolved in ${state.guesses.length} guess${state.guesses.length > 1 ? "es" : ""}\n${grid}\n${location.href.split("#")[0].split("?")[0]}`;
    const done = () => toast("Copied to clipboard");
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => prompt("Copy your result:", text));
    else prompt("Copy your result:", text);
  }

  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 1800); }

  function confetti() {
    const cv = document.createElement("canvas");
    cv.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:60"; cv.width = innerWidth; cv.height = innerHeight;
    document.body.append(cv);
    const ctx = cv.getContext("2d"), parts = [];
    const glyphs = "01⊕∑λπ{}#".split("");
    for (let i = 0; i < 90; i++) parts.push({ x: innerWidth / 2, y: innerHeight / 3, vx: (Math.random() - .5) * 14, vy: Math.random() * -12 - 3, g: glyphs[i % glyphs.length], c: COLORS[i % COLORS.length], r: Math.random() * 6 });
    let f = 0;
    (function step() {
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.font = "700 18px JetBrains Mono, monospace";
      parts.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += .35; p.vx *= .99; ctx.fillStyle = p.c; ctx.fillText(p.g, p.x, p.y); });
      if (++f < 120) requestAnimationFrame(step); else cv.remove();
    })();
  }

  // ---------------------------------------------------------------- wiring
  function switchMode(m) { mode = m; save("mode", m); practiceTarget = null; state = null; loadState(); render(); window.scrollTo({ top: 0, behavior: "smooth" }); }

  document.querySelectorAll(".mode").forEach(b => b.onclick = () => switchMode(b.dataset.mode));
  const input = $("#guess-input");
  input.addEventListener("input", showSuggestions);
  input.addEventListener("focus", showSuggestions);
  input.addEventListener("blur", () => setTimeout(() => $("#suggestions").hidden = true, 120));
  input.addEventListener("keydown", e => {
    if (e.key === "ArrowDown") { e.preventDefault(); moveSel(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); moveSel(-1); }
    else if (e.key === "Enter") { e.preventDefault(); if (sugg.length) guess(sugg[Math.min(sel, sugg.length - 1)].id); }
    else if (e.key === "Escape") $("#suggestions").hidden = true;
  });
  $("#guess-btn").onclick = () => { if (sugg.length) guess(sugg[Math.min(sel, sugg.length - 1)].id); else input.focus(); };
  $("#btn-help").onclick = () => $("#dlg-help").showModal();
  $("#btn-stats").onclick = showStats;
  $("#practice").onchange = e => { practice = e.target.checked; practiceTarget = null; state = null; loadState(); render(); };
  $("#new-practice").onclick = () => { practiceTarget = newPracticeTarget(); state = null; loadState(); render(); };
  $("#data-date").textContent = DATA.generated;

  if (!load("seen-help", false)) { save("seen-help", true); setTimeout(() => $("#dlg-help").showModal(), 300); }
  loadState(); render();
})();
