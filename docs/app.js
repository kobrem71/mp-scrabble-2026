/* MP w Scrabble 2026 – dashboard fazy finałowej */
(async function () {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = (p, d = 1) => (p * 100).toFixed(d) + "%";
  const fmt = (x, d = 2) => Number(x).toFixed(d);
  const rec = f => `${f.w}–${f.l}–${f.d}`; // wygrane–porażki–remisy, zawsze z remisami
  // okrągłe zdjęcie gracza (duotone w kolorach strony)
  const av = (i, cls = "") => `<img class="pav ${cls}" src="img/p${P[i].id}.jpg?v=1" alt="" width="28" height="28" loading="lazy" decoding="async">`;
  const short = n => { const [f, ...l] = n.split(" "); return f[0] + ". " + l.join(" "); };

  function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }

  // ---------- płytki ----------
  const VAL = { A: 1, Ą: 5, B: 3, C: 2, Ć: 6, D: 2, E: 1, Ę: 5, F: 5, G: 3, H: 3, I: 1, J: 3, K: 2, L: 2, Ł: 3, M: 2, N: 1, Ń: 7, O: 1, Ó: 5, P: 2, R: 1, S: 1, Ś: 5, T: 2, U: 3, W: 1, Y: 2, Z: 1, Ź: 9, Ż: 5 };
  function tilesHTML(word, wobble) {
    return [...word.toUpperCase()].map((ch, k) => {
      if (ch === " ") return '<span class="tile-gap"></span>';
      const v = VAL[ch];
      const cls = ch === "-" ? " dash" : v === undefined && !/[0-9]/.test(ch) ? " blank" : "";
      const st = wobble ? ` style="--rot:${(((k * 37) % 7) - 3) * 0.9}deg;--dy:${(((k * 53) % 5) - 2)}px"` : "";
      return `<span class="tile${cls}"${st} aria-hidden="true">${esc(ch)}${v ? `<sub>${v}</sub>` : ""}</span>`;
    }).join("");
  }
  document.querySelectorAll("[data-word]").forEach(el => { el.innerHTML = tilesHTML(el.dataset.word, el.classList.contains("tiles-xl")); });

  // ---------- dane ----------
  const bust = "?v=" + Date.now();
  let [DATA, RES] = await Promise.all([
    fetch("data.json" + bust).then(r => r.json()),
    fetch("results.json" + bust).then(r => r.json()),
  ]);
  const P = DATA.players;
  const N = P.length;
  const IDX = Object.fromEntries(P.map((p, i) => [p.name, i]));
  const M = DATA.model;
  const H = DATA.h2h;

  const matches = [];
  function loadMatches() {
    matches.length = 0;
    RES.rounds.forEach(r => r.matches.forEach((m, k) => matches.push({
      round: r.round, key: r.round + ":" + k, a: IDX[m.a], b: IDX[m.b], score: m.score, tentative: !!r.tentative,
    })));
    matches.forEach(m => { if (m.a === undefined || m.b === undefined) console.error("Nieznany gracz w results.json", m); });
  }
  loadMatches();

  let whatIf = {};
  try { whatIf = JSON.parse(safeGet("mp2026-whatif") || "{}"); } catch (e) { }

  // ---------- model ----------
  function prior(i, j) { return 1 / (1 + Math.exp(-M.k * (P[i].strength - P[j].strength))); }
  function prob(i, j) {
    const p0 = prior(i, j), x = H[i][j];
    if (!x) return p0;
    const g = x.w + x.d + x.l;
    return (x.w + x.d / 2 + M.prior * p0) / (g + M.prior);
  }
  const odds = (p, margin) => p <= 0 ? null : Math.max(1.01, 1 / (p * (1 + margin)));
  const fmtOdds = o => o == null ? "—" : o.toFixed(2); // zawsze z kropką i 2 miejscami

  function invNorm(p) { // Acklam
    const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
    const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
    const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
    const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
    const pl = 0.02425;
    if (p < pl) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p > 1 - pl) { const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    const q = p - 0.5, r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  let seed = 20261116;
  function rand() { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
  function randn() { let u = 0, v = 0; while (!u) u = rand(); while (!v) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  // ---------- tabela ----------
  function standings() {
    const s = P.map((p, i) => ({ i, played: 0, w: 0, l: 0, d: 0, pf: 0, pa: 0, form: [] }));
    for (const m of matches) {
      const A = s[m.a], B = s[m.b];
      if (m.score) {
        const [x, y] = m.score;
        A.played++; B.played++; A.pf += x; A.pa += y; B.pf += y; B.pa += x;
        if (x > y) { A.w++; B.l++; A.form.push("w"); B.form.push("l"); }
        else if (x < y) { B.w++; A.l++; A.form.push("l"); B.form.push("w"); }
        else { A.d++; B.d++; A.form.push("d"); B.form.push("d"); }
      } else if (Array.isArray(whatIf[m.key])) {
        const [x, y] = whatIf[m.key];
        A.played++; B.played++; A.pf += x; A.pa += y; B.pf += y; B.pa += x;
        if (x > y) { A.w++; B.l++; A.form.push("hw"); B.form.push("hl"); } else { B.w++; A.l++; A.form.push("hl"); B.form.push("hw"); }
      } else if (whatIf[m.key]) {
        const winA = whatIf[m.key] === "a";
        A.played++; B.played++;
        if (winA) { A.w++; B.l++; A.form.push("hw"); B.form.push("hl"); } else { B.w++; A.l++; A.form.push("hl"); B.form.push("hw"); }
      }
    }
    s.forEach(x => { x.pts = x.w + x.d / 2; x.spread = x.pf - x.pa; });
    return s.sort((x, y) => y.pts - x.pts || y.spread - x.spread || (SIM ? SIM[y.i].title - SIM[x.i].title || SIM[x.i].avgPlace - SIM[y.i].avgPlace : 0) || P[y.i].rank - P[x.i].rank);
  }

  // ---------- Monte Carlo ----------
  const SIMS = 20000;
  function simulate(pre = false) {
    seed = 20261116; // stałe ziarno: te same kursy przy każdym odświeżeniu
    const base = new Float64Array(N), baseSpread = new Float64Array(N);
    const open = [];
    for (const m of matches) {
      if (pre) {
        const p = prob(m.a, m.b);
        open.push([m.a, m.b, M.spreadSd * invNorm(Math.min(Math.max(p, 1e-6), 1 - 1e-6))]);
      } else if (m.score) {
        const [x, y] = m.score;
        base[m.a] += x > y ? 1 : x === y ? .5 : 0; base[m.b] += y > x ? 1 : x === y ? .5 : 0;
        baseSpread[m.a] += x - y; baseSpread[m.b] += y - x;
      } else if (Array.isArray(whatIf[m.key])) {
        const [x, y] = whatIf[m.key];
        base[x > y ? m.a : m.b] += 1;
        baseSpread[m.a] += x - y; baseSpread[m.b] += y - x;
      } else if (whatIf[m.key]) {
        const w = whatIf[m.key] === "a" ? m.a : m.b, l = w === m.a ? m.b : m.a;
        base[w] += 1; baseSpread[w] += 60; baseSpread[l] -= 60;
      } else {
        const p = prob(m.a, m.b);
        open.push([m.a, m.b, M.spreadSd * invNorm(Math.min(Math.max(p, 1e-6), 1 - 1e-6))]);
      }
    }
    const title = new Float64Array(N), podium = new Float64Array(N), place = new Float64Array(N);
    const pts = new Float64Array(N), spr = new Float64Array(N), order = [...Array(N).keys()];
    for (let s = 0; s < SIMS; s++) {
      pts.set(base); spr.set(baseSpread);
      for (const [a, b, mu] of open) {
        const d = mu + M.spreadSd * randn();
        if (d > 0) pts[a]++; else pts[b]++;
        spr[a] += d; spr[b] -= d;
      }
      order.sort((x, y) => pts[y] - pts[x] || spr[y] - spr[x]);
      title[order[0]]++;
      for (let k = 0; k < 3; k++) podium[order[k]]++;
      for (let k = 0; k < N; k++) place[order[k]] += k + 1;
    }
    return P.map((p, i) => ({ i, title: title[i] / SIMS, podium: podium[i] / SIMS, avgPlace: place[i] / SIMS }));
  }

  // ---------- symulacja całego turnieju (dokładne wyniki) ----------
  function gaussRand() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function simScore(a, b) {
    const p = Math.min(Math.max(prob(a, b), 1e-4), 1 - 1e-4);
    const d = M.spreadSd * invNorm(p) + M.spreadSd * gaussRand();           // różnica małych
    const fa = P[a].form, fb = P[b].form;
    const total = (fa.avg + fa.oppAvg + fb.avg + fb.oppAvg) / 2 + 55 * gaussRand(); // suma małych w partii
    let x = Math.round((total + d) / 2), y = Math.round((total - d) / 2);
    x = Math.max(x, 120); y = Math.max(y, 120);
    if (x === y) { if (d >= 0) x++; else y++; }
    return [x, y];
  }
  const isDone = m => !!m.score || Array.isArray(whatIf[m.key]);
  const finished = () => matches.every(isDone);
  function saveSim() { safeSet("mp2026-whatif", JSON.stringify(whatIf)); renderAll(); }
  function simulateTournament() {
    for (const m of matches) if (!m.score) whatIf[m.key] = simScore(m.a, m.b);
    saveSim();
  }
  function simulateNextRound() {
    const r = RES.rounds.find(r => matches.some(m => m.round === r.round && !isDone(m)));
    if (!r) return;
    for (const m of matches) if (m.round === r.round && !isDone(m)) whatIf[m.key] = simScore(m.a, m.b);
    roundSel.value = r.round;
    saveSim();
  }
  function clearSim() { whatIf = {}; safeSet("mp2026-whatif", "{}"); renderAll(); }
  document.querySelectorAll(".sim-btn").forEach(b => b.addEventListener("click", simulateTournament));
  document.querySelectorAll(".next-btn").forEach(b => b.addEventListener("click", simulateNextRound));
  document.querySelectorAll(".clear-btn").forEach(b => b.addEventListener("click", clearSim));

  // ---------- tooltip ----------
  const tip = $("#tooltip");
  function showTip(e, html) { tip.innerHTML = html; tip.hidden = false; moveTip(e); }
  function moveTip(e) {
    const r = tip.getBoundingClientRect();
    let x = e.clientX + 14, y = e.clientY + 14;
    if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14;
    if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 14;
    tip.style.left = x + "px"; tip.style.top = y + "px";
  }
  function hideTip() { tip.hidden = true; }
  function bindTip(el, fn) {
    el.addEventListener("mouseenter", e => showTip(e, fn()));
    el.addEventListener("mousemove", moveTip);
    el.addEventListener("mouseleave", hideTip);
  }
  const tRow = (k, v) => `<div class="row"><span>${k}</span><b>${v}</b></div>`;

  // ---------- zakładki ----------
  document.querySelectorAll(".tabs button").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll(".tabs button").forEach(x => x.setAttribute("aria-selected", x === b));
    document.querySelectorAll(".panel").forEach(p => p.hidden = p.dataset.panel !== b.dataset.tab);
    location.hash = b.dataset.tab;
  }));
  if (location.hash) { const b = document.querySelector(`.tabs button[data-tab="${location.hash.slice(1)}"]`); if (b) b.click(); }

  // ---------- render ----------
  let SIM = null;
  function renderAll() {
    SIM = simulate();
    renderStandings(); renderTitle(); renderForm(); renderMatches(); renderMatrix(); renderPair(); renderPlayers(); renderTyper(); renderFaq();
  }

  const formDots = str => [...str].map(c => c === "W" ? '<span class="form-dot w" title="wygrana"></span>' : c === "L" ? '<span class="form-dot l" title="porażka"></span>' : '<span class="form-dot d" title="remis"></span>').join("");
  const formPct = f => (f.w + f.d / 2) / f.n;

  function renderStandings() {
    const st = standings();
    const simBy = Object.fromEntries(SIM.map(s => [s.i, s]));
    $("#tiebreakNote").textContent = "Kolejność: duże punkty → różnica małych punktów";
    const nSim = matches.filter(m => !m.score && whatIf[m.key]).length, nReal = matches.filter(m => m.score).length;
    $("#simState").innerHTML = nSim ? `<b>Symulacja:</b> ${nSim} partii symulowanych, ${nReal} rozegranych` + (nSim + nReal === matches.length ? " – tabela pokazuje wynik końcowy symulowanego turnieju" : "") : `${nReal} z ${matches.length} partii rozegranych`;
    const done = finished();
    const nextR = RES.rounds.find(r => matches.some(m => m.round === r.round && !isDone(m)));
    document.querySelectorAll(".next-btn").forEach(b => { b.disabled = !nextR; b.textContent = nextR ? `⏭ Symuluj rundę ${nextR.round}` : "⏭ Symuluj następną rundę"; });
    document.querySelectorAll(".sim-btn").forEach(b => { b.disabled = matches.every(m => m.score); });
    const rows = st.map((s, k) => {
      const p = P[s.i], sm = simBy[s.i];
      const tail = done ? `<td></td><td></td><td></td>` : `<td class="num"><b>${pct(sm.title)}</b></td><td class="num"><b class="odds-ink">${fmtOdds(odds(sm.title, M.marginOutright))}</b></td><td class="num">${pct(sm.podium, 0)}</td>`;
      const form = s.form.slice(-5).map(f => f === "w" ? '<span class="form-dot w" title="wygrana"></span>' : f === "l" ? '<span class="form-dot l" title="porażka"></span>' : f === "hw" ? '<span class="form-dot w h" title="wygrana (symulacja)"></span>' : f === "hl" ? '<span class="form-dot l h" title="porażka (symulacja)"></span>' : '<span class="form-dot" title="remis" style="background:var(--text-muted)"></span>').join("");
      return `<tr data-i="${s.i}"><td class="pos">${k + 1}</td><td class="pname-cell"><span class="pn">${av(s.i)}${esc(p.name)}</span></td><td class="num">${s.played}</td><td class="num"><b>${fmt(s.pts, 1).replace(/\.0$/, "")}</b></td><td class="num">${s.pf || "–"}</td><td class="num">${s.spread > 0 ? "+" : ""}${s.spread}</td><td>${form}</td>${tail}</tr>`;
    }).join("");
    $("#standings").innerHTML = `<thead><tr><th>#</th><th>Gracz</th><th class="num">M</th><th class="num">Pkt</th><th class="num">Małe</th><th class="num">+/−</th><th>Forma</th><th class="num">Tytuł</th><th class="num">Kurs</th><th class="num">Podium</th></tr></thead><tbody>${rows}</tbody>`;
    $("#standings").querySelectorAll("tbody tr").forEach(tr => bindTip(tr, () => {
      const i = +tr.dataset.i, sm = SIM.find(s => s.i === i), p = P[i];
            return `<div class="t">${esc(p.name)}</div>${tRow("Ranking PFS", fmt(p.rank) + ` (${p.rankPlace}.)`)}${tRow("Forma 140+", `${p.form.w}W-${p.form.l}L-${p.form.d}D`)}${tRow("Siła w modelu", fmt(p.strength))}${finished() ? "" : tRow("Szansa na tytuł", pct(sm.title)) + tRow("Szansa na podium", pct(sm.podium)) + tRow("Średnie miejsce (sym.)", fmt(sm.avgPlace, 1))}`;
    }));
  }

  function renderForm() {
    const ord = [...P.keys()].sort((a, b) => formPct(P[b].form) - formPct(P[a].form));
    $("#formNote").textContent = `partie od ${DATA.form.cutoff}, rywale z rankingiem ≥ ${DATA.form.minRank} · * mniej niż ${DATA.form.minGames} partii – okno 30 mies. (od ${DATA.form.extCutoff})`;
    $("#formChart").innerHTML = ord.map(i => {
      const f = P[i].form, v = formPct(f);
      return `<div class="form-row" data-i="${i}"><span class="name">${av(i, "sm")}${esc(P[i].name)}${f.months > 12 ? '<span class="ext" title="okno 30 miesięcy">*</span>' : ""}</span><span class="rec"><b>${rec(f)}</b></span><div class="bar-track"><div class="bar-fill" style="width:${v * 100}%"></div></div><span class="val"><b>${pct(v, 1)}</b></span><span class="dots">${formDots(f.last10)}</span></div>`;
    }).join("");
    $("#formChart").querySelectorAll(".form-row").forEach(r => bindTip(r, () => {
      const p = P[+r.dataset.i], f = p.form;
      return `<div class="t">${esc(p.name)}</div>${tRow("Okres", `${f.months} mies. (od ${f.cutoff})`)}${f.elim ? tRow("w tym eliminacje MP", `${f.elim} partii`) : ""}${tRow("Bilans (W–P–R)", rec(f))}${tRow("% wygranych", pct(formPct(f)))}${tRow("Śr. ranking rywali", fmt(f.oppRank))}${tRow("Śr. małe / rywala", `${fmt(f.avg, 1)} / ${fmt(f.oppAvg, 1)}`)}${tRow("Ranking formy", fmt(p.formRatingRaw, 1))}${tRow("Ranking formy (po ściągnięciu)", fmt(p.formRating, 1))}${tRow("Ostatnie 10", f.last10)}`;
    }));
  }

  function renderTitle() {
    if (finished()) {
      const st = standings(), sim = matches.some(m => !m.score);
      $("#titleHead").textContent = sim ? "Wynik symulacji" : "Klasyfikacja końcowa";
      $("#simNote").textContent = sim ? "turniej rozegrany w symulacji" : "turniej zakończony";
      $("#titleChart").innerHTML = st.slice(0, 3).map((x, k) => `<div class="podium-row"><span class="medal m${k + 1}">${k + 1}</span><span class="name">${av(x.i)}${esc(P[x.i].name)}</span><span class="val"><b>${fmt(x.pts, 1).replace(/\.0$/, "")} pkt</b> · ${x.spread > 0 ? "+" : ""}${x.spread}</span></div>`).join("") + `<p class="hint">Szanse i kursy na tytuł nie mają sensu po ostatniej rundzie – kliknij „Wyczyść symulację”, by wrócić do prognozy.</p>`;
      return;
    }
    $("#titleHead").textContent = "Szanse na tytuł";
    const s = [...SIM].sort((a, b) => b.title - a.title || a.avgPlace - b.avgPlace);
    const max = Math.max(...s.map(x => x.title), 0.0001);
    $("#simNote").textContent = `symulacja Monte Carlo, ${SIMS.toLocaleString("pl-PL")} przebiegów`;
    $("#titleChart").innerHTML = s.map(x => `<div class="bar-row" data-i="${x.i}"><span class="name">${av(x.i, "sm")}${esc(P[x.i].name)}</span><div class="bar-track"><div class="bar-fill" style="width:${(x.title / max) * 100}%"></div></div><span class="val"><b>${pct(x.title)}</b> · ${fmtOdds(odds(x.title, M.marginOutright))}</span></div>`).join("");
    $("#titleChart").querySelectorAll(".bar-row").forEach(r => bindTip(r, () => {
      const x = SIM.find(s => s.i === +r.dataset.i);
      return `<div class="t">${esc(P[x.i].name)}</div>${tRow("Tytuł", pct(x.title, 2))}${tRow("Kurs na tytuł", fmtOdds(odds(x.title, M.marginOutright)))}${tRow("Podium", pct(x.podium))}${tRow("Kurs na podium", fmtOdds(odds(x.podium, M.marginOutright)))}${tRow("Średnie miejsce", fmt(x.avgPlace, 1))}`;
    }));
  }

  // selektory
  const roundSel = $("#roundSel"), playerFilter = $("#playerFilter");
  roundSel.innerHTML = `<option value="">wszystkie</option>` + RES.rounds.map(r => `<option value="${r.round}">${r.round}</option>`).join("");
  const firstOpen = RES.rounds.find(r => r.matches.some(m => !m.score));
  roundSel.value = firstOpen ? firstOpen.round : "";
  playerFilter.innerHTML += [...P].sort((a, b) => a.name.split(" ").pop().localeCompare(b.name.split(" ").pop(), "pl")).map(p => `<option value="${IDX[p.name]}">${esc(p.name)}</option>`).join("");
  roundSel.addEventListener("change", renderMatches);
  playerFilter.addEventListener("change", renderMatches);

  function h2hStr(i, j) { const x = H[i][j]; return x ? `${x.w}–${x.l}${x.d ? ` (${x.d} rem.)` : ""}` : "brak gier"; }

  function renderMatches() {
    const r = roundSel.value, pf = playerFilter.value;
    const list = matches.filter(m => (!r || m.round == r) && (pf === "" || m.a == pf || m.b == pf));
    const byRound = {};
    list.forEach(m => (byRound[m.round] = byRound[m.round] || []).push(m));
    $("#matches").innerHTML = Object.entries(byRound).map(([rd, ms]) => `<div class="round"><h3 class="tiles tiles-sm" aria-label="Runda ${rd}">${tilesHTML("RUNDA " + rd)}</h3>${ms[0].tentative ? `<p class="tent">Pary szacunkowe – sędzia ustali je w trakcie turnieju (kursy i symulacja liczą się na pozostałych pojedynkach).</p>` : ""}<div class="round-grid">${ms.map(matchCard).join("")}</div></div>`).join("") || `<p class="muted">Brak meczów.</p>`;
    $("#matches").querySelectorAll("button.pname").forEach(b => b.addEventListener("click", () => {
      const key = b.dataset.key, side = b.dataset.side;
      if (whatIf[key] === side) delete whatIf[key]; else whatIf[key] = side;
      safeSet("mp2026-whatif", JSON.stringify(whatIf));
      renderAll();
    }));
    $("#matches").querySelectorAll(".match").forEach(el => bindTip(el.querySelector(".meta"), () => {
      const m = matches.find(x => x.key === el.dataset.key), x = H[m.a][m.b];
      return `<div class="t">${esc(short(P[m.a].name))} vs ${esc(short(P[m.b].name))}</div>${tRow("Bilans H2H", h2hStr(m.a, m.b))}${x ? tRow("Śr. małe pkt", `${fmt(x.avg, 1)} : ${fmt(x.oppAvg, 1)}`) + tRow("Passa (z perspektywy 1.)", x.streak) : ""}${tRow("Prawdop. z rankingu", pct(prior(m.a, m.b)))}${tRow("Prawdop. końcowe", pct(prob(m.a, m.b)))}`;
    }));
  }

  function matchCard(m) {
    const pa = prob(m.a, m.b), pb = 1 - pa;
    const played = !!m.score, sim = whatIf[m.key];
    const simSc = !played && Array.isArray(sim) ? sim : null;
    const sc = played ? m.score : simSc;
    const side = (i, p, s, sideKey) => {
      const k = sideKey === "a" ? 0 : 1;
      const win = sc ? sc[k] > sc[1 - k] : sim === sideKey;
      const right = sc ? `<span class="score${simSc ? " simsc" : ""}">${sc[k]}</span><span class="odds small-odds">${played ? "" : fmtOdds(odds(p, M.marginMatch))}</span>` : `<span class="odds">${fmtOdds(odds(p, M.marginMatch))}</span>`;
      return `<div class="side${sc ? " has-score" : ""}"><button class="pname ${win ? "win" : ""} ${!played && sim === sideKey ? "sim" : ""}" data-key="${m.key}" data-side="${sideKey}" ${played ? "disabled" : ""} title="${played ? "" : "Kliknij, by zasymulować wygraną"}">${av(i)}<span class="pnt">${esc(P[i].name)}</span></button><span class="pct">${pct(p, 0)}</span>${right}</div>`;
    };
    return `<div class="match ${played ? "played" : ""}${simSc ? " simulated" : ""}" data-key="${m.key}">${side(m.a, pa, 0, "a")}<div class="split"><span class="a" style="width:${pa * 100}%"></span><span class="b" style="width:${pb * 100}%"></span></div>${side(m.b, pb, 0, "b")}<div class="meta"><span>H2H: ${h2hStr(m.a, m.b)}</span><span>${played ? "rozegrany" : simSc ? "wynik symulowany" : "kurs dziesiętny"}</span></div></div>`;
  }

  // ---------- macierz ----------
  function cssVar(n) { return getComputedStyle($(".viz-root")).getPropertyValue(n).trim(); }
  function hex2rgb(h) { h = h.replace("#", ""); return [0, 2, 4].map(k => parseInt(h.slice(k, k + 2), 16)); }
  function mix(a, b, t) { const A = hex2rgb(a), B = hex2rgb(b); return A.map((v, k) => Math.round(v + (B[k] - v) * t)); }
  function divColor(p) {
    const neg = cssVar("--div-neg"), mid = cssVar("--div-mid"), pos = cssVar("--div-pos");
    const t = Math.min(1, Math.abs(p - 0.5) * 2 / 0.7);
    const rgb = p >= 0.5 ? mix(mid, pos, t) : mix(mid, neg, t);
    const lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
    return { bg: `rgb(${rgb.join(",")})`, fg: lum > 0.55 ? "#0b0b0b" : "#ffffff" };
  }
  const matrixOrder = () => [...P.keys()].sort((a, b) => P[b].rank - P[a].rank);
  let selPair = [IDX["Dominik Urbacki"] ?? 0, IDX["Kamil Górka"] ?? 1];

  function renderMatrix() {
    const ord = matrixOrder();
    const head = `<thead><tr><th></th>${ord.map(j => `<th class="avh" data-p="${j}">${av(j)}</th>`).join("")}</tr></thead>`;
    const body = ord.map(i => `<tr><th class="avh" data-p="${i}">${av(i)}</th>${ord.map(j => {
      if (i === j) return `<td class="self"></td>`;
      const x = H[i][j];
      const sel = (selPair[0] === i && selPair[1] === j) ? " sel" : "";
      if (!x) return `<td class="none${sel}" data-i="${i}" data-j="${j}">–</td>`;
      const g = x.w + x.d + x.l, c = divColor((x.w + x.d / 2) / g);
      return `<td class="${sel.trim()}" data-i="${i}" data-j="${j}" style="background:${c.bg};color:${c.fg}">${x.w}–${x.l}</td>`;
    }).join("")}</tr>`).join("");
    $("#h2hMatrix").innerHTML = head + `<tbody>${body}</tbody>`;
    const l = divColor(0.15).bg, m = divColor(0.5).bg, r = divColor(0.85).bg;
    $("#h2hLegend").innerHTML = `<span>0%</span><span class="ramp" style="background:linear-gradient(90deg,${l},${m},${r})"></span><span>100%</span><span class="muted">· wzór = brak gier</span>`;
    $("#h2hMatrix").querySelectorAll("th.avh").forEach(th => bindTip(th, () => { const p = P[+th.dataset.p]; return `<div class="t">${esc(p.name)}</div>${tRow("Ranking PFS", fmt(p.rank))}${tRow("Siła w modelu", fmt(p.strength))}`; }));
    $("#h2hMatrix").querySelectorAll("td[data-i]").forEach(td => {
      const i = +td.dataset.i, j = +td.dataset.j;
      bindTip(td, () => {
        const x = H[i][j];
        return `<div class="t">${esc(P[i].name)} vs ${esc(P[j].name)}</div>${tRow("Bilans", h2hStr(i, j))}${H[i][j] && H[i][j].elim ? tRow("w tym eliminacje MP", H[i][j].elim.map(g => g.join(":")).join(", ")) : ""}${x ? tRow("% wygranych", pct((x.w + x.d / 2) / (x.w + x.d + x.l))) + tRow("Śr. małe pkt", `${fmt(x.avg, 1)} : ${fmt(x.oppAvg, 1)}`) + tRow("Suma różnic", (x.diff > 0 ? "+" : "") + x.diff) + tRow("Passa", x.streak) : ""}${tRow("Szansa w finale", pct(prob(i, j)))}${tRow("Kurs", fmtOdds(odds(prob(i, j), M.marginMatch)))}`;
      });
      td.addEventListener("click", () => { selPair = [i, j]; renderMatrix(); renderPair(); });
    });
  }

  const pairA = $("#pairA"), pairB = $("#pairB");
  const opts = [...P.keys()].sort((a, b) => P[b].rank - P[a].rank).map(i => `<option value="${i}">${esc(P[i].name)}</option>`).join("");
  pairA.innerHTML = opts; pairB.innerHTML = opts;
  pairA.addEventListener("change", () => { selPair = [+pairA.value, +pairB.value]; renderMatrix(); renderPair(); });
  pairB.addEventListener("change", () => { selPair = [+pairA.value, +pairB.value]; renderMatrix(); renderPair(); });

  function renderPair() {
    const [i, j] = selPair;
    pairA.value = i; pairB.value = j;
    if (i === j) { $("#pairDetail").innerHTML = `<p class="muted">Wybierz dwóch różnych graczy.</p>`; return; }
    const x = H[i][j], pi = prob(i, j), a = P[i], b = P[j];
    const fm = matches.find(m => (m.a === i && m.b === j) || (m.a === j && m.b === i));
    const line = (l, k, r) => `<div class="l">${l}</div><div class="k">${k}</div><div class="r">${r}</div>`;
    $("#pairDetail").innerHTML = `
      <div class="pair-head"><div><div class="big">${x ? x.w : 0}</div><div class="small">${esc(a.name)}</div></div><div class="muted">H2H</div><div class="r"><div class="big">${x ? x.l : 0}</div><div class="small">${esc(b.name)}</div></div></div>
      <div class="split"><span class="a" style="width:${pi * 100}%"></span><span class="b" style="width:${(1 - pi) * 100}%"></span></div>
      <div class="kv">
        ${x && x.elim ? line(x.elim.map(g => `<b>${g[0]}</b>`).join(", "), "eliminacje MP 2026", x.elim.map(g => `<b>${g[1]}</b>`).join(", ")) : ""}
        ${line(pct(pi), "szansa w finale", pct(1 - pi))}
        ${line("<b>" + fmtOdds(odds(pi, M.marginMatch)) + "</b>", "kurs", "<b>" + fmtOdds(odds(1 - pi, M.marginMatch)) + "</b>")}
        ${line(pct(prior(i, j)), "szansa z samego rankingu", pct(1 - prior(i, j)))}
        ${x ? line(fmt(x.avg, 1), "śr. małe pkt w H2H", fmt(x.oppAvg, 1)) : ""}
        ${x ? line((x.diff > 0 ? "+" : "") + x.diff, "suma różnic małych", (x.diff > 0 ? "−" : "+") + Math.abs(x.diff)) : ""}
        ${x ? line(x.streak, "passa", x.streak.startsWith("+") ? "−" + x.streak.slice(1) : x.streak.startsWith("-") ? "+" + x.streak.slice(1) : x.streak) : ""}
        ${x && x.d ? line(x.d, "remisy", x.d) : ""}
        ${line(fmt(a.rank), "ranking PFS", fmt(b.rank))}
        ${line(`<b>${rec(a.form)}</b>`, "forma vs 140+ W–P–R", `<b>${rec(b.form)}</b>`)}
        ${line(pct(formPct(a.form), 1), "% wygr. vs 140+", pct(formPct(b.form), 1))}
        ${line(formDots(a.form.last10), "ostatnie 10 vs 140+", formDots(b.form.last10))}
        ${line(fmt(a.strength), "siła w modelu", fmt(b.strength))}
        ${line(fmt(a.avg12m, 1), "śr. małe (12 mies.)", fmt(b.avg12m, 1))}
      </div>
      <p class="hint">${fm ? (fm.score ? `W finale: ${esc(short(P[fm.a].name))} ${fm.score[0]} : ${fm.score[1]} ${esc(short(P[fm.b].name))} (runda ${fm.round}).` : `Mecz w finale: runda ${fm.round}.`) : ""}</p>`;
  }

  // Tabela graczy: gracze w wierszach, statystyki w kolumnach (sortowanie po kliknięciu w nagłówek, objaśnienia w podpowiedziach)
  let plSort = { key: "strength", dir: -1 };
  function playerStats(i) {
    const p = P[i], c = p.career, cg = c.w + c.d + c.l, f = p.form;
    let hw = 0, hl = 0, hd = 0;
    for (let j = 0; j < N; j++) if (H[i][j]) { hw += H[i][j].w; hl += H[i][j].l; hd += H[i][j].d; }
    return { i, p, cg, hw, hl, hd, c, f };
  }
  const dots2 = str => `<span class="dots2">${formDots(str.slice(0, 5))}<br>${formDots(str.slice(5))}</span>`;
  const PL_GROUPS = [["", 1], ["Ranking", 4], ["Forma – rywale z rankingiem 140+", 5], ["Ogólnie", 3], ["Przeciw finalistom", 2]];
  const PL_COLS = [
    { key: "name", label: "Gracz", tip: "Kliknij nazwisko, by otworzyć profil na scrabble.stats.org.pl", val: s => s.p.name.split(" ").slice(-1)[0], cls: "left",
      fmt: s => `<a href="https://scrabble.stats.org.pl/zindex.php?p=${s.p.id}" target="_blank" rel="noopener">${esc(s.p.name)}</a>` },
    { key: "strength", label: "Siła", tip: "Siła w modelu kursów: średnia z rankingu PFS, rankingu z 12 miesięcy i rankingu formy", val: s => s.p.strength, fmt: s => `<b>${fmt(s.p.strength)}</b>`, grpStart: true },
    { key: "rank", label: "Ranking<br>PFS", tip: "Aktualny ranking PFS (w nawiasie miejsce na liście)", val: s => s.p.rank, fmt: s => `${fmt(s.p.rank)}<small>${s.p.rankPlace}.</small>` },
    { key: "rank12m", label: "Ranking<br>12 mies.", tip: "Ranking z ostatnich 12 miesięcy (PFS)", val: s => s.p.rank12m, fmt: s => fmt(s.p.rank12m) },
    { key: "formRating", label: "Ranking<br>formy", tip: "Ranking osiągnięty w partiach z rywalami 140+ (przy małej liczbie gier przyciągnięty do rankingu PFS)", val: s => s.p.formRating, fmt: s => fmt(s.p.formRating, 1) },
    { key: "formRec", label: "W–P–R", tip: "Bilans wygrane–porażki–remisy z rywalami 140+ w ostatnich 12 mies. (z eliminacjami MP). * = okno 30 miesięcy", val: s => s.f.w - s.f.l, fmt: s => `<b>${s.f.w}–${s.f.l}–${s.f.d}</b>${s.f.months > 12 ? '<span class="ext">*</span>' : ""}`, grpStart: true },
    { key: "formPct", label: "%<br>wygr.", tip: "Procent wygranych z rywalami 140+", val: s => formPct(s.f), fmt: s => `<b>${fmt(100 * formPct(s.f), 1)}%</b>` },
    { key: "oppRank", label: "Ranking<br>rywali", tip: "Średni ranking rywali w tych partiach – im wyżej, tym trudniejsi przeciwnicy", val: s => s.f.oppRank, fmt: s => fmt(s.f.oppRank, 1) },
    { key: "formAvg", label: "Małe<br>pkt", tip: "Średnia małych punktów w partiach z rywalami 140+ (obok: średnia rywali)", val: s => s.f.avg, fmt: s => `${fmt(s.f.avg, 1)}<small>${fmt(s.f.oppAvg, 1)}</small>` },
    { key: "last10", label: "Ostatnie<br>10", tip: "Wyniki 10 ostatnich partii z rywalami 140+ (zielony = wygrana, czerwony = porażka; od lewej najstarsza)", val: s => [...s.f.last10].filter(x => x === "W").length, fmt: s => dots2(s.f.last10) },
    { key: "avg12m", label: "Małe pkt<br>12 mies.", tip: "Średnia małych punktów we wszystkich partiach z ostatnich 12 miesięcy", val: s => s.p.avg12m, fmt: s => fmt(s.p.avg12m, 1), grpStart: true },
    { key: "careerGames", label: "Gry", tip: "Liczba partii turniejowych w karierze", val: s => s.cg, fmt: s => s.cg },
    { key: "careerPct", label: "%<br>wygr.", tip: "Procent wygranych w karierze", val: s => (s.c.w + s.c.d / 2) / s.cg, fmt: s => fmt(100 * (s.c.w + s.c.d / 2) / s.cg, 1) + "%" },
    { key: "h2h", label: "W–P", tip: "Łączny bilans partii z pozostałymi 15 finalistami (historia + eliminacje MP)", val: s => s.hw - s.hl, fmt: s => `${s.hw}–${s.hl}`, grpStart: true },
    { key: "h2hPct", label: "%", tip: "Procent wygranych z pozostałymi finalistami", val: s => (s.hw + s.hd / 2) / (s.hw + s.hl + s.hd), fmt: s => fmt(100 * (s.hw + s.hd / 2) / (s.hw + s.hl + s.hd), 1) + "%" },
  ];
  function renderPlayers() {
    const st = [...P.keys()].map(playerStats);
    const col = PL_COLS.find(c => c.key === plSort.key) || PL_COLS[1];
    st.sort((a, b) => {
      const x = col.val(a), y = col.val(b);
      return plSort.dir * (typeof x === "string" ? x.localeCompare(y, "pl") : x - y) || b.p.strength - a.p.strength;
    });
    const best = PL_COLS.map(c => c.key === "name" || c.key === "last10" ? null : Math.max(...st.map(s => c.val(s))));
    const grp = `<tr class="grp">${PL_GROUPS.map(([g, span], k) => `<th colspan="${span}" class="${k ? "gs" : ""}">${g}</th>`).join("")}</tr>`;
    const head = `<tr>${PL_COLS.map(c => { const on = c.key === plSort.key; return `<th class="sortable ${c.cls || ""}${c.grpStart ? " gs" : ""}${on ? " sorted" : ""}" data-key="${c.key}"><span class="th-in">${c.label}<span class="arr">${on ? (plSort.dir < 0 ? "▼" : "▲") : "↕"}</span></span></th>`; }).join("")}</tr>`;
    const body = st.map((s, r) => `<tr data-i="${s.i}">${PL_COLS.map((c, k) => `<td class="${c.cls || ""}${c.grpStart ? " gs" : ""}${c.key === plSort.key ? " sorted" : ""}${best[k] !== null && c.val(s) === best[k] ? " best" : ""}">${c.fmt(s)}</td>`).join("")}</tr>`).join("");
    $("#playersTbl").innerHTML = `<thead>${grp}${head}</thead><tbody>${body}</tbody>`;
    $("#playersTbl").querySelectorAll("th.sortable").forEach(th => {
      const c = PL_COLS.find(x => x.key === th.dataset.key);
      bindTip(th, () => `<div class="t">${c.label.replace("<br>", " ")}</div><div>${c.tip}</div><div class="muted" style="margin-top:4px">Kliknij, by posortować</div>`);
      th.addEventListener("click", () => {
        const k = th.dataset.key;
        plSort = plSort.key === k ? { key: k, dir: -plSort.dir } : { key: k, dir: k === "name" ? 1 : -1 };
        hideTip(); renderPlayers();
      });
    });
    $("#playersTbl").querySelectorAll("tbody tr").forEach(tr => bindTip(tr, () => {
      const s = playerStats(+tr.dataset.i), p = s.p, f = s.f;
      return `<div class="t">${esc(p.name)}</div>${tRow("Siła w modelu", fmt(p.strength))}${tRow("Ranking PFS", `${fmt(p.rank)} (${p.rankPlace}. miejsce)`)}${tRow("Forma vs 140+", `${f.w}–${f.l}–${f.d} · ${pct(formPct(f))}`)}${tRow("Okres formy", `${f.months} mies. (od ${f.cutoff})${f.elim ? ` + ${f.elim} z eliminacji` : ""}`)}${tRow("Ostatnie 10", f.last10)}${tRow("Vs finaliści", `${s.hw}–${s.hl}`)}${tRow("Szansa na tytuł", pct(SIM[s.i].title))}`;
    }));
  }




  // ---------- TYPER ----------
  // Prognoza przedturniejowa (zamrożona): kolejność wg szansy na tytuł bez żadnych wyników.
  const PRE = simulate(true);
  const FORECAST = Array.isArray(DATA.typerForecast) && DATA.typerForecast.length === N
    ? DATA.typerForecast.map(n => IDX[n])   // prognoza zamrożona w data.json (nie zmienia się po aktualizacji danych)
    : [...PRE].sort((a, b) => b.title - a.title || a.avgPlace - b.avgPlace).map(x => x.i);
  window.MP_FORECAST = FORECAST.map(i => P[i].name);
  const forecastPlace = Object.fromEntries(FORECAST.map((i, k) => [i, k + 1]));
  const BASE_PTS = [10, 6, 3, 1];           // trafione miejsce / o 1 / o 2 / o 3
  const BONUS_STEP = 0.10, BONUS_MAX = 1.5; // +10% za każde miejsce powyżej prognozy, max ×1.5
  const typerMult = (i, t) => Math.min(BONUS_MAX, 1 + BONUS_STEP * Math.max(0, forecastPlace[i] - t));
  function typerScore(order, finalOrder) {
    const actual = Object.fromEntries(finalOrder.map((i, k) => [i, k + 1]));
    let total = 0;
    const rows = order.map((i, k) => {
      const t = k + 1, d = Math.abs(t - actual[i]), base = BASE_PTS[d] || 0, mult = typerMult(i, t);
      const pts = Math.round(base * mult * 10) / 10; total += pts;
      return { i, t, a: actual[i], base, mult, pts };
    });
    return { total: Math.round(total * 10) / 10, rows };
  }
  let typer = { nick: "", order: FORECAST.slice() };
  try { const t = JSON.parse(safeGet("mp2026-typer") || "null"); if (t && Array.isArray(t.order) && t.order.length === N) typer = { nick: t.nick || "", order: t.order.map(n => IDX[n]).filter(i => i !== undefined) }; } catch (e) { }
  if (typer.order.length !== N) typer.order = FORECAST.slice();
  const saveTyperLocal = () => safeSet("mp2026-typer", JSON.stringify({ nick: typer.nick, order: typer.order.map(i => P[i].name) }));
  let dragFrom = null;

  function renderTyper() {
    const st = standings(), anyPlayed = matches.some(isDone), done = finished();
    const sc = anyPlayed ? typerScore(typer.order, st.map(x => x.i)) : null;
    const lock = typerLocked();
    $("#typerDeadline").innerHTML = lock ? `<b>Typowanie zamknięte</b> (21 listopada 2026, 11:00).` : `Typy można zapisywać i zmieniać do <b>soboty 21 listopada 2026, 11:00</b>. Typy wszystkich uczestników są jawne.`;
    $("#typerReset").disabled = lock;
    if (typeof renderTypy === "function") renderTypy();
    const byI = sc ? Object.fromEntries(sc.rows.map(r => [r.i, r])) : {};
    $("#typerNick").value = typer.nick;
    $("#typerList").innerHTML = typer.order.map((i, k) => {
      const t = k + 1, f = forecastPlace[i], mult = typerMult(i, t), r = byI[i];
      const diff = f - t;
      return `<li class="typer-row${lock ? " locked" : ""}" draggable="${!lock}" data-k="${k}">
        <span class="tpos">${t}</span>
        <span class="tname">${av(i, "sm")}${esc(P[i].name)}</span>
        <span class="tfc">prognoza: ${f}.</span>
        <span class="tmult ${mult > 1 ? "up" : ""}">${mult > 1 ? "×" + mult.toFixed(2) : "×1.00"}</span>
        ${sc ? `<span class="tpts">${r.a}. → <b>${r.pts.toFixed(1)}</b></span>` : ""}
        <span class="tbtns"><button type="button" class="tb" data-k="${k}" data-d="-1" ${k === 0 || lock ? "disabled" : ""} aria-label="W górę">▲</button><button type="button" class="tb" data-k="${k}" data-d="1" ${k === N - 1 || lock ? "disabled" : ""} aria-label="W dół">▼</button></span>
      </li>`;
    }).join("");
    const maxBonus = typer.order.reduce((t, i, k) => t + BASE_PTS[0] * typerMult(i, k + 1), 0);
    $("#typerSummary").innerHTML = (sc ? `<div class="typer-score"><span>${done ? "Twój wynik" : "Gdyby turniej skończył się teraz"}${matches.some(m => !m.score && whatIf[m.key]) ? " (z symulacją)" : ""}:</span> <b>${sc.total.toFixed(1)} pkt</b></div>` : "") +
      `<p class="hint">Maksimum dla Twojego typu (wszystkie miejsca trafione): <b>${maxBonus.toFixed(1)} pkt</b>. Typ zgodny z prognozą daje maksymalnie ${(BASE_PTS[0] * N).toFixed(1)} pkt.</p>`;
    $("#typerList").querySelectorAll(".tb").forEach(b => b.addEventListener("click", () => moveTyper(+b.dataset.k, +b.dataset.k + +b.dataset.d)));
    $("#typerList").querySelectorAll(".typer-row").forEach(li => {
      li.addEventListener("dragstart", e => { dragFrom = +li.dataset.k; li.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; });
      li.addEventListener("dragend", () => li.classList.remove("dragging"));
      li.addEventListener("dragover", e => { e.preventDefault(); li.classList.add("over"); });
      li.addEventListener("dragleave", () => li.classList.remove("over"));
      li.addEventListener("drop", e => { e.preventDefault(); li.classList.remove("over"); if (dragFrom !== null) moveTyper(dragFrom, +li.dataset.k); dragFrom = null; });
    });
  }
  function moveTyper(from, to) {
    if (typerLocked()) return;
    if (to < 0 || to >= N || from === to) return;
    const [x] = typer.order.splice(from, 1); typer.order.splice(to, 0, x);
    saveTyperLocal(); renderTyper();
  }
  $("#typerNick").addEventListener("input", e => { typer.nick = e.target.value.slice(0, 30); saveTyperLocal(); });
  $("#typerReset").addEventListener("click", () => { if (typerLocked()) return; typer.order = FORECAST.slice(); saveTyperLocal(); renderTyper(); });

  // ---------- Firebase: logowanie Google + wspólna baza typów ----------
  const DEADLINE = Date.UTC(2026, 10, 21, 10, 0); // 21-11-2026 11:00 czasu polskiego (musi zgadzać się z regułami Firestore)
  const typerLocked = () => Date.now() >= DEADLINE;
  const FB_CONFIG = {
    apiKey: "AIzaSyD0T8vRrOGx7LiS-J-0lHmmCR4rl92-rjM",
    authDomain: "mp-scrabble-2026.firebaseapp.com",
    projectId: "mp-scrabble-2026",
    storageBucket: "mp-scrabble-2026.firebasestorage.app",
    messagingSenderId: "1039874240900",
    appId: "1:1039874240900:web:a29d61174d752501ea2dd1",
  };
  const FBV = "13.3.0";
  let fb = null, fbUser = null, allTypy = null;
  const fbReady = (async () => {
    const [appM, authM, fsM] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FBV}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FBV}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${FBV}/firebase-firestore.js`),
    ]);
    const app = appM.initializeApp(FB_CONFIG);
    fb = { auth: authM.getAuth(app), db: fsM.getFirestore(app), authM, fsM };
    authM.onAuthStateChanged(fb.auth, async u => {
      fbUser = u;
      if (u) {
        try {
          const snap = await fsM.getDoc(fsM.doc(fb.db, "typy", u.uid));
          if (snap.exists()) {
            const d = snap.data();
            const ord = d.order.map(n => IDX[n]).filter(i => i !== undefined);
            if (ord.length === N) typer.order = ord;
            typer.nick = d.nick;
            $("#typerMsg").textContent = `Wczytano Twój zapisany typ (ostatnia zmiana: ${d.updatedAt ? d.updatedAt.toDate().toLocaleString("pl-PL") : "—"}).`;
          } else if (!typer.nick) typer.nick = (u.displayName || "").slice(0, 30);
          saveTyperLocal();
        } catch (e) { console.error(e); }
      }
      renderAuth(); renderTyper();
    });
    return fb;
  })().catch(e => { console.error(e); $("#typerAuth").innerHTML = `<span class="hint">Nie udało się połączyć z bazą typów – odśwież stronę.</span>`; });

  function renderAuth() {
    const el = $("#typerAuth");
    if (fbUser) {
      el.innerHTML = `<span class="who">Zalogowano: <b>${esc(fbUser.displayName || fbUser.email || "")}</b></span> <button id="fbOut" class="btn ghost" type="button">Wyloguj</button>`;
      $("#fbOut").addEventListener("click", () => fb.authM.signOut(fb.auth));
    } else {
      el.innerHTML = `<button id="fbIn" class="btn google-btn" type="button"><span class="g">G</span> Zaloguj przez Google</button><span class="hint">Logowanie jest potrzebne tylko do zapisania typu.</span>`;
      $("#fbIn").addEventListener("click", async () => {
        try { await fbReady; await fb.authM.signInWithPopup(fb.auth, new fb.authM.GoogleAuthProvider()); }
        catch (e) { $("#typerMsg").textContent = "Logowanie przerwane lub zablokowane (sprawdź, czy przeglądarka nie blokuje okienek)."; }
      });
    }
    $("#typerSave").disabled = typerLocked() || !fbUser;
    $("#typerSave").textContent = fbUser ? "Zapisz typ" : "Zaloguj się, by zapisać";
  }

  $("#typerSave").addEventListener("click", async () => {
    const nick = typer.nick.trim();
    if (!nick) { $("#typerMsg").textContent = "Wpisz nick."; return; }
    if (typerLocked()) { $("#typerMsg").textContent = "Typowanie jest już zamknięte."; return; }
    if (!fbUser) return;
    $("#typerSave").disabled = true; $("#typerMsg").textContent = "Zapisuję…";
    try {
      const { fsM, db } = fb;
      await fsM.setDoc(fsM.doc(db, "typy", fbUser.uid), { nick, order: typer.order.map(i => P[i].name), updatedAt: fsM.serverTimestamp() });
      saveTyperLocal();
      $("#typerMsg").innerHTML = `<b>Zapisano typ „${esc(nick)}”.</b> Możesz go zmieniać do ${new Date(DEADLINE).toLocaleString("pl-PL", { dateStyle: "long", timeStyle: "short" })}.`;
      loadAllTypy();
    } catch (e) {
      console.error(e);
      $("#typerMsg").textContent = typerLocked() ? "Typowanie jest już zamknięte." : "Nie udało się zapisać typu – spróbuj ponownie.";
    }
    $("#typerSave").disabled = typerLocked() || !fbUser;
  });

  async function loadAllTypy() {
    $("#typyList").innerHTML = `<p class="hint">Wczytuję typy…</p>`;
    try {
      await fbReady;
      const { fsM, db } = fb;
      const qs = await fsM.getDocs(fsM.collection(db, "typy"));
      allTypy = qs.docs.map(d => ({ uid: d.id, ...d.data() })).filter(t => Array.isArray(t.order));
      renderTypy();
    } catch (e) { console.error(e); $("#typyList").innerHTML = `<p class="hint">Nie udało się wczytać typów.</p>`; if ($("#favList")) $("#favList").innerHTML = `<p class="hint">Nie udało się wczytać typów.</p>`; }
  }
  function renderFavs() {
    const el = $("#favList"); if (!el) return;
    if (!allTypy) { el.innerHTML = `<p class="hint">Wczytuję typy…</p>`; return; }
    const n = allTypy.length;
    $("#favNote").textContent = `${n} ${n === 1 ? "typ" : n > 1 && n < 5 ? "typy" : "typów"} · typowanie do 21-11-2026 11:00`;
    if (!n) { el.innerHTML = `<p class="hint">Nikt jeszcze nie typował – <a href="#typer" class="go-typer">bądź pierwszy w zakładce Typer</a>.</p>`; bindGoTyper(); return; }
    const cnt = P.map((p, i) => ({ i, c: [0, 0, 0] }));
    allTypy.forEach(t => t.order.slice(0, 3).forEach((name, k) => { const i = IDX[name]; if (i !== undefined) cnt[i].c[k]++; }));
    const tot = x => x.c[0] + x.c[1] + x.c[2];
    const rows = cnt.filter(x => tot(x) > 0).sort((a, b) => b.c[0] - a.c[0] || tot(b) - tot(a) || b.c[1] - a.c[1]);
    const max = Math.max(...rows.map(x => x.c[0]), 1);
    el.innerHTML = `<table class="tbl fav-tbl"><thead><tr><th>Gracz</th><th>Na mistrza</th><th class="num">🥇 1.</th><th class="num">🥈 2.</th><th class="num">🥉 3.</th><th class="num">Na podium</th></tr></thead><tbody>${rows.map(x => `<tr><td class="pname-cell"><span class="pn">${av(x.i)}${esc(P[x.i].name)}</span></td><td class="fav-bar"><div class="bar-track"><div class="bar-fill gold" style="width:${x.c[0] / max * 100}%"></div></div></td><td class="num"><b>${x.c[0]}</b> <span class="muted">(${pct(x.c[0] / n, 0)})</span></td><td class="num">${x.c[1]}</td><td class="num">${x.c[2]}</td><td class="num"><b>${tot(x)}</b> <span class="muted">(${pct(tot(x) / n, 0)})</span></td></tr>`).join("")}</tbody></table>`;
  }
  function bindGoTyper() { document.querySelectorAll(".go-typer").forEach(a => { if (a.dataset.bound) return; a.dataset.bound = 1; a.addEventListener("click", e => { e.preventDefault(); document.querySelector('.tabs button[data-tab="typer"]').click(); scrollTo(0, 0); }); }); }

  let REAL_EXP = null;
  function renderTypy() {
    renderFavs();
    if (!allTypy) return;
    const st = standings(), anyPlayed = matches.some(isDone);
    const simOn = matches.some(m => !m.score && whatIf[m.key]);
    const fin = st.map(x => x.i);
    // kolejność „oczekiwana” wg modelu (średnie miejsce z Monte Carlo) – punkty prognozowane
    // liczona tylko z prawdziwych wyników (bez symulacji użytkownika) – raz na sesję
    if (!REAL_EXP) { const keep = whatIf; whatIf = {}; REAL_EXP = [...simulate()].sort((a, b) => a.avgPlace - b.avgPlace).map(x => x.i); whatIf = keep; }
    const expOrder = REAL_EXP;
    const rows = allTypy.map(t => {
      const order = t.order.map(n => IDX[n]).filter(i => i !== undefined);
      const ok = order.length === N;
      return { ...t, order, sc: anyPlayed && ok ? typerScore(order, fin).total : null, exp: ok ? typerScore(order, expOrder).total : null };
    });
    // po zamknięciu typowania: dwóch „graczy AI” do porównania
    if (typerLocked() && allTypy.length) {
      const avgPos = P.map((p, i) => ({ i, s: 0, n: 0 }));
      allTypy.forEach(t => t.order.forEach((n, k) => { const i = IDX[n]; if (i !== undefined) { avgPos[i].s += k + 1; avgPos[i].n++; } }));
      const avgOrder = avgPos.sort((a, b) => a.s / (a.n || 1) - b.s / (b.n || 1) || forecastPlace[a.i] - forecastPlace[b.i]).map(x => x.i);
      [["ai-avg", "🤖 Średnia typerów", avgOrder], ["ai-odds", "🤖 Według kursów", FORECAST.slice()]].forEach(([uid, nick, order]) =>
        rows.push({ uid, nick, order, ai: true, sc: anyPlayed ? typerScore(order, fin).total : null, exp: typerScore(order, expOrder).total }));
    }
    rows.sort((a, b) => (anyPlayed ? (b.sc ?? 0) - (a.sc ?? 0) : 0) || (b.exp ?? 0) - (a.exp ?? 0) || a.nick.localeCompare(b.nick, "pl"));
    const humans = rows.filter(r => !r.ai);
    let place = 0;
    const scLabel = !anyPlayed ? "" : simOn ? (finished() ? "wg symulacji" : "wg symulacji (częściowej)") : finished() ? "wynik końcowy" : "wg obecnej tabeli";
    $("#typyNote").textContent = `${humans.length} ${humans.length === 1 ? "typ" : humans.length > 1 && humans.length < 5 ? "typy" : "typów"}${rows.length > humans.length ? " + 2 AI" : ""}`;
    $("#typySimInfo").innerHTML = anyPlayed
      ? `Kolumna <b>${scLabel}</b> pokazuje punkty każdego typera przy ${simOn ? "Twojej aktualnej symulacji" : "obecnych wynikach"}. Kliknij „Symuluj cały turniej” jeszcze raz, by zobaczyć inny scenariusz.`
      : `Kliknij <b>🎲 Symuluj cały turniej</b>, a obok prognozy pojawią się punkty każdego typera w wylosowanym przebiegu turnieju.`;
    $("#typyList").innerHTML = rows.length ? `<table class="tbl typy-tbl"><thead><tr><th>#</th><th>Nick</th><th>Podium w typie</th><th class="num" title="Punkty, gdyby turniej skończył się w kolejności oczekiwanej przez model (średnie miejsce z symulacji Monte Carlo)">Prognoza</th>${anyPlayed ? `<th class="num sim-col" title="${scLabel}">${simOn ? "Symulacja" : finished() ? "Wynik" : "Teraz"}</th>` : ""}</tr></thead><tbody>${rows.map((r, k) => `
      <tr class="typ-row${fbUser && r.uid === fbUser.uid ? " mine" : ""}${r.ai ? " ai" : ""}" data-k="${k}" ${r.ai ? 'title="Typ porównawczy – nie bierze udziału w klasyfikacji"' : ""}><td class="pos">${r.ai ? "" : ++place}</td><td class="nick"><b>${esc(r.nick)}</b></td><td class="small">${r.order.slice(0, 3).map(i => esc(short(P[i].name))).join(", ")}</td><td class="num">${r.exp == null ? "–" : r.exp.toFixed(1)}</td>${anyPlayed ? `<td class="num sim-col"><b>${r.sc == null ? "–" : r.sc.toFixed(1)}</b></td>` : ""}</tr>
      <tr class="typ-detail" data-k="${k}" hidden><td></td><td colspan="${anyPlayed ? 4 : 3}"><ol class="typ-ol">${r.order.map(i => `<li>${esc(P[i].name)} <span class="muted">(prognoza ${forecastPlace[i]}.${anyPlayed ? `, teraz ${fin.indexOf(i) + 1}.` : ""})</span></li>`).join("")}</ol></td></tr>`).join("")}</tbody></table>` : `<p class="hint">Nikt jeszcze nie zapisał typu – bądź pierwszy!</p>`;
    $("#typyList").querySelectorAll(".typ-row").forEach(tr => tr.addEventListener("click", () => {
      const d = $(`#typyList .typ-detail[data-k="${tr.dataset.k}"]`); d.hidden = !d.hidden;
    }));
  }

  $("#typyRefresh").addEventListener("click", loadAllTypy);
  $("#favRefresh").addEventListener("click", loadAllTypy);
  bindGoTyper();
  loadAllTypy(); // typy potrzebne od razu: karta „Typowani na mistrza” na stronie głównej

  function renderFaq() {
    const ex = [IDX["Dominik Urbacki"], IDX["Joanna Juszczak"]];
    const nGames = H.flat().filter(Boolean).reduce((t, x) => t + x.w + x.d + x.l, 0) / 2;
    const qa = [
      ["Skąd pochodzą dane?", `Rankingi, bilanse head-to-head i statystyki graczy pochodzą z serwisu <a href="${DATA.source}" target="_blank" rel="noopener">scrabble.stats.org.pl</a> (turnieje rankingowe PFS), stan na ${DATA.updated}. Dodatkowo doliczamy partie z <a href="${DATA.elimSource}" target="_blank" rel="noopener">eliminacji XXXIII MP</a> (15 rund), których serwis statystyk jeszcze nie zawiera – zarówno do bilansów między finalistami, jak i do formy. Górka, Urbacki i Ulatowski nie grali w eliminacjach. Bilans H2H to wszystkie partie turniejowe rozegrane przez daną parę.`],
      ["Jak wygląda faza finałowa?", `16 graczy gra każdy z każdym po razie – 15 rund, po 8 partii w rundzie. O kolejności decydują duże punkty (wygrana = 1, remis = ½), a przy równej liczbie – różnica małych punktów.`],
      ["Czy rozstawienia są oficjalne?", `Nie. Do czasu publikacji oficjalnego terminarza pary w rundach są wygenerowane tablicami Bergera według rankingu PFS. Po ogłoszeniu oficjalnych par zostaną podmienione.`],
      ["Jak liczona jest szansa na wygraną w pojedynku?", `Najpierw siła gracza: średnia z trzech liczb – aktualnego rankingu PFS, rankingu z ostatnich 12 miesięcy i rankingu formy (patrz niżej). Różnica sił zamieniana jest na prawdopodobieństwo wzorem <code>p₀ = 1 / (1 + e^(−k·ΔS))</code>, gdzie <code>k = ${fmt(M.k, 4)}</code> dopasowano do ${nGames} historycznych partii rozegranych między finalistami. Różnica 10 punktów rankingu to ok. ${pct(1 / (1 + Math.exp(-M.k * 10)))} dla wyżej notowanego.`],
      ["Jak liczona jest forma?", `Bierzemy wszystkie partie turniejowe z ostatnich 12 miesięcy (od ${DATA.form.cutoff}) rozegrane z rywalami, którzy mieli w chwili gry ranking co najmniej ${DATA.form.minRank} – słabsze partie mało mówią o grze na poziomie finału. Jeśli gracz ma takich partii mniej niż ${DATA.form.minGames}, okno wydłużamy do 30 miesięcy (od ${DATA.form.extCutoff}); takich graczy oznaczamy gwiazdką *. Z bilansu i średniego rankingu rywali liczymy <b>ranking formy</b>: taki ranking, przy którym model przewidziałby dokładnie taki wynik. Przy małej liczbie partii ranking formy jest „ściągany” do aktualnego rankingu (waga ${DATA.form.prior} wirtualnych gier), żeby 10 udanych partii nie robiło z nikogo faworyta. Formę widać w zakładkach Tabela, Gracze i H2H.`],
      ["Czy bilans head-to-head ma znaczenie?", `Tak. Wynik z rankingu jest korygowany bilansem bezpośrednim: <code>p = (wygrane + remisy/2 + ${M.prior}·p₀) / (gry H2H + ${M.prior})</code>. Im więcej partii para rozegrała, tym mocniej bilans przesuwa prognozę. Przykład: ${esc(P[ex[0]].name)} vs ${esc(P[ex[1]].name)} – z samego rankingu ${pct(prior(ex[0], ex[1]))}, po uwzględnieniu H2H ${pct(prob(ex[0], ex[1]))}.`],
      ["Jak powstają kursy?", `Kurs dziesiętny = <code>1 / (p · (1 + marża))</code>. Marża na pojedynki wynosi ${pct(M.marginMatch, 0)}, na tytuł i podium ${pct(M.marginOutright, 0)}. Najniższy kurs to 1.01; kursy podajemy zawsze z dwoma miejscami po kropce. Kursy mają charakter wyłącznie rozrywkowy.`],
      ["Skąd szanse na tytuł?", `Z symulacji Monte Carlo: ${SIMS.toLocaleString("pl-PL")} razy rozgrywamy wszystkie nierozegrane mecze, losując różnicę małych punktów z rozkładu normalnego (odchylenie ${M.spreadSd} pkt) dopasowanego do szansy na wygraną. Liczymy, jak często każdy gracz kończy na 1. miejscu i na podium.`],
      ["Jak działają przyciski symulacji?", `„Symuluj następną rundę” losuje dokładne wyniki (z małymi punktami) partii kolejnej nierozegranej rundy – można tak przejść turniej runda po rundzie i obserwować, jak zmieniają się kursy. „Symuluj cały turniej” losuje od nowa wszystkie nierozegrane partie. Zwycięzca wynika z kursów (różnica małych punktów losowana z rozkładu normalnego dopasowanego do szansy na wygraną), a suma punktów w partii – ze średnich obu graczy z ostatnich 12 miesięcy. Każde kliknięcie daje inny przebieg. Gdy wszystkie partie mają wynik, kolumny z szansami i kursami na tytuł są puste, a zamiast nich pokazujemy podium.`],
      ["Co robi kliknięcie nazwiska w zakładce Mecze?", `Kliknięcie nazwiska w nierozegranym meczu przyjmuje, że ten gracz wygrał (bez dokładnego wyniku). Tabela, forma i szanse na tytuł przeliczają się od razu. Symulacja zapisuje się tylko w Twojej przeglądarce i nie wpływa na to, co widzą inni. Przycisk „Wyczyść symulację” przywraca stan rzeczywisty.`],
      ["Jak działa Typer?", `W zakładce Typer ustawiasz kolejność końcową wszystkich 16 graczy (przeciągając lub strzałkami ▲▼). Za każdego gracza dostajesz punkty zależnie od tego, jak blisko jego faktycznego miejsca trafiłeś: dokładnie – ${BASE_PTS[0]} pkt, o 1 miejsce – ${BASE_PTS[1]}, o 2 – ${BASE_PTS[2]}, o 3 – ${BASE_PTS[3]}, dalej – 0. W liście „Typy uczestników” kolumna Prognoza pokazuje punkty przy kolejności oczekiwanej przez model, a po kliknięciu „Symuluj cały turniej” – punkty każdego typera w wylosowanym przebiegu.`],
      ["Jak zapisać typ i do kiedy?", `W zakładce Typer zaloguj się kontem Google, wpisz nick, ustaw kolejność i kliknij „Zapisz typ”. Każde konto ma jeden typ, który możesz zmieniać do soboty 21 listopada 2026, 11:00 – potem zapis blokuje serwer. Typy wszystkich uczestników są jawne (lista w zakładce Typer), ale nikt nie może zmienić cudzego typu. Zapisujemy tylko nick i kolejność – bez adresu e-mail.`],
      ["Co daje typowanie wbrew kursom?", `Każde miejsce, o które ustawisz gracza wyżej niż przedturniejowa prognoza (kolejność wg kursu na tytuł), zwiększa punkty za niego o ${Math.round(BONUS_STEP * 100)}% – maksymalnie ×${BONUS_MAX.toFixed(2)}. Mnożnik działa tylko wtedy, gdy za gracza zdobywasz punkty, więc odważny typ opłaca się tylko, jeśli jest trafiony. Ustawienie gracza niżej niż prognoza nie ma mnożnika.`],
      ["Jak często aktualizowane są wyniki?", `Wyniki są wpisywane w trakcie turnieju; po każdej aktualizacji strona przelicza tabelę, kursy i szanse automatycznie. Odśwież stronę, aby zobaczyć najnowszy stan.`],
    ];
    $("#faq").innerHTML = qa.map(([q, a], k) => `<details${k < 2 ? " open" : ""}><summary>${q}</summary><p>${a}</p></details>`).join("");
    $("#footer").innerHTML = `Dane: <a href="${DATA.source}" target="_blank" rel="noopener">scrabble.stats.org.pl</a> · stan na ${DATA.updated} · kursy wyłącznie rozrywkowe`;
  }


  // ---------- Losowa ciekawostka ----------
  const b = t => `<b>${esc(t)}</b>`;
  const FACTS_FIXED = [
    // od autora
    `Mistrzostw w tym roku nie wygra ${b("Michał Alabrudziński")}.`,
    `Mistrzostw w tym roku nie wygra ${b("Dariusz Kosz")}.`,
    `Mistrzostw w tym roku nie wygra i nigdy wcześniej nie wygrał ${b("Kobrem")}.`,
    `${b("Justynie")} zabrakło niewiele, ale przynajmniej zajmie się dziećmi w czasie finałów.`,
    `Prawdopodobnie żaden finalista nie ma urodzin w czasie finałów (ale tego nie sprawdzałem).`,
    `Gdyby sędzia turnieju dał każdemu uczestnikowi jednego ze swoich kotów, to i tak zostałoby mu jeszcze 12.`,
    `Obrońcą tytułu jest dwukrotny zwycięzca tych rozgrywek ${b("Jakub Szymczak")}.`,
    `Sześciu finalistów wygrało już MP: ${b("Skrobosz")} ×3, ${b("Morawski")} ×2, ${b("Szymczak")} ×2, ${b("Urbacki")} ×2, ${b("Górka")} ×2, ${b("Zegadło")} ×1.`,
    // poniższe liczą szansę na bieżąco z kursów (tylko prawdziwe wyniki, bez symulacji użytkownika)
    () => `Jeśli turniej wygra ${b("Juszczak")} lub ${b("Urbańska")}, to pierwszy raz w historii Mistrzem Polski zostanie kobieta. Szansa na to według kursów to ${pct(realTitle(["Joanna Juszczak", "Karolina Urbańska"]), 2)}.`,
    () => `W finale zagra czterech Warszawiaków (${b("Skrobosz")}, ${b("Zegadło")}, ${b("Rogala")}, ${b("Juszczak")}) – szansa, że gracz z miasta stołecznego sięgnie po tytuł, to ${pct(realTitle(["Mariusz Skrobosz", "Kacper Zegadło", "Marcin Rogala", "Joanna Juszczak"]), 0)}.`,
    // z danych
    `${b("Mariusz Skrobosz")} i ${b("Kamil Górka")} zagrali ze sobą aż 113 razy – bilans 57–56 dla Skrobosza. Najczęstszy pojedynek wśród finalistów.`,
    `${b("Kamil Górka")} wygrał 10 ostatnich partii z ${b("Joanną Juszczak")} (bilans 18–3).`,
    `${b("Kamil Górka")} zdobył przeciw ${b("Joannie Juszczak")} łącznie o 1947 małych punktów więcej – największa przewaga w historii par finalistów.`,
    `${b("Artur Irzyk")} przegrał wszystkie 7 partii z ${b("Mariuszem Skroboszem")} – Skrobosz zdobywał w nich średnio 453 punkty.`,
    `${b("Łukasz Bobowski")} wygrał wszystkie 6 partii z ${b("Karoliną Urbańską")}.`,
    `${b("Wojciech Zemło")} ani razu nie przegrał z ${b("Karoliną Urbańską")} – 5:0.`,
    `${b("Marcin Rogala")} wygrał wszystkie 4 partie z ${b("Dawidem Adamczykiem")}.`,
    `${b("Łukasz Bobowski")} i ${b("Artur Irzyk")} grali ze sobą 28 razy – idealny remis 14–14.`,
    `Remisowe bilanse: ${b("Bobowski")}–${b("Skrobosz")} 11–11 i ${b("Szymczak")}–${b("Górka")} 11–11.`,
    `${b("Sławomir Piotrowski")} i ${b("Dariusz Ulatowski")} to jedyna para finalistów, która nigdy nie zagrała ze sobą w turnieju rankingowym.`,
    `${b("Mariusz Skrobosz")} rozegrał 5742 partie turniejowe – najwięcej z finalistów i ponad pięć razy więcej niż ${b("Dawid Adamczyk")} (1112).`,
    `${b("Dominik Urbacki")} ma najwyższą średnią małych punktów w karierze spośród finalistów: 428.3 na partię.`,
    `${b("Dariusz Ulatowski")} ma najwyższy ranking z ostatnich 12 miesięcy spośród finalistów (184.12) – wyższy niż lider listy rankingowej ${b("Dominik Urbacki")} (183.38).`,
    `${b("Kacper Zegadło")} wygrał 9 z 10 ostatnich partii z rywalami z rankingiem 140+.`,
    `${b("Bartosz Morawski")} wygrał 7 ostatnich partii z rywalami z rankingiem 140+.`,
    `${b("Kamil Górka")} ma najlepszy bilans z rywalami 140+ w ostatnich 12 miesiącach: 107–36 (74.8%).`,
    `${b("Kamil Górka")} wygrał 6 ostatnich pojedynków z ${b("Dominikiem Urbackim")} i prowadzi w ich historii 29–21.`,
    `${b("Dariusz Ulatowski")} wygrał 5 ostatnich partii z ${b("Marcinem Rogalą")} (bilans 7–1).`,
    `${b("Dawid Adamczyk")} wygrał 5 ostatnich partii z ${b("Wojciechem Zemło")}.`,
    `${b("Przemysław Herdzina")} zdobywa przeciw ${b("Marcinowi Rogali")} średnio 460.7 punktu (w 3 partiach) – najwyższa średnia wśród par finalistów.`,
    `${b("Dominik Urbacki")} prowadzi z ${b("Marcinem Rogalą")} 14–5 i jest od niego lepszy o 1590 małych punktów.`,
    `${b("Wojciech Zemło")} wygrał z ${b("Jakubem Szymczakiem")} 18 z 24 partii.`,
    `${b("Bartosz Morawski")} i ${b("Kamil Górka")} zagrali 67 razy – Morawski prowadzi 38–28 przy 1 remisie.`,
    `${b("Joanna Juszczak")} po eliminacjach podniosła bilans z rywalami 140+ z 5–14 do 13–18.`,
  ];
  // ciekawostki generowane automatycznie z macierzy H2H (serie i komplety zwycięstw)
  // odmiana: narzędnik („z kim”) i rodzaj czasownika
  const INSTR = { "Kacper Zegadło": "Kacprem Zegadło", "Bartosz Morawski": "Bartoszem Morawskim", "Marcin Rogala": "Marcinem Rogalą", "Łukasz Bobowski": "Łukaszem Bobowskim", "Joanna Juszczak": "Joanną Juszczak", "Dawid Adamczyk": "Dawidem Adamczykiem", "Artur Irzyk": "Arturem Irzykiem", "Karolina Urbańska": "Karoliną Urbańską", "Jakub Szymczak": "Jakubem Szymczakiem", "Wojciech Zemło": "Wojciechem Zemło", "Mariusz Skrobosz": "Mariuszem Skroboszem", "Przemysław Herdzina": "Przemysławem Herdziną", "Sławomir Piotrowski": "Sławomirem Piotrowskim", "Kamil Górka": "Kamilem Górką", "Dominik Urbacki": "Dominikiem Urbackim", "Dariusz Ulatowski": "Dariuszem Ulatowskim" };
  const FEMALE = new Set(["Joanna Juszczak", "Karolina Urbańska"]);
  const instr = n => INSTR[n] || n;
  const wygral = n => FEMALE.has(n) ? "wygrała" : "wygrał";
  function autoFacts() {
    const out = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const x = H[i][j]; if (!x || i === j) continue;
      const s = parseInt(x.streak, 10), g = x.w + x.l + x.d;
      if (x.l === 0 && x.d === 0 && x.w >= 3) out.push(`${b(P[j].name)} nie ${wygral(P[j].name)} ani jednej z ${x.w} partii z ${b(instr(P[i].name))}.`);
      else if (s >= 4) out.push(`${b(P[j].name)} nie ${wygral(P[j].name)} z ${b(instr(P[i].name))} w ostatnich ${s} pojedynkach (bilans ogółem ${x.l}–${x.w}).`);
      if (i < j && g >= 10 && Math.abs(x.avg - x.oppAvg) < 3) out.push(`${b(P[i].name)} i ${b(P[j].name)} są niemal ${FEMALE.has(P[i].name) && FEMALE.has(P[j].name) ? "równe" : "równi"}: w ${g} partiach średnio ${fmt(x.avg, 1)} do ${fmt(x.oppAvg, 1)} punktu.`);
    }
    return out;
  }
  // szanse na tytuł liczone tylko z prawdziwych wyników (bez symulacji użytkownika)
  let REAL_SIM = null;
  function realTitle(names) {
    if (!REAL_SIM) { const keep = whatIf; whatIf = {}; REAL_SIM = simulate(); whatIf = keep; }
    return names.reduce((t, n) => t + REAL_SIM[IDX[n]].title, 0);
  }
  const FACTS = [...FACTS_FIXED, ...autoFacts()];
  let factOrder = [], factPos = 0, factTimer = null;
  function nextFact() {
    if (!factOrder.length || factPos >= factOrder.length) { factOrder = [...FACTS.keys()].sort(() => Math.random() - .5); factPos = 0; }
    const el = $("#factText"); if (!el) return;
    el.classList.remove("show"); void el.offsetWidth;
    const f = FACTS[factOrder[factPos++]];
    el.innerHTML = typeof f === "function" ? f() : f;
    el.classList.add("show");
    clearInterval(factTimer); factTimer = setInterval(nextFact, 15000);
  }
  if ($("#factNext")) { $("#factNext").addEventListener("click", nextFact); nextFact(); }

  // ---------- odświeżanie wyników na żywo (results.json aktualizuje automat z transmisji PFS) ----------
  const pairSig = res => res.rounds.map(r => r.matches.map(m => m.a + "|" + m.b).join(",")).join(";");
  async function refreshResults() {
    if (document.hidden) return;
    try {
      const fresh = await fetch("results.json?v=" + Date.now(), { cache: "no-store" }).then(r => r.json());
      if (JSON.stringify(fresh) === JSON.stringify(RES)) return;
      if (pairSig(fresh) !== pairSig(RES)) { whatIf = {}; safeSet("mp2026-whatif", "{}"); }   // zmieniły się pary – symulacja nieaktualna
      RES = fresh; loadMatches(); REAL_SIM = null; REAL_EXP = null;
      renderAll();
      const lu = $("#liveNote"); if (lu) lu.textContent = `Wyniki zaktualizowane ${new Date().toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}`;
    } catch (e) { console.warn("Nie udało się odświeżyć wyników", e); }
  }
  setInterval(refreshResults, 120000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshResults(); });

  renderAll();
})();
