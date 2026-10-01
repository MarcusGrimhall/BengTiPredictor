# Arbetsplan för en publicerbar fantasyprognos

Senast uppdaterad 2026-10-01.

Målet är att vara redo att träna och publicera en fantasyprognos inför nästa TI.
Råden ska först testas på information som faktiskt fanns före respektive
turneringsstart eller roster lock. Arbetet delas i två leveranser:

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
- `lib/scenarioFantasy.ts` poängsätter nu en given gemensam framtid per karta,
  spelare, par och serie och kan mata `jointFantasy.ts`. Det är en testad
  poängsättare, inte en kalibrerad scenarioproducent eller prognos. Ett
  additivt medelvärdesadapter kan mata den befintliga delade tokenplaneraren
  för en fast roster; svansrisk och långsiktig policy är ännu inte validerade.
- `scripts/audit-player-coverage.mjs` skiljer källurval, saknade repriser och
  få kartor per konto före cutoff; S8:s Batyuk (15) och aik (12) ligger under
  den oförändrade 20-kartorsgränsen i redan godkända huvudevent. Den
  kontobaserade upptäckten hittar dessutom 5 respektive 8 kvalevent och 11
  övriga ligor var, ännu utan exakt granskning. Tunnheten gäller alltså det
  valda källurvalet, inte bevisat spelarens faktiska matchhistorik. Se den
  lokala rapporten `data/audits/player-coverage-19543.json`.
- `lib/historyForecast.ts` innehåller nu reproducerbara kandidater för
  rollgenomsnitt, spelarens fönstermedel och tidsviktat medel med en explicit
  pseudokartsbaserad fallback. Parametern `priorMaps` är ännu inte tränad eller
  kronologiskt utvärderad; inga råd får publiceras från den ensam.
- Pre-lock-manifestets roster, roller och konservativa cutoff är granskade.
  Första träningsförsöket stoppades korrekt eftersom Topson har 0 exakta kartor
  i de valda källorna.
- Nästa huvudspår är flera kronologiska tester på äldre turneringar, följt av
  PGL Wallachia Season 9 som första 16-lagsgeneralrepetition. Turneringen
  började 2026-09-19, så dess Group-prognos kan bara återskapas retrospektivt;
  en kommande turnering behövs för ett äkta förhandstest.
- 180 dagars maximalt historikfönster och 60 dagars halveringstid är en
  **kandidat**, inte ett fastslaget optimum. Spelare med tunn eller gammal
  historik behöver en testad rollbaserad fallback och redovisad osäkerhet.
- Status 2026-09-24: Wallachia 2026 Season 9 har OpenDota-ID 20279. En pågående
  forskningssnapshot har 16 lag, 80 spelare och 79/83 exakta kartor (95,2 %),
  men ännu inget daterat förhandsroster eller validerad prognos. Se
  `docs/WALLACHIA_2026.md`.

## Steg 1 — Frys turneringar, roster, roller och cutoff

- Välj flera äldre turneringar i kronologisk ordning som utvecklings- och
  testorigin. Ta hela turneringsfältet, inte ett efterhandsurval av 16 lag.
