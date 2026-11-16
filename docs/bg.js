/* Tło: „siódemki tygodnia” PFS układane z płytek – delikatnie pojawiają się i znikają w kratkach planszy. */
(async function () {
  "use strict";
  const host = document.getElementById("bgWords");
  if (!host) return;
  let WORDS = [];
  try { WORDS = await fetch("siodemki.json?v=1").then(r => r.json()); } catch (e) { return; }
  if (!WORDS.length) return;

  const VAL = { A: 1, Ą: 5, B: 3, C: 2, Ć: 6, D: 2, E: 1, Ę: 5, F: 5, G: 3, H: 3, I: 1, J: 3, K: 2, L: 2, Ł: 3, M: 2, N: 1, Ń: 7, O: 1, Ó: 5, P: 2, R: 1, S: 1, Ś: 5, T: 2, U: 3, W: 1, Y: 2, Z: 1, Ź: 9, Ż: 5 };
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pick = () => WORDS[Math.floor(Math.random() * WORDS.length)];

  let cell, cols, rows, slots, live = [];
  function layout() {
    const w = innerWidth, h = innerHeight;
    cell = w < 700 ? 17 : 24;                      // kratka planszy = rozmiar płytki + odstęp
    cols = Math.floor(w / cell); rows = Math.floor(h / cell);
    slots = Math.max(4, Math.min(16, Math.round((w * h) / 95000)));
    host.style.setProperty("--cell", cell + "px");
  }

  function overlaps(r) { return live.some(o => r.x < o.x + o.w + 1 && o.x < r.x + r.w + 1 && r.y < o.y + o.h + 1 && o.y < r.y + r.h + 1); }

  // słowa pojawiają się tylko w widocznych miejscach tła – nie pod kartami, nagłówkiem i stopką
  function blockers() {
    return [...document.querySelectorAll(".card, .masthead, .tabbar, .authorbar")].map(e => e.getBoundingClientRect()).filter(b => b.width && b.height);
  }
  function visible(c, bl) {
    const x0 = c.x * cell - 4, y0 = c.y * cell - 4, x1 = (c.x + c.w) * cell + 4, y1 = (c.y + c.h) * cell + 4;
    return !bl.some(b => x0 < b.right && b.left < x1 && y0 < b.bottom && b.top < y1);
  }
  function spawn() {
    const bl = blockers();
    let r = null;
    for (let t = 0; t < 60; t++) {
      const vertical = Math.random() < 0.5;
      const w = vertical ? 1 : 7, h = vertical ? 7 : 1;
      const c = { x: Math.floor(Math.random() * (cols - w + 1)), y: Math.floor(Math.random() * (rows - h + 1)), w, h, vertical };
      if (c.x >= 0 && c.y >= 0 && !overlaps(c) && visible(c, bl)) { r = c; break; }
    }
    const vertical = r && r.vertical;
    if (!r) return;
    const word = pick();
    const el = document.createElement("div");
    el.className = "bgw" + (vertical ? " v" : "");
    el.style.left = r.x * cell + "px"; el.style.top = r.y * cell + "px";
    el.innerHTML = [...word].map((ch, k) => `<span class="bgt" style="--k:${k}">${ch}${VAL[ch] ? `<sub>${VAL[ch]}</sub>` : ""}</span>`).join("");
    host.appendChild(el);
    r.el = el; live.push(r);
    if (reduced) return;
    const life = 7000 + Math.random() * 5000;
    requestAnimationFrame(() => el.classList.add("in"));
    setTimeout(() => { el.classList.remove("in"); el.classList.add("out"); }, life);
    setTimeout(() => { el.remove(); live = live.filter(o => o !== r); }, life + 1600);
  }

  function reset() {
    host.innerHTML = ""; live = []; layout();
    const first = reduced ? slots : Math.ceil(slots / 2);
    for (let k = 0; k < first; k++) spawn();
    if (reduced) live.forEach(o => o.el.classList.add("in", "static"));
  }

  reset();
  let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(reset, 300); });
  if (reduced) return;
  setInterval(() => { if (!document.hidden && live.length < slots) spawn(); }, 900);
})();
