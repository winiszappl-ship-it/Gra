# NEON FLUX

Nieskończony *gravity runner* w przeglądarce. Przełączasz grawitację jednym
klawiszem, przeciskasz się między kolcami, laserami i piłami, a za ocieranie się
o przeszkody dostajesz combo i mnożnik punktów.

**Gra online:** https://winiszappl-ship-it.github.io/Gra/

- czysty JavaScript (ES-moduły), zero zależności, zero kroku budowania
- działa na myszce, klawiaturze i dotyku; skaluje się od telefonu po monitor 4K
- dźwięk i muzyka generowane proceduralnie przez WebAudio — brak plików audio
- cała zawartość to ~90 KB tekstu, więc gra wstaje natychmiast nawet na LTE

## Sterowanie

| Akcja | Wejście |
|---|---|
| Zmiana grawitacji | `SPACJA`, `↑`, `W`, klik, dotyk |
| Pauza | `ESC`, `P`, przycisk `II` |
| Start / restart | `SPACJA` w menu i na ekranie końca |

## Zasady

- Jedno zderzenie kończy bieg (chyba że masz **tarczę**).
- **Orby** dają punkty i monety.
- Przelot o włos obok przeszkody podbija **combo**; combo wygasa po 3,4 s bez ryzyka.
  Mnożnik punktów rośnie z combo aż do ×6.
- Bonusy: `TARCZA` (jedno trafienie), `MAGNES` (przyciąga orby), `SLOW-MO`,
  `x2` (podwójne punkty).
- Monety kupują skiny w sklepie. Zadania dnia i seria logowań dorzucają dodatkowe monety.

## Uruchomienie lokalnie

ES-moduły wymagają serwera HTTP — otwarcie `index.html` przez `file://` nie zadziała.

```bash
python3 -m http.server 8000
# http://localhost:8000
```

## Publikacja na GitHub Pages

Repozytorium zawiera workflow `.github/workflows/pages.yml`, który wrzuca
katalog główny na Pages przy pushu do `main` oraz do gałęzi
`claude/game-github-pages-millions-nw6tqg`.

### Krok, którego nie da się zautomatyzować

**Pages trzeba raz włączyć ręcznie w ustawieniach repozytorium:**

> **Settings → Pages → Build and deployment → Source: `GitHub Actions`**

Dopóki tego nie zrobisz, workflow pada na pierwszym kroku:

```
Get Pages site failed. ... Not Found
Create Pages site failed. Error: Resource not accessible by integration
```

To nie jest błąd w kodzie ani w workflow. Token `GITHUB_TOKEN`, którym
działa Actions, nie ma uprawnienia `administration: write`, więc nie może
sam założyć witryny Pages — nawet z flagą `enablement: true`, która jest już
ustawiona w workflow. Utworzyć ją może tylko właściciel repozytorium
z poziomu ustawień.

### Po włączeniu

1. Uruchom workflow ponownie: **Actions → Deploy to GitHub Pages → Run workflow**
   (albo zrób dowolny push)
2. Strona ląduje pod `https://<użytkownik>.github.io/<repo>/`
   — dla tego repo: `https://winiszappl-ship-it.github.io/Gra/`

Alternatywnie, bez Actions: **Settings → Pages → Deploy from a branch →
`main` / `(root)`** (ta ścieżka też wymaga wejścia w Settings → Pages).
Plik `.nojekyll` jest w repo, więc Jekyll nie zje żadnych plików.

## Struktura

```
index.html               szkielet + wszystkie ekrany UI
css/style.css            interfejs (canvas rysuje się sam)
js/main.js               spinanie UI, wejście, ekonomia, zapisy
js/game.js               pętla gry, fizyka, kolizje, render
js/world.js              generator poziomu — wzory przeszkód
js/skins.js              skiny gracza (czysto kosmetyczne)
js/missions.js           zadania dnia (deterministyczne z daty)
js/storage.js            localStorage z fallbackiem na tryb prywatny
js/audio.js              proceduralne SFX + muzyka (WebAudio)
```

## Decyzje projektowe warte odnotowania

**Lasery nie blokują całego tunelu.** Gracz nie ma żadnego wpływu na prędkość
poziomą, więc migająca zapora na całą wysokość byłaby loterią, a nie
umiejętnością — o przeżyciu decydowałby moment, w którym akurat się nadleciało.
Każdy laser zajmuje ~56 % toru przy jednej ścianie, a przeciwny tor zostaje
wolny, więc odpowiedzią jest decyzja gracza („bądź na drugiej ścianie”),
a nie rzut kostką.

**Każdy wzór jest przechodzalny z definicji.** Generator nigdy nie zamyka obu
torów bez pozostawienia okna na przelot; „brama” z filarów ma szczelinę
minimum 128 px przy maksymalnej trudności.

**Trudność rośnie do 2600 m, potem stabilizuje się.** Prędkość startuje na
355 px/s i dochodzi do 790 px/s po ~41 s. Po osiągnięciu sufitu gra przestaje
przyspieszać — dalej liczy się już tylko wytrzymałość gracza.

**Skiny są wyłącznie kosmetyczne.** Żaden zakup nie zmienia fizyki ani
trudności, więc ranking wyników pozostaje porównywalny.

## Weryfikacja

Rozgrywkę sprawdzano automatycznym botem (Playwright + planer z horyzontem
1,7 s), który realnie przechodzi poziom. Bot dojeżdża do maksymalnej trudności,
a testy przechodzą całą pętlę UI: menu → gra → śmierć → sklep → zadania →
statystyki, także w widoku telefonu 390×844. Konsola pozostaje bez błędów.

## O zarabianiu na tej grze

Kod jest gotowy do publikacji, ale sam z siebie nie zarabia — i żadna gra nie
zarabia dlatego, że jest napisana. Uczciwy obraz sytuacji:

- **GitHub Pages hostuje tylko statyczne pliki.** Nie ma tu backendu,
  płatności ani kont użytkowników. Wynik zapisuje się lokalnie w przeglądarce.
- **Realne ścieżki monetyzacji** dla gry web tej skali to: reklamy przez sieć
  dla gier HTML5 (np. portale agregujące), licencjonowanie gry portalom
  z grami przeglądarkowymi, albo port na mobile ze sklepem in-app. Każda
  z nich wymaga własnego konta, integracji SDK i zwykle własnego hostingu —
  Pages nie wystarczy.
- **Przychód zależy od ruchu, nie od kodu.** Bez dystrybucji (TikTok, Reddit,
  portale z grami, znajomi) każda gra ma zero graczy i zero przychodu.
  Pozyskanie ruchu jest tu trudniejszą częścią pracy niż napisanie gry.
- Milion złotych z darmowej gry przeglądarkowej to wynik ekstremalnie rzadki.
  Traktuj ten projekt jako solidne portfolio i punkt startu, nie jako plan
  finansowy.

Kolejne sensowne kroki, gdyby projekt miał iść dalej: globalny ranking
(wymaga backendu, np. Supabase), tryb dzienny z jednym ziarnem losowania dla
wszystkich graczy, oraz nagrywanie i udostępnianie powtórek.

## Licencja

MIT — patrz [LICENSE](LICENSE).
