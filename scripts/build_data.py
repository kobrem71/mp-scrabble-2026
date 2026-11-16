"""Buduje docs/data.json z surowych danych + kalibruje model kursów.

Model:
  1. Siła gracza S = średnia z: rankingu aktualnego, rankingu z ostatnich 12 mies. (PFS)
     oraz „rankingu formy” – rankingu osiągniętego w ostatnich 12 mies. w partiach
     z rywalami z rankingiem >= 140 (ściągniętego do rankingu przy małej liczbie gier).
  2. Prior: p0 = 1 / (1 + exp(-k * (R_i - R_j))); k dopasowane metodą największej
     wiarygodności do wszystkich historycznych pojedynków między finalistami.
  3. Korekta H2H (shrinkage bayesowski): p = (wygrane + remisy/2 + M * p0) / (gry + M).
     M = waga prioru w „wirtualnych grach”.
"""
import json, math, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from raw_data import PLAYERS, SUMMARY, CAREER, H2H, STREAK, FORM12, FORM_CUTOFF, FORM_MIN_RANK, FORM30, FORM_MIN_GAMES, FORM_EXT_CUTOFF, ELIM_H2H, ELIM_FORM, ELIM_SOURCE

M_PRIOR = 20
FORM_PRIOR = 30   # ile „wirtualnych gier” na poziomie aktualnego rankingu dokładamy do formy
OUT = os.path.join(os.path.dirname(__file__), "..", "docs", "data.json")

names = [p[0] for p in PLAYERS]
n = len(names)

players = []
for name, pid in PLAYERS:
    s = SUMMARY[name].split("|")
    c = CAREER[name]
    r_now, r_12 = float(s[0]), float(s[2])
    players.append({
        "name": name, "id": pid,
        "rank": r_now, "rankPlace": int(s[1]),
        "rank12m": r_12, "rank12mPlace": int(s[3]),
        "strength": round((r_now + r_12) / 2, 2),
        "games": int(s[4]), "games12m": int(s[5]), "wins12m": int(s[6]),
        "winPct12m": float(s[7].rstrip("%")),
        "avg12m": float(s[8]), "oppAvg12m": float(s[9]),
        "career": {"w": c[0], "d": c[1], "l": c[2], "avg": c[3], "oppAvg": c[4]},
    })

def parse_form(raw):
    f = raw.split("|")
    return {"n": int(f[0]), "w": int(f[1]), "d": int(f[2]), "l": int(f[3]),
            "oppRank": float(f[4]), "avg": float(f[5]), "oppAvg": float(f[6]), "last10": f[7]}

def add_elim(fm, name):
    """Dolicza partie z eliminacji MP (rywale >= 140) – najnowsze, więc idą na koniec ostatnich 10."""
    if name not in ELIM_FORM:
        fm["elim"] = 0
        return fm
    e = ELIM_FORM[name].split("|")
    en, ew, ed, el = int(e[1]), int(e[2]), int(e[3]), int(e[4])
    ers, epf, epa, seq = float(e[5]), int(e[6]), int(e[7]), e[8]
    n0, n1 = fm["n"], fm["n"] + en
    fm["oppRank"] = round((fm["oppRank"] * n0 + ers) / n1, 2)
    fm["avg"] = round((fm["avg"] * n0 + epf) / n1, 1)
    fm["oppAvg"] = round((fm["oppAvg"] * n0 + epa) / n1, 1)
    fm.update(n=n1, w=fm["w"] + ew, d=fm["d"] + ed, l=fm["l"] + el, last10=(fm["last10"] + seq)[-10:], elim=en)
    return fm

for p in players:
    months, cutoff = 12, FORM_CUTOFF
    fm = add_elim(parse_form(FORM12[p["name"]]), p["name"])
    if fm["n"] < FORM_MIN_GAMES and p["name"] in FORM30:
        months, cutoff = 30, FORM_EXT_CUTOFF
        fm = add_elim(parse_form(FORM30[p["name"]]), p["name"])
    fm.update(months=months, cutoff=cutoff)
    p["form"] = fm

def form_rating(p, k):
    """Ranking osiągnięty: F takie, że n·σ(k·(F − śr.rank rywali)) = wynik (+1 W i +1 P dla stabilności),
    potem ściągnięty do aktualnego rankingu wagą FORM_PRIOR gier."""
    f = p["form"]
    score = (f["w"] + f["d"] / 2 + 1) / (f["n"] + 2)
    raw = f["oppRank"] + math.log(score / (1 - score)) / k
    return raw, (f["n"] * raw + FORM_PRIOR * p["rank"]) / (f["n"] + FORM_PRIOR)

