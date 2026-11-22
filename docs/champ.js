// Plansza mistrza + konfetti – pokazywana przy każdym wejściu na stronę
(function () {
  const box = document.getElementById("champ");
  if (!box) return;
  const cv = document.getElementById("confetti"), ctx = cv.getContext("2d");
  const COLORS = ["#f2c14e", "#e8a317", "#f8f8d3", "#3c687a", "#1f7a3f", "#c0392b", "#ffffff"];
  let parts = [], raf = 0, t0 = 0, W = 0, H = 0;
  const resize = () => { const d = window.devicePixelRatio || 1; W = innerWidth; H = innerHeight; cv.width = W * d; cv.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0); };
  const spawn = (n, burst) => { for (let i = 0; i < n; i++) parts.push({
    x: burst ? W / 2 + (Math.random() - .5) * 120 : Math.random() * W,
    y: burst ? H * .45 : -20 - Math.random() * H * .5,
    vx: burst ? (Math.random() - .5) * 16 : (Math.random() - .5) * 2,
    vy: burst ? -6 - Math.random() * 10 : 2 + Math.random() * 3,
    w: 6 + Math.random() * 7, h: 8 + Math.random() * 10,
    r: Math.random() * 6.28, vr: (Math.random() - .5) * .3,
    c: COLORS[Math.random() * COLORS.length | 0], f: Math.random() * 6.28 }); };
  const frame = t => {
    if (!t0) t0 = t;
    const el = t - t0;
    if (el < 6000 && Math.random() < .5) spawn(4, false);
    ctx.clearRect(0, 0, W, H);
    parts = parts.filter(p => p.y < H + 30);
    for (const p of parts) {
      p.vy += .18; p.vx *= .99; p.vy = Math.min(p.vy, 5.5);
      p.x += p.vx + Math.sin((p.f += .05)) * .8; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2 * Math.abs(Math.cos(p.f)), p.w, p.h * Math.abs(Math.cos(p.f)));
      ctx.restore();
    }
    if (parts.length || el < 6000) raf = requestAnimationFrame(frame);
  };
  const close = () => { box.classList.add("hide"); cancelAnimationFrame(raf); setTimeout(() => box.remove(), 400); document.body.classList.remove("champ-open"); };
  resize(); addEventListener("resize", resize);
  document.body.classList.add("champ-open");
  spawn(180, true);
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) raf = requestAnimationFrame(frame);
  box.querySelector(".champ-x").onclick = close;
  box.querySelector(".champ-go").onclick = close;
  box.addEventListener("click", e => { if (e.target === box || e.target === cv) close(); });
  addEventListener("keydown", e => { if (e.key === "Escape") close(); });
})();
