/* MP w Scrabble 2026 – dashboard fazy finałowej */
(async function () {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = (p, d = 1) => (p * 100).toFixed(d).replace(".", ",") + "%";
  const fmt = (x, d = 2) => Number(x).toFixed(d).replace(".", ",");
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
  const [DATA, RES] = await Promise.all([
    fetch("data.json" + bust).then(r => r.json()),
    fetch("results.json" + bust).then(r => r.json()),
  ]);
  const P = DATA.players;
  const N = P.length;
  const IDX = Object.fromEntries(P.map((p, i) => [p.name, i]));
  const M = DATA.model;
  const H = DATA.h2h;

  const matches = [];
  RES.rounds.forEach(r => r.matches.forEach((m, k) => matches.push({
    round: r.round, key: r.round + ":" + k, a: IDX[m.a], b: IDX[m.b], score: m.score,
  })));
  matches.forEach(m => { if (m.a === undefined || m.b === undefined) console.error("Nieznany gracz w results.json", m); });

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
  const fmtOdds = o => o == null ? "—" : o >= 100 ? Math.round(o).toString() : fmt(o, 2);

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
      } else if (whatIf[m.key]) {
        const winA = whatIf[m.key] === "a";
        A.played++; B.played++;
        if (winA) { A.w++; B.l++; A.form.push("hw"); B.form.push("hl"); } else { B.w++; A.l++; A.form.push("hl"); B.form.push("hw"); }
      }
    }
    s.forEach(x => { x.pts = x.w + x.d / 2; x.spread = x.pf - x.pa; });
    return s.sort((x, y) => y.pts - x.pts || y.spread - x.spread || P[y.i].rank - P[x.i].rank);
  }

  // ---------- Monte Carlo ----------
  const SIMS = 20000;
  function simulate() {
    seed = 20261116; // stałe ziarno: te same kursy przy każdym odświeżeniu
    const base = new Float64Array(N), baseSpread = new Float64Array(N);
    const open = [];
    for (const m of matches) {
      if (m.score) {
        const [x, y] = m.score;
        base[m.a] += x > y ? 1 : x === y ? .5 : 0; base[m.b] += y > x ? 1 : x === y ? .5 : 0;
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
    renderKpis(); renderStandings(); renderTitle(); renderMatches(); renderMatrix(); renderPair(); renderPlayers(); renderFaq();
  }

  function renderKpis() {
    const played = matches.filter(m => m.score).length;
    const sims = Object.keys(whatIf).length;
    const st = standings();
    const fav = [...SIM].sort((a, b) => b.title - a.title)[0];
    const roundsDone = RES.rounds.filter(r => r.matches.every(m => m.score)).length;
    const leader = st[0];
    $("#kpis").innerHTML = [
      ["Rozegrane mecze", `${played} / ${matches.length}`, `ukończone rundy: ${roundsDone} / ${RES.rounds.length}` + (sims ? ` · symulowane: ${sims}` : "")],
      ["Lider", played || sims ? esc(short(P[leader.i].name)) : "—", played || sims ? `${fmt(leader.pts, 1)} pkt · różnica ${leader.spread > 0 ? "+" : ""}${leader.spread}` : "turniej jeszcze się nie zaczął"],
      ["Faworyt do tytułu", esc(short(P[fav.i].name)), `szansa ${pct(fav.title)} · kurs ${fmtOdds(odds(fav.title, M.marginOutright))}`],
      ["Najwyższy ranking PFS", esc(short(P.reduce((a, b) => a.rank > b.rank ? a : b).name)), fmt(Math.max(...P.map(p => p.rank)), 2)],
    ].map(([l, v, s]) => `<div class="kpi"><div class="label">${l}</div><div class="value">${v}</div><div class="sub">${s}</div></div>`).join("");
  }

  function renderStandings() {
    const st = standings();
    const simBy = Object.fromEntries(SIM.map(s => [s.i, s]));
    $("#tiebreakNote").textContent = "Kolejność: duże punkty → różnica małych punktów";
    const rows = st.map((s, k) => {
      const p = P[s.i], sm = simBy[s.i];
      const form = s.form.slice(-5).map(f => f === "w" ? '<span class="form-dot w" title="wygrana"></span>' : f === "l" ? '<span class="form-dot l" title="porażka"></span>' : f === "hw" ? '<span class="form-dot w h" title="wygrana (symulacja)"></span>' : f === "hl" ? '<span class="form-dot l h" title="porażka (symulacja)"></span>' : '<span class="form-dot" title="remis" style="background:var(--text-muted)"></span>').join("");
      return `<tr data-i="${s.i}"><td class="pos">${k + 1}</td><td>${esc(p.name)}</td><td class="num">${s.played}</td><td class="num"><b>${fmt(s.pts, 1).replace(",0", "")}</b></td><td class="num">${s.pf || "–"}</td><td class="num">${s.spread > 0 ? "+" : ""}${s.spread}</td><td>${form}</td><td class="num">${pct(sm.title)}</td><td class="num">${fmtOdds(odds(sm.title, M.marginOutright))}</td><td class="num">${pct(sm.podium, 0)}</td></tr>`;
    }).join("");
    $("#standings").innerHTML = `<thead><tr><th>#</th><th>Gracz</th><th class="num">M</th><th class="num">Pkt</th><th class="num">Małe</th><th class="num">+/−</th><th>Forma</th><th class="num">Tytuł</th><th class="num">Kurs</th><th class="num">Podium</th></tr></thead><tbody>${rows}</tbody>`;
    $("#standings").querySelectorAll("tbody tr").forEach(tr => bindTip(tr, () => {
      const i = +tr.dataset.i, sm = SIM.find(s => s.i === i), p = P[i];
      return `<div class="t">${esc(p.name)}</div>${tRow("Ranking PFS", fmt(p.rank) + ` (${p.rankPlace}.)`)}${tRow("Szansa na tytuł", pct(sm.title))}${tRow("Szansa na podium", pct(sm.podium))}${tRow("Średnie miejsce (sym.)", fmt(sm.avgPlace, 1))}`;
    }));
  }

  function renderTitle() {
    const s = [...SIM].sort((a, b) => b.title - a.title);
    const max = Math.max(...s.map(x => x.title), 0.0001);
    $("#simNote").textContent = `symulacja Monte Carlo, ${SIMS.toLocaleString("pl-PL")} przebiegów`;
    $("#titleChart").innerHTML = s.map(x => `<div class="bar-row" data-i="${x.i}"><span class="name">${esc(P[x.i].name)}</span><div class="bar-track"><div class="bar-fill" style="width:${(x.title / max) * 100}%"></div></div><span class="val"><b>${pct(x.title)}</b> · ${fmtOdds(odds(x.title, M.marginOutright))}</span></div>`).join("");
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
  $("#clearWhatIf").addEventListener("click", () => { whatIf = {}; safeSet("mp2026-whatif", "{}"); renderAll(); });

  function h2hStr(i, j) { const x = H[i][j]; return x ? `${x.w}–${x.l}${x.d ? ` (${x.d} rem.)` : ""}` : "brak gier"; }

  function renderMatches() {
    const r = roundSel.value, pf = playerFilter.value;
    const list = matches.filter(m => (!r || m.round == r) && (pf === "" || m.a == pf || m.b == pf));
    const byRound = {};
    list.forEach(m => (byRound[m.round] = byRound[m.round] || []).push(m));
    $("#matches").innerHTML = Object.entries(byRound).map(([rd, ms]) => `<div class="round"><h3 class="tiles tiles-sm" aria-label="Runda ${rd}">${tilesHTML("RUNDA " + rd)}</h3><div class="round-grid">${ms.map(matchCard).join("")}</div></div>`).join("") || `<p class="muted">Brak meczów.</p>`;
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
    const side = (i, p, s, sideKey) => {
      const win = played ? (sideKey === "a" ? m.score[0] > m.score[1] : m.score[1] > m.score[0]) : sim === sideKey;
      const right = played ? `<span class="score">${m.score[sideKey === "a" ? 0 : 1]}</span>` : `<span class="odds">${fmtOdds(odds(p, M.marginMatch))}</span>`;
      return `<div class="side"><button class="pname ${win ? "win" : ""} ${!played && sim === sideKey ? "sim" : ""}" data-key="${m.key}" data-side="${sideKey}" ${played ? "disabled" : ""} title="${played ? "" : "Kliknij, by zasymulować wygraną"}">${esc(P[i].name)}</button><span class="pct">${pct(p, 0)}</span>${right}</div>`;
    };
    return `<div class="match ${played ? "played" : ""}" data-key="${m.key}">${side(m.a, pa, 0, "a")}<div class="split"><span class="a" style="width:${pa * 100}%"></span><span class="b" style="width:${pb * 100}%"></span></div>${side(m.b, pb, 0, "b")}<div class="meta"><span>H2H: ${h2hStr(m.a, m.b)}</span><span>${played ? "rozegrany" : "kurs dziesiętny"}</span></div></div>`;
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
    const head = `<thead><tr><th></th>${ord.map(j => `<th title="${esc(P[j].name)}">${esc(short(P[j].name))}</th>`).join("")}</tr></thead>`;
    const body = ord.map(i => `<tr><th>${esc(short(P[i].name))}</th>${ord.map(j => {
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
    $("#h2hMatrix").querySelectorAll("td[data-i]").forEach(td => {
      const i = +td.dataset.i, j = +td.dataset.j;
      bindTip(td, () => {
        const x = H[i][j];
        return `<div class="t">${esc(P[i].name)} vs ${esc(P[j].name)}</div>${tRow("Bilans", h2hStr(i, j))}${x ? tRow("% wygranych", pct((x.w + x.d / 2) / (x.w + x.d + x.l))) + tRow("Śr. małe pkt", `${fmt(x.avg, 1)} : ${fmt(x.oppAvg, 1)}`) + tRow("Suma różnic", (x.diff > 0 ? "+" : "") + x.diff) + tRow("Passa", x.streak) : ""}${tRow("Szansa w finale", pct(prob(i, j)))}${tRow("Kurs", fmtOdds(odds(prob(i, j), M.marginMatch)))}`;
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
        ${line(pct(pi), "szansa w finale", pct(1 - pi))}
        ${line("<b>" + fmtOdds(odds(pi, M.marginMatch)) + "</b>", "kurs", "<b>" + fmtOdds(odds(1 - pi, M.marginMatch)) + "</b>")}
        ${line(pct(prior(i, j)), "szansa z samego rankingu", pct(1 - prior(i, j)))}
        ${x ? line(fmt(x.avg, 1), "śr. małe pkt w H2H", fmt(x.oppAvg, 1)) : ""}
        ${x ? line((x.diff > 0 ? "+" : "") + x.diff, "suma różnic małych", (x.diff > 0 ? "−" : "+") + Math.abs(x.diff)) : ""}
        ${x ? line(x.streak, "passa", x.streak.startsWith("+") ? "−" + x.streak.slice(1) : x.streak.startsWith("-") ? "+" + x.streak.slice(1) : x.streak) : ""}
        ${x && x.d ? line(x.d, "remisy", x.d) : ""}
        ${line(fmt(a.rank), "ranking PFS", fmt(b.rank))}
        ${line(pct(a.winPct12m / 100, 1), "% wygr. (12 mies.)", pct(b.winPct12m / 100, 1))}
        ${line(fmt(a.avg12m, 1), "śr. małe (12 mies.)", fmt(b.avg12m, 1))}
      </div>
      <p class="muted small">${fm ? (fm.score ? `W finale: ${esc(short(P[fm.a].name))} ${fm.score[0]} : ${fm.score[1]} ${esc(short(P[fm.b].name))} (runda ${fm.round}).` : `Mecz w finale: runda ${fm.round}.`) : ""}</p>`;
  }

  function renderPlayers() {
    const ord = [...P.keys()].sort((a, b) => P[b].rank - P[a].rank);
    const rows = ord.map(i => {
      const p = P[i], c = p.career, cg = c.w + c.d + c.l;
      let hw = 0, hl = 0, hd = 0;
      for (let j = 0; j < N; j++) if (H[i][j]) { hw += H[i][j].w; hl += H[i][j].l; hd += H[i][j].d; }
      return `<tr><td><a href="https://scrabble.stats.org.pl/zindex.php?p=${p.id}" target="_blank" rel="noopener">${esc(p.name)}</a></td><td class="num">${fmt(p.rank)}</td><td class="num">${p.rankPlace}</td><td class="num">${fmt(p.rank12m)}</td><td class="num">${p.games12m}</td><td class="num">${fmt(p.winPct12m, 1)}%</td><td class="num">${fmt(p.avg12m, 1)}</td><td class="num">${fmt(p.oppAvg12m, 1)}</td><td class="num">${cg}</td><td class="num">${fmt(100 * (c.w + c.d / 2) / cg, 1)}%</td><td class="num">${hw}–${hl}</td><td class="num">${fmt(100 * (hw + hd / 2) / (hw + hl + hd), 1)}%</td></tr>`;
    }).join("");
    $("#playersTbl").innerHTML = `<thead><tr><th>Gracz</th><th class="num">Ranking</th><th class="num">Miejsce</th><th class="num">Rank. 12 mies.</th><th class="num">Gry 12 mies.</th><th class="num">% wygr. 12 mies.</th><th class="num">Śr. małe</th><th class="num">Śr. rywala</th><th class="num">Gry (kariera)</th><th class="num">% wygr. (kariera)</th><th class="num">Vs finaliści</th><th class="num">% vs finaliści</th></tr></thead><tbody>${rows}</tbody>`;
  }

  function renderFaq() {
    const ex = [IDX["Dominik Urbacki"], IDX["Joanna Juszczak"]];
    const nGames = H.flat().filter(Boolean).reduce((t, x) => t + x.w + x.d + x.l, 0) / 2;
    const qa = [
      ["Skąd pochodzą dane?", `Rankingi, bilanse head-to-head i statystyki graczy pochodzą z serwisu <a href="${DATA.source}" target="_blank" rel="noopener">scrabble.stats.org.pl</a> (turnieje rankingowe PFS), stan na ${DATA.updated}. Bilans H2H to wszystkie partie turniejowe rozegrane przez daną parę.`],
      ["Jak wygląda faza finałowa?", `16 graczy gra każdy z każdym po razie – 15 rund, po 8 partii w rundzie. O kolejności decydują duże punkty (wygrana = 1, remis = ½), a przy równej liczbie – różnica małych punktów.`],
      ["Czy rozstawienia są oficjalne?", `Nie. Do czasu publikacji oficjalnego terminarza pary w rundach są wygenerowane tablicami Bergera według rankingu PFS. Po ogłoszeniu oficjalnych par zostaną podmienione.`],
      ["Jak liczona jest szansa na wygraną w pojedynku?", `Najpierw siła gracza: średnia z aktualnego rankingu PFS i rankingu z ostatnich 12 miesięcy. Różnica sił zamieniana jest na prawdopodobieństwo wzorem <code>p₀ = 1 / (1 + e^(−k·ΔS))</code>, gdzie <code>k = ${fmt(M.k, 4)}</code> dopasowano do ${nGames} historycznych partii rozegranych między finalistami. Różnica 10 punktów rankingu to ok. ${pct(1 / (1 + Math.exp(-M.k * 10)))} dla wyżej notowanego.`],
      ["Czy bilans head-to-head ma znaczenie?", `Tak. Wynik z rankingu jest korygowany bilansem bezpośrednim: <code>p = (wygrane + remisy/2 + ${M.prior}·p₀) / (gry H2H + ${M.prior})</code>. Im więcej partii para rozegrała, tym mocniej bilans przesuwa prognozę. Przykład: ${esc(P[ex[0]].name)} vs ${esc(P[ex[1]].name)} – z samego rankingu ${pct(prior(ex[0], ex[1]))}, po uwzględnieniu H2H ${pct(prob(ex[0], ex[1]))}.`],
      ["Jak powstają kursy?", `Kurs dziesiętny = <code>1 / (p · (1 + marża))</code>. Marża na pojedynki wynosi ${pct(M.marginMatch, 0)}, na tytuł i podium ${pct(M.marginOutright, 0)}. Najniższy kurs to 1,01. Kursy mają charakter wyłącznie rozrywkowy.`],
      ["Skąd szanse na tytuł?", `Z symulacji Monte Carlo: ${SIMS.toLocaleString("pl-PL")} razy rozgrywamy wszystkie nierozegrane mecze, losując różnicę małych punktów z rozkładu normalnego (odchylenie ${M.spreadSd} pkt) dopasowanego do szansy na wygraną. Liczymy, jak często każdy gracz kończy na 1. miejscu i na podium.`],
      ["Co robi symulacja w zakładce Rozstawienia?", `Kliknięcie nazwiska w nierozegranym meczu przyjmuje, że ten gracz wygrał. Tabela, forma i szanse na tytuł przeliczają się od razu. Symulacja zapisuje się tylko w Twojej przeglądarce i nie wpływa na to, co widzą inni. Przycisk „Wyczyść symulację” przywraca stan rzeczywisty.`],
      ["Jak często aktualizowane są wyniki?", `Wyniki są wpisywane w trakcie turnieju; po każdej aktualizacji strona przelicza tabelę, kursy i szanse automatycznie. Odśwież stronę, aby zobaczyć najnowszy stan.`],
    ];
    $("#faq").innerHTML = qa.map(([q, a], k) => `<details${k < 2 ? " open" : ""}><summary>${q}</summary><p>${a}</p></details>`).join("");
    $("#footer").innerHTML = `Dane: <a href="${DATA.source}" target="_blank" rel="noopener">scrabble.stats.org.pl</a> · stan na ${DATA.updated} · kursy wyłącznie rozrywkowe`;
  }

  renderAll();
})();
