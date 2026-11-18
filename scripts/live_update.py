"""Aktualizacja wyników na żywo z transmisji PFS (live/rounds.php) -> docs/results.json.

Uruchamiane przez GitHub Actions (.github/workflows/live.yml) co 10 minut w czasie finałów.

- Rundy opublikowane przez sędziego (rozstawienie / wyniki) zastępują nasze pary.
- Wynik partii trafia do "score" dopiero, gdy w transmisji jest kompletny wynik (dwie liczby, suma > 0).
- Rundy jeszcze nieopublikowane są wypełniane pozostałymi parami (każdy z każdym) i oznaczane
  "tentative": true – to tylko szacunek do symulacji, prawdziwe pary ustali sędzia.

Użycie:
  python scripts/live_update.py                  # pobiera z PFS (id z TOUR_ID lub 1400)
  python scripts/live_update.py --file dump.json # test na zapisanym JSON-ie
  python scripts/live_update.py --dry-run        # tylko wypisuje, nic nie zapisuje
"""
import argparse, json, os, sys, urllib.parse, urllib.request
from itertools import combinations

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
DATA = os.path.join(ROOT, "docs", "data.json")
RESULTS = os.path.join(ROOT, "docs", "results.json")
URL = "https://www.pfs.org.pl/live/rounds.php"
N_ROUNDS = 15


def fetch(tour_id):
    body = urllib.parse.urlencode({"id": tour_id}).encode()
    req = urllib.request.Request(URL, data=body, headers={"User-Agent": "mp-scrabble-2026-dashboard (GitHub Actions)"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def rows(section_json):
    out = []
    for sec in (section_json or {}).get("sections") or []:
        for g in sec.get("groups") or []:
            for row in g.get("rows") or []:
                out.append((row, bool(sec.get("live"))))
    return out


def full(p):
    return f"{(p or {}).get('name', '').strip()} {(p or {}).get('surname', '').strip()}".strip()


def parse(js, names):
    """Zwraca {runda: [(a, b, score|None)]} tylko dla par finalistów."""
    known = {}
    for rk, rd in (js.get("rounds") or {}).items():
        try:
            rnd = int(rk)
        except ValueError:
            continue
        pairs = {}
        for row, _live in rows(rd.get("rozJson")) + rows(rd.get("wynJson")):
            a, b = full(row.get("home")), full(row.get("guest"))
            if a not in names or b not in names:
                if a or b:
                    print(f"  pomijam (nie finaliści / inna pisownia): {a!r} – {b!r}", file=sys.stderr)
                continue
            key = frozenset((a, b))
            sc = row.get("score")
            ok = isinstance(sc, list) and len(sc) == 2 and all(isinstance(x, (int, float)) for x in sc) and sum(sc) > 0
            prev = pairs.get(key)
            if prev is None or (ok and prev[2] is None):
                pairs[key] = (a, b, [int(sc[0]), int(sc[1])] if ok else None)
        if pairs:
            known[rnd] = list(pairs.values())
    return known


def complete_rounds(names, fixed_rounds):
    """Rozkłada pozostałe pary na nieopublikowane rundy (doskonałe skojarzenia, backtracking)."""
    used = {frozenset((a, b)) for ms in fixed_rounds.values() for a, b, _ in ms}
    left = {frozenset(p) for p in combinations(names, 2)} - used
    todo = [r for r in range(1, N_ROUNDS + 1) if r not in fixed_rounds]
    sol = {}

    def matching(avail_pairs):
        """Wszystkie doskonałe skojarzenia 16 graczy z dostępnych par (generator)."""
        def rec(free, acc):
            if not free:
                yield list(acc); return
            p = min(free)
            for q in sorted(free - {p}):
                if frozenset((p, q)) in avail_pairs:
                    acc.append((p, q)); yield from rec(free - {p, q}, acc); acc.pop()
        yield from rec(frozenset(names), [])

    def solve(k, avail):
        if k == len(todo):
            return True
        for m in matching(avail):
            sol[todo[k]] = m
            if solve(k + 1, avail - {frozenset(x) for x in m}):
                return True
        return False

    if not solve(0, left):
        return None, left
    return sol, set()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tour", default=os.environ.get("TOUR_ID", "1400"))
    ap.add_argument("--file")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    names = [p["name"] for p in json.load(open(DATA, encoding="utf-8"))["players"]]
    old = json.load(open(RESULTS, encoding="utf-8"))
    js = json.load(open(args.file, encoding="utf-8")) if args.file else fetch(args.tour)
    known = parse(js, names)
    print(f"Transmisja: {len(known)} rund z parami finalistów; wyników: {sum(1 for ms in known.values() for m in ms if m[2])}")

    if not known:
        print("Brak danych z transmisji – results.json bez zmian.")
        return
    # runda opublikowana częściowo (mniej niż 8 par) – też traktujemy jako ustaloną
    tentative, rest = complete_rounds(names, known)
    rounds = []
    for r in range(1, N_ROUNDS + 1):
        if r in known:
            rounds.append({"round": r, "matches": [{"a": a, "b": b, "score": s} for a, b, s in known[r]]})
        elif tentative and r in tentative:
            rounds.append({"round": r, "tentative": True, "matches": [{"a": a, "b": b, "score": None} for a, b in tentative[r]]})
    if rest:
        print(f"UWAGA: nie udało się rozłożyć {len(rest)} par na rundy – zostawiam stare rundy szacunkowe.")
        rounds = [x for x in rounds if not x.get("tentative")] + [x for x in old["rounds"] if x["round"] not in known]
        rounds.sort(key=lambda x: x["round"])

    new = dict(old, rounds=rounds, source=f"https://www.pfs.org.pl/live/index.php?id={args.tour}")
    strip = lambda d: {k: v for k, v in d.items() if k != "updated"}
    if json.dumps(strip(new), sort_keys=True) == json.dumps(strip(old), sort_keys=True):
        print("Bez zmian.")
        return
    from datetime import datetime, timezone
    new["updated"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    if args.dry_run:
        print(json.dumps(new, ensure_ascii=False, indent=1)[:3000])
        return
    json.dump(new, open(RESULTS, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("Zapisano results.json")


if __name__ == "__main__":
    main()
