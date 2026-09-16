# Arbetsplan för en publicerbar fantasyprognos

Senast uppdaterad 2026-09-15.

Målet är att återöppna Fantasy-sidan med råd som har testats på information som
faktiskt fanns före respektive roster lock. Arbetet delas i två leveranser:

1. en validerad spelar- och rosterprognos;
2. en validerad rådgivare för den delade rerollbudgeten.

Rerollpolicyn ska inte blockera publiceringen av en användbar rosterprognos.
Fantasy-sidan förblir stängd tills den första leveransen har ett versionsmärkt
prognosartefakt som klarar produktionsgrinden.

## Nuläge

- De aktuella poäng- och craftingreglerna finns i `lib/current-rules.json` och
  evidensen i `ASSUMPTIONS.md` och `RULE_AUDIT.md`.
- Den exakta pipelinen kräver kompletta 18-statvektorer för alla tio spelare i
  varje behållen match.
- Den senaste förberedelserapporten har 93,1–100 procent exakt täckning och
  godkänd datagrind för alla 18 granskade turneringar.
- Den gamla genererade prognosen är legacydata och får inte återaktiveras genom
  att bara sätta `modelValidated`.
- `lib/jointFantasy.ts` kan optimera en komplett Core/Mid/Support-roster när den
  får sammanhängande scenarier. Scenarioproducenten saknas fortfarande.
- Pre-lock-manifestets roster, roller och konservativa cutoff är granskade.
  Första träningsförsöket stoppades korrekt eftersom Topson har 0 exakta kartor
  i de valda källorna.
- Nästa konkreta kontrollpunkt är att lösa Topsons historiktäckning utan att
  sänka datagrinden och därefter bygga Group-underlaget.

## Steg 1 — Frys mål, roster, roller och cutoff

- Bekräfta alla 16 lag, 80 konto-ID:n och fantasyroller mot daterade källor som
  fanns före lock.
- Registrera sena rosterändringar separat i stället för att läsa tillbaka dem
  från turneringens resultat.
- Sätt en konservativ cutoff som aldrig släpper in en match efter lock.
- Beskriv källturneringsurvalet innan målresultatet används för modellval.
- Bevara externa namnsträngar tills en normalisering kan göras i generatorn;
  handredigera aldrig `data/generated/`.

**Klart när:** `validatePreparation` accepterar manifestet och en människa kan
återskapa varje roster- och tidsbeslut från källorna.

Status 2026-09-15: roster och roller har jämförts automatiskt mot en pre-lock-
revision. Enda förändringen är LGD:s dokumenterade TaiLung → Topson-byte. En
konservativ cutoff på 2026-08-13 02:00 UTC används. Evidensen finns i
`docs/PRELOCK_19719.md`. Källturneringsurvalet är ännu ett forskningsval och ska
utvärderas som sådant, inte beskrivas som färdig modellvalidering.

## Steg 2 — Bygg det exakta träningsunderlaget

- Kör `npm run train -- 19719 --config prelock-19719-groupstage.draft.json`.
- Kontrollera minst 20 exakta historiska kartor per spelare.
- Kontrollera att varje match slutar strikt före cutoff och att målturneringen
  inte förekommer i Group-underlaget.
- Granska spelare nära minimigränsen separat; 20 kartor och 150 kartor ska inte
  få samma presenterade säkerhet.

Status 2026-09-15: manifestet accepterades och alla 17 valda källturneringar
passerade exact-data-grinden. Bygget stannade på `Topson: 0`, vilket är korrekt:
han ersatte TaiLung sent och finns inte i 2026-källorna. TI 2024 innehåller 22
legacykartor för Topson men har 0/121 exakta matcher och saknar
förväntat-matchmanifest. Den får inte läggas till som om den vore exact.

Nästa beslut ska jämföra två evidensmässigt giltiga vägar:

1. återställ TI 2024-manifestet och dess replayöverlägg och kör samma 90-procents-
   grind som för övriga källor;
2. utveckla en uttrycklig hierarkisk fallback för spelare utan 20 kartor och
   validera den på historiska motsvarigheter innan minimikravet ändras.

**Klart när:** det normaliserade underlaget passerar datagrinden och har ett
sparat data- och regel-fingeravtryck. Detta publicerar ännu ingen prognos.