streak_rows = STREAK.strip().split("\n")
h2h = [[None] * n for _ in range(n)]
for i in range(n):
    st = streak_rows[i].split(";")
    assert len(st) == n and len(H2H[i]) == n, (i, len(st), len(H2H[i]))
    for j in range(n):
        if not H2H[i][j]:
            continue
        w, d, l, diff = map(int, H2H[i][j].split(","))
        streak, avg, oavg = st[j].split("/")
        h2h[i][j] = {"w": w, "d": d, "l": l, "diff": diff, "streak": streak,
                     "avg": float(avg), "oppAvg": float(oavg)}

# kontrola symetrii danych ze statystyk (przed dodaniem eliminacji)
def check_sym():
    for i in range(n):
        for j in range(n):
            a, b = h2h[i][j], h2h[j][i]
            assert (a is None) == (b is None), (names[i], names[j])
            if a:
                assert (a["w"], a["d"], a["l"], a["diff"]) == (b["l"], b["d"], b["w"], -b["diff"]), (names[i], names[j])
check_sym()

# dolicz partie między finalistami z eliminacji MP (najnowsze – aktualizują passę)
def add_game(i, j, x, y):
    e = h2h[i][j]
    if e is None:
        e = h2h[i][j] = {"w": 0, "d": 0, "l": 0, "diff": 0, "streak": "0", "avg": 0.0, "oppAvg": 0.0}
    g = e["w"] + e["d"] + e["l"]
    e["avg"] = round((e["avg"] * g + x) / (g + 1), 1)
    e["oppAvg"] = round((e["oppAvg"] * g + y) / (g + 1), 1)
    e["diff"] += x - y
    s = int(e["streak"])
    if x > y:
        e["w"] += 1; s = s + 1 if s > 0 else 1
    elif x < y:
        e["l"] += 1; s = s - 1 if s < 0 else -1
    else:
        e["d"] += 1; s = 0
    e["streak"] = ("+" if s > 0 else "") + str(s)
    e.setdefault("elim", []).append([x, y])

for i, j, rnd, x, y in ELIM_H2H:
    add_game(i, j, x, y)
    add_game(j, i, y, x)

# kontrola symetrii po dodaniu
for i in range(n):
    for j in range(n):
        a, b = h2h[i][j], h2h[j][i]
        assert (a is None) == (b is None), (names[i], names[j])
        if a:
            assert (a["w"], a["d"], a["l"], a["diff"]) == (b["l"], b["d"], b["w"], -b["diff"]), (names[i], names[j])

# dopasowanie k (MLE) – iteracyjnie, bo ranking formy zależy od k
def loglik(k):
    ll = 0.0
    for i in range(n):
        for j in range(i + 1, n):
            x = h2h[i][j]
            if not x:
                continue
            p = 1 / (1 + math.exp(-k * (S[i] - S[j])))
            sw = x["w"] + x["d"] / 2
            sl = x["l"] + x["d"] / 2
            ll += sw * math.log(p) + sl * math.log(1 - p)
    return ll
best_k = 0.025
for _ in range(6):
    for p in players:
        raw, shr = form_rating(p, best_k)
        p["formRatingRaw"], p["formRating"] = round(raw, 2), round(shr, 2)
        p["strength"] = round((p["rank"] + p["rank12m"] + shr) / 3, 2)
    S = [p["strength"] for p in players]
    best_k = max((k / 10000 for k in range(1, 2000)), key=loglik)
for p in players:
    print(f'{p["name"]:22s} rank {p["rank"]:6.2f}  12m {p["rank12m"]:6.2f}  forma {p["formRatingRaw"]:6.1f} -> {p["formRating"]:6.1f}  siła {p["strength"]:6.2f}')
total_games = sum(h2h[i][j]["w"] + h2h[i][j]["d"] + h2h[i][j]["l"]
                  for i in range(n) for j in range(i + 1, n) if h2h[i][j])
print(f"k = {best_k:.4f}  (gier H2H między finalistami: {total_games})")

data = {
    "updated": "16-11-2026",
    "source": "https://scrabble.stats.org.pl/",
    "players": players,
    "h2h": h2h,
    "elimSource": ELIM_SOURCE,
    "form": {"cutoff": FORM_CUTOFF, "minRank": FORM_MIN_RANK, "prior": FORM_PRIOR,
             "minGames": FORM_MIN_GAMES, "extCutoff": FORM_EXT_CUTOFF},
    "model": {"k": best_k, "prior": M_PRIOR, "spreadSd": 100,
              "marginMatch": 0.06, "marginOutright": 0.15},
}
# zamrożona prognoza do Typera (bonusy liczone względem niej) – zachowaj z poprzedniego pliku
if os.path.exists(OUT):
    old = json.load(open(OUT, encoding="utf-8"))
    if "typerForecast" in old:
        data["typerForecast"] = old["typerForecast"]
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=1)
print("zapisano", os.path.abspath(OUT))
