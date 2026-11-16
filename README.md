# MP w Scrabble 2026 – dashboard fazy finałowej

Interaktywny dashboard fazy finałowej Mistrzostw Polski w Scrabble 2026
(16 graczy, każdy z każdym, 15 rund): tabela na żywo, terminarz z kursami
na każdy pojedynek, macierz head-to-head, kursy na tytuł i podium
(symulacja Monte Carlo) oraz symulator „co jeśli”.

Strona: GitHub Pages z katalogu `docs/`.

## Struktura

```
docs/
  index.html, style.css, app.js   – strona (czysty HTML/JS, bez builda)
  data.json                       – gracze, rankingi, bilanse H2H, parametry modelu
  results.json                    – terminarz i wyniki (TO EDYTUJESZ w trakcie turnieju)
scripts/
  raw_data.py      – surowe dane ze scrabble.stats.org.pl
  build_data.py    – buduje data.json i kalibruje model
  make_schedule.py – generuje terminarz (tablice Bergera)
```

## Wpisywanie wyników

W `docs/results.json` przy meczu zamień `"score": null` na `"score": [412, 389]`
(małe punkty gracza `a`, potem gracza `b`) i zrób commit – strona przeliczy
tabelę, kursy i szanse na tytuł. Jeśli oficjalne pary są inne niż wygenerowane,
podmień pola `a`/`b` w odpowiednich rundach.

## Model kursów

1. Siła = średnia z: rankingu PFS aktualnego, rankingu z ostatnich 12 miesięcy oraz rankingu formy
   (ranking osiągnięty w ostatnich 12 mies. w partiach z rywalami z rankingiem ≥ 140,
   ściągnięty do aktualnego rankingu wagą 30 gier).
2. `p0 = 1 / (1 + exp(-k·ΔS))`, `k` dopasowane (MLE) do 1703 historycznych partii między finalistami.
3. Korekta H2H: `p = (W + R/2 + 20·p0) / (gry + 20)`.
4. Kurs = `1 / (p · (1 + marża))`; marża 6% na mecze, 15% na tytuł/podium.
5. Tytuł: 20 000 symulacji pozostałych meczów; remisy w tabeli rozstrzyga różnica małych punktów.
6. Przycisk „Symuluj turniej” losuje dokładne wyniki (małe punkty) wszystkich nierozegranych partii.

Parametry (`k`, waga prioru, marże) są w `data.json → model`.

Kursy mają charakter wyłącznie rozrywkowy/statystyczny.
Dane: [scrabble.stats.org.pl](https://scrabble.stats.org.pl/) (stan na 16-11-2026).
