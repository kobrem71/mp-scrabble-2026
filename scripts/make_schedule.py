"""Generuje docs/results.json – terminarz każdy z każdym (tablice Bergera, 15 rund).

Numery startowe wg rankingu PFS. Jeśli znasz oficjalne pary, po prostu
nadpisz `rounds` w results.json. Wynik wpisuje się jako "score": [pkt_A, pkt_B].
Nie nadpisuje istniejącego pliku bez --force.
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
OUT = os.path.join(os.path.dirname(__file__), "..", "docs", "results.json")
data = json.load(open(os.path.join(os.path.dirname(__file__), "..", "docs", "data.json"), encoding="utf-8"))

if os.path.exists(OUT) and "--force" not in sys.argv:
    sys.exit("results.json już istnieje (użyj --force, żeby nadpisać)")

seeded = sorted(data["players"], key=lambda p: -p["rank"])
names = [p["name"] for p in seeded]
n = len(names)
idx = list(range(n))
rounds = []
for r in range(n - 1):
    pairs = []
    for k in range(n // 2):
        a, b = idx[k], idx[n - 1 - k]
        if k == 0 and r % 2 == 1:
            a, b = b, a
        pairs.append({"a": names[a], "b": names[b], "score": None})
    rounds.append({"round": r + 1, "matches": pairs})
    idx = [idx[0]] + [idx[-1]] + idx[1:-1]

json.dump({"note": "Wpisz wynik jako score: [małe pkt gracza a, małe pkt gracza b]",
           "tiebreak": "spread", "rounds": rounds},
          open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("zapisano", os.path.abspath(OUT))