- Använd PGL Wallachia Season 9 som 16-lagsgeneralrepetition: [arrangören anger
  16 lag, Swiss Group och dubbel eliminering](https://www.pglesports.com/dota2/wallachia-s9-2026/).
- Bekräfta lag, konto-ID:n och fantasyroller för varje test mot daterade källor
  som fanns före dess cutoff. Kontrollera format och eventuella reserver.
- Registrera sena rosterändringar separat i stället för att läsa tillbaka dem
  från turneringens resultat.
- Sätt en konservativ cutoff som aldrig släpper in en match efter lock.
- Märk varje origin som retrospektivt eller faktiskt förhandslåst. Lås nästa
  turnerings prognos före första matchen och bevara prognos samt datafingeravtryck.
- Beskriv källturneringsurvalet innan målresultatet används för modellval.
- Bevara externa namnsträngar tills en normalisering kan göras i generatorn;
  handredigera aldrig `data/generated/`.

**Klart när:** varje origin har ett kontrollerbart roster-/tidsmanifest och en
människa kan återskapa besluten från källorna.

TI 2026-status 2026-09-15: roster och roller har jämförts automatiskt mot en pre-lock-
revision. Enda förändringen är LGD:s dokumenterade TaiLung → Topson-byte. En
konservativ cutoff på 2026-08-13 02:00 UTC används. Evidensen finns i
`docs/PRELOCK_19719.md`. Källturneringsurvalet är ännu ett forskningsval och ska
utvärderas som sådant, inte beskrivas som färdig modellvalidering.

S8-pilot 2026-09-24: ett daterat roster med 16 startfemmor, positioner och 80
konton har rekonstruerats från förhandsartiklar och tidigare matchidentiteter.
Det är märkt som rekonstruktion eftersom PGL:s ursprungliga tidsstämplade
80-kontolista inte har arkiverats. Den kontobaserade inventeringen ger 20
granskade internationella huvudevent, 30 kval och 34 övriga ligor. Alla 20
huvudevent har nu cachelagrade matchmanifest via den återupptagbara
`prepare-sources`-körningen. Efter `recover-sources` 2026-09-25 passerar 14/20
exakt-dataauditen; sex blockerades då av negativa stunvärden i rådata. Sedan
2026-10-01 behålls dessa värden enligt ägarens regelbeslut, och en omkörning
samma dag godkände tre till: **17/20**. FISSURE Universe 5 avbröts efter 62 av
116 replayer; DreamLeague 26 och PGL Wallachia S5 saknar ännu replayer. De tre
behöver slutförd replayhämtning och audit innan de kan godkännas. Se
`docs/reports/recover-sources-19543.md`. Steg 1 fortsätter för övriga origin.

## Steg 2 — Bygg exakta historiska underlag och hantera tunn historik

- Bygg exakta underlag för flera äldre origin och Wallachia med bara matcher
  som var färdigspelade före respektive cutoff.
- Behåll 90-procentsgrinden per vald källturnering och kompletta 18-statvektorer.
- Pröva minst tre historikpolicier på samma spelare och origin: kortare fönster,
  180 dagar med 60 dagars halveringstid, och längre fönster. Välj inte vinnare
  utifrån Wallachias utfall. Redovisa täckning och effektiv datamängd per spelare.
- Utveckla en rollbaserad fallback för få eller inga färska kartor; pröva den
  på historiska spelare i samma situation. Den nuvarande 20-kartorsgränsen får
  inte bara sänkas utan att detta testats.
- Kontrollera att varje match slutar strikt före cutoff och att målturneringen
  inte förekommer i Group-underlaget.
- Granska spelare nära minimigränsen separat; gammal historik och 20 färska
  kartor ska inte få samma presenterade säkerhet.

Status 2026-09-15: manifestet accepterades och alla 17 valda källturneringar
passerade exact-data-grinden. Bygget stannade på `Topson: 0`, vilket är korrekt:
han ersatte TaiLung sent och finns inte i 2026-källorna. TI 2024 innehåller 22
legacykartor för Topson men har 0/121 exakta matcher och saknar
förväntat-matchmanifest. Den får inte läggas till som om den vore exact.

TI 2024 kan återställas som forskningsunderlag om de äldre origin kräver det,
men två år gamla Topson-kartor får inte ensamma räknas som aktuell form. Den
generella fallbacken och dess test prioriteras före en sådan speciallösning.

**Klart när:** underlagen passerar datagrinden, tunn historik har en prövad
hantering och varje origin har sparade data- och regelfingeravtryck. Detta
publicerar ännu ingen prognos.

## Steg 3 — Regenerera baslinjer och rapporter

- Kör om `npm run compare-models` efter den senaste replayåterhämtningen.
- Kör om `npm run benchmark-policy` på samma kod- och regelversion.
- Etablera tre prognosbaslinjer: rollens fältgenomsnitt, spelarens oviktade
  historiska genomsnitt och ett enkelt tidsviktat genomsnitt.
- Märk äldre rapporter vars datafingeravtryck inte matchar det nya underlaget.
- Jämför historiklängd och halveringstid på flera tidigare origin med samma
  utvärderingsspelare. Bedöm också kompletta rosterbeslut, inte bara råa stats.

Status 2026-09-24: `compare-models` har körts om på den återställda exakta
datan. 18 turneringar uppfyller datatäckningen; 14 har en gemensam
utvärderingskohort. Kandidaten 180 dagar/60 dagars halveringstid ingår nu.
Råstatsmåttet ensamt ger inget beslut om bästa rosterregel, och Wallachia är
uttryckligen undantagen från modellvalet.

Status 2026-10-01: Efter beslutet att behålla negativa Stuns och tillåta
negativa Deaths-poäng kördes råstatsjämförelsen om efter S8-återhämtningen.
Rapporten innehåller nu 29 godkända event, varav 24 har gemensam
utvärderingskohort. Alla kandidater från 120 dagar eller 120 dagars
halveringstid och uppåt ligger inom ungefär en CRPS-poäng; 180/60 ger 197,23
mot 196,72 för okapad 120 dagars halveringstid. Wallachia är fortfarande
undantagen från modellvalet. Detta är en diagnostik, inte en
validerad Fantasy-rekommendation.

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
- Använd Wallachia som retrospektiv generalrepetition med fryst cutoff och
  tidigare beslutade modellregler. Frys en prognos inför nästa ännu ospelade
  turnering för ett separat, verkligt framåtriktat test.
- Redovisa datamängd och modellovisshet separat från slumpen i turneringen.

**Klart när:** modellen slår de enkla baslinjerna på orörda origin och dess
användarstrategier har kalibrerad betydelse.

## Steg 6 — Öppna Fantasy-sidan inför nästa TI

- Koppla scenarierna till den gemensamma rosteroptimeraren.
- Lägg nästa TI:s Prefix, Suffix, bonusar, villkor och hjältegrupper i ett
  versionsmärkt regelunderlag före modell- och UI-bygget. Läs hjältegrupperna
  från den aktuella Dota-klienten och verifiera titelutslag mot visade
  Fantasy-poäng. En ny säsong får inte tyst ärva förra TI:s titelregler.
- Erbjud tydliga mål: högst förväntat värde, stabil nedre 20-procentssvans och
  hög övre 20-procentssvans.
- Ersätt det gamla historiska riskreglaget om det inte kan kalibreras.
- Bygg ett versionsmärkt, komprimerat artefakt med modellversion, cutoff,
  rosterkälla, täckning, `rulesHash`, `dataHash` och valideringssammanfattning.
- Låt bygget vägra ett saknat eller inaktuellt artefakt.
- Publicera betyder här att ersätta Fantasy-sidans väntemeddelande med den
  validerade prognosen och driftsätta webbplatsen inför nästa TI. Wallachia är
  ett internt test, inte i sig en publicerad TI-prognos.

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