## Steg 3 — Regenerera baslinjer och rapporter

- Kör om `npm run compare-models` efter den senaste replayåterhämtningen.
- Kör om `npm run benchmark-policy` på samma kod- och regelversion.
- Etablera tre prognosbaslinjer: rollens fältgenomsnitt, spelarens oviktade
  historiska genomsnitt och ett enkelt tidsviktat genomsnitt.
- Märk äldre rapporter vars datafingeravtryck inte matchar det nya underlaget.

**Klart när:** varje mer avancerad modell jämförs med en enkel reproducerbar
baslinje på exakt samma historiska origin.

## Steg 4 — Skapa sammanhängande turneringsscenarier

- Generera gemensamma framtider för möten, kartantal, resultat och kompletta
  spelarstatvektorer.
- Bevara korrelationen mellan stats inom en karta och mellan lagkamrater.
- Använd samma framtid för alla konkurrerande fantasyentries.
- Poängsätt varje framtid med den riktiga kedjan: spelare → emblem → karta → två
  bästa kartor i serien → bästa serien i perioden.
- Modellera Group och Playoffs separat, inklusive en riktig Group → Playoff-
  uppdatering efter avslutat gruppspel.

**Klart när:** `jointFantasy.ts` får gemensamma scenariokolumner utan oberoende
sampling av roller eller stats.

## Steg 5 — Validera fantasybeslutet

- Använd rullande kronologiska testorigin; modellval görs bara på tidigare
  origin och slutresultatet mäts på en senare.
- Mät rekommenderad rosterpoäng, placering i fältet, andel av bästa möjliga
  poäng och regret mot efterhandsoraklet.
- Mät nedre/övre svans, täckning och känslighet för historikfönster, patch,
  lagbyte och motstånd.
- Jämför Group och Playoffs var för sig.
- Redovisa datamängd och modellovisshet separat från slumpen i turneringen.

**Klart när:** modellen slår de enkla baslinjerna på orörda origin och dess
användarstrategier har kalibrerad betydelse.

## Steg 6 — Publicera rosterprognosen

- Koppla scenarierna till den gemensamma rosteroptimeraren.
- Erbjud tydliga mål: högst förväntat värde, stabil nedre 20-procentssvans och
  hög övre 20-procentssvans.
- Ersätt det gamla historiska riskreglaget om det inte kan kalibreras.
- Bygg ett versionsmärkt, komprimerat artefakt med modellversion, cutoff,
  rosterkälla, täckning, `rulesHash`, `dataHash` och valideringssammanfattning.
- Låt bygget vägra ett saknat eller inaktuellt artefakt.

**Klart när:** Fantasy-sidan kan visa en ärlig rosterprognos utan att den gamla
legacyheuristiken återinförs.

## Steg 7 — Validera rerollpolicyn

- Behåll exakt en-tokenvärde, exakt två-tokenvärde, betald refresh och gemensamma
  slumpframtider.
- Låt terminalvärdet vara hela rosterns scenarioobjektiv, inklusive Titles och
  alla validerade lag-/turneringseffekter.
- Jämför nuvarande giriga policy mot kort lookahead, rollout med värdefunktion
  och exakta nåbara delproblem på identiska slumpsekvenser.
- Mät regret, konvergens, adaptiv precision och tokenvärdeskurvor.
- Visa bara exakt direkteffekt tills långtidspolicyn klarar grinden.

**Klart när:** rådet "Take" eller "Skip" har mätt beslutsregret för relevant
tokenbudget och inte bygger på en omärkt girig approximation.

## Steg 8 — Slutför användarflöde och drift

- Håll Group- och Playoffmodeller, bannerstate och tokenbudget tydligt åtskilda
  enligt den antagna produktpolicyn.
- Se till att ranking och reroll använder exakt samma rosterfunktion.
- Visa varför ett råd ges och avstå när alternativen inte kan skiljas.
- Mät statisk artefaktstorlek, workerlatens och browserfallback.
- Kör `npm test`, `npm run validate` och `npm run build` före publicering.

**Klart när:** en vanlig spelare kan förstå rådet och dess säkerhet, och CI
förhindrar att data, regler, modell och gränssnitt glider isär.
