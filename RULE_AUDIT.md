# Regelrevision

Detta är arbetsunderlaget för steg 1 i `PLAN.md`: en samlad lista över regler
som påverkar användarens resultat. Den ändrar inte modellens beteende.

## Status

| Status | Betydelse |
| --- | --- |
| **Bekräftad** | Regeln står i Valve-text eller annan direkt spelkälla. |
| **Uppmätt** | Regeln stöds av kontrollerad matchdata, men är inte fullständigt beskriven av Valve. |
| **Observerad** | Bygger på användarerfarenhet, skärmbild eller exempel som ännu inte räcker som generell regel. |
| **Antagen** | Modellen behöver regeln, men tillräcklig evidens saknas. |
| **Saknas** | Offentlig data räcker inte för att beräkna regeln tillförlitligt. |
| **Implementationsgap** | Regeln är känd men implementationen modellerar den inte korrekt eller fullständigt. |

Påverkan anger hur mycket en felaktig regel rimligen kan påverka rekommendationer:
**hög**, **medel** eller **låg**. Det är en prioritering, inte ett uppmätt felmått.

## Grundläggande fantasyregler

| ID | Regel | Status | Påverkan | Underlag och kod |
| --- | --- | --- | --- | --- |
| F01 | Core och Support består av två spelare från samma lag; Mid består av en spelare. | Bekräftad | Hög | In-game-regler; `lib/fantasy.ts` |
| F02 | Ett par får medelvärdet av spelarnas individuella poäng, inte summan och inte poängen från en först medelvärdesbildad statrad. | Bekräftad | Hög | In-game Fantasy glossary; `pairUp` i `lib/fantasy.ts` |
| F03 | En series poäng är summan av rollens två bästa matcher i serien. | Bekräftad | Hög | In-game Fantasy glossary; seriegruppering i `lib/fantasy.ts` |
| F04 | En period betalar bara den bästa serien, inte summan eller snittet av alla serier. | Bekräftad | Hög | In-game Fantasy glossary; periodpoäng i `lib/fantasy.ts` |
| F05 | Group stage och playoffs är separata perioder; första har tre emblem och 40 tokens, andra fem emblem och 30 nya tokens. | Bekräftad | Hög | In-game roster screen; `lib/stages.ts` |
| F06 | De första tre emblemen följer med till playoffkortet. | Bekräftad | Medel | In-game-material och flera oberoende guider; `lib/stages.ts`, `components/FantasyCalculator.tsx` |
| F12 | Oanvända group-stage-tokens försvinner i stället för att följa med till playoffs. | Observerad | Medel | Användarbekräftat 2026-09-03; `lib/stages.ts` modellerar expiry |
| F07 | Slotarnas färger och tillåtna stats beror på rollen. | Bekräftad | Hög | In-game-regler; `BANNER_SLOTS` i `lib/scoring.ts` |
| F08 | Samma stat får inte förekomma två gånger på ett banner. | Bekräftad | Hög | In-game Emblem Stats glossary; `hasDuplicateStats` |
| F09 | Tierbonusarna är +10, +30, +60, +100 och +150 procent. | Bekräftad | Hög | In-game-regler; `lib/fantasy.ts` |
| F10 | Tier- och traitbonusar adderas mot baspoängen i stället för att multipliceras med varandra. | Bekräftad | Hög | Tutorialtext och fångat bannerexempel; `emblemMultipliers` i `lib/fantasy.ts` |
| F11 | Deaths golvas vid noll i den nuvarande modellen. | Antagen, motsagd | Hög | Klienten anger bara `1950 - 195 per death`. battlepass.ru:s replaybaserade verifiering säger uttryckligen att spelet tillåter negativa poäng. Behöver ett verkligt 11+ deaths-klientresultat; `statToPoints` i `lib/scoring.ts` är tills vidare oförändrad. |

## Traits

| ID | Regel | Status | Påverkan | Underlag och kod |
| --- | --- | --- | --- | --- |
| T01 | Fractal ger +60 % när alla kvaliteter på bannern är olika, även på ett banner med tre emblem. | Bekräftad | Medel | In-game-regler; `lib/fantasy.ts` |
| T02 | Benevolent ger +20 % till omedelbart angränsande emblem utan wrap mellan första och sista slotten. | Bekräftad | Medel | In-game-regel och fångat 3-slotsexempel; `lib/fantasy.ts` |
| T03 | Vampiric ger +50 % till emblemet och −10 % till direkt angränsande emblem. | Bekräftad | Medel | In-game-regler; `lib/fantasy.ts` |
| T04 | Unique ger +30 % enligt dess in-game-villkor. | Bekräftad | Medel | In-game-regler; `lib/fantasy.ts` |
| T05 | Friendly ger +50 % enligt dess in-game-villkor. | Bekräftad | Medel | In-game-regler; `lib/fantasy.ts` |
| T06 | Varje emblem har alltid en av de fem traitsen och börjar med en slumpad trait; tillståndet “ingen trait” finns inte. | Observerad | Hög | Användarbekräftat 2026-09-03 och förenligt med glossariets fem traits; `ROLLABLE_TRAITS`/`randomBanner` |
| T07 | Alla möjliga nya traits är lika sannolika. | Antagen | Hög | Ingen publicerad sannolikhetsfördelning; `traitOptions` i `lib/reroll.ts` |

## Rerolls

| ID | Regel | Status | Påverkan | Underlag och kod |
| --- | --- | --- | --- | --- |
| R01 | En deal innehåller exakt tre unika alternativ som delas av alla tre banners. | Bekräftad | Hög | In-game-regler och användarobservation; `OPTIONS_DEALT`/`deal` i `lib/offers.ts` |
| R02 | Man kan välja att inte använda något alternativ; oförändrade alternativ ligger då kvar. | Bekräftad | Hög | In-game tutorial; UI och `planOffers` |
| R03 | Att använda ett alternativ kostar en token och ersätter alla tre alternativen. | Bekräftad | Hög | In-game-regler; `lib/offers.ts` |
| R04 | Att kasta de tre alternativen och dra tre nya kostar en token. | Implementationsgap | Hög | Bekräftat i in-game tutorial; `playOut` stannar i stället när inget alternativ förbättrar bannern |
| R05 | Varje rerolloperation kostar exakt en token. | Bekräftad | Hög | In-game-regler och communityguider; `lib/reroll.ts`/`lib/offers.ts` |
| R06 | En quality-reroll väljer en annan tillgänglig tier, inte bara ett steg upp eller ned. | Observerad | Hög | Användaruppgift; `tierOptions` i `lib/reroll.ts` |
| R07 | En quality-reroll kan aldrig ge samma tier som emblemet redan har. | Observerad | Hög | Användarbekräftat 2026-09-03; `tierOptions` modellerar redan detta |
| R08 | En stat- eller trait-reroll ger aldrig tillbaka värdet den ersatte. | Bekräftad | Medel | In-game glossary; `applyAction` och `enumerateOutcomes` |
| R09 | Qualityutfall följer de uppmätta vikterna 5:4:3:2:1 för Tier I–V. Reroll utesluter aktuell tier, increase tillåter bara högre och decrease bara lägre; vikterna normaliseras inom respektive utfallsmängd. | Uppmätt | Hög | 195 klientrolls med alla tre operationstyper, varav 163 informativa: fri fit 32,8/28,5/22,1/11,7/5,0 %; 5:4:3:2:1 passar med LR p=0,75 och uniform fördelning förkastas vid p<1e−8. Separata fits per operation förbättrar inte modellen signifikant (p=0,20). `QUALITY_WEIGHTS`/`qualityOutcomes` i `lib/reroll.ts` |
| R10 | Tier V kan inte höjas och tier I kan inte sänkas. | Observerad | Medel | Användaruppgift; wildcardlogik i `lib/reroll.ts` |
| R11 | Wildcards väljer slumpmässigt bland riktningens giltiga mål innan något flyttas. II/II/V innebär att båda II höjs och V sänks; I/V/V höjer I och sänker en slumpad V. | Observerad | Medel | Användarexempel; `applyAction` i `lib/reroll.ts` |
| R12 | Katalogen har 20 operationer: Red granular Quality, Blue granular Trait, Green granular Stat, övriga egenskaper all-only, plus två quality-wildcards. | Observerad | Medel | Komplett publicerad klientlista och Valves operation-bucket-schema; `actionCatalogue` |
| R13 | Inget av de tre visade alternativen kan förekomma igen direkt i nästa deal. | Antagen | Medel | Användarinstruktion 2026-09-03 att utgå från no-repeat; exakt scope är ännu inte direkt verifierat. `deal` har inget minne och modellerar därför inte regeln |
| R14 | Simulatorns greedy-policy är en tillräcklig approximation av optimal framtida användning. | Implementationsgap | Hög | `playOut` tar endast omedelbart positiva alternativ och kan inte betala för refresh eller ett tillfälligt sämre val |
| R15 | Nya emblems quality är uniform 1:1:1:1:1; rerolls använder däremot uppmätta 5:4:3:2:1. | Antagen | Medel | Användarinstruktion 2026-09-03; `randomBanner` kontra `qualityOutcomes` |

## Poängstats och datafält

Poängvärdena för samtliga 16 extraherbara stats är bekräftade från in-game-
regler och korsjämförda mot communitydata. Tabellen nedan gäller vad varje rått
datafält faktiskt räknar.

| ID | Stat och tolkning | Status | Påverkan | Underlag och kod |
| --- | --- | --- | --- | --- |
| S01 | Kills: spelarens egna hero kills; assists räknas inte. | Uppmätt | Medel | OpenDota jämfört med STRATZ, 10/10; `scripts/extract.mjs` |
| S02 | Deaths: 1 950 − 195 per death och beräknat per game; nollgolvet är osäkert. | Delvis bekräftad | Hög | Skalan är klientbekräftad. Golvet bygger på F11 och motsägs av en replaybaserad extern verifiering; `lib/scoring.ts` golvar ännu. |
| S03 | Creep Score: last hits plus denies. | Bekräftad | Medel | In-game glossary; `scripts/extract.mjs` |
| S04 | GPM: guld per minut som rate, inte total guldmängd. | Uppmätt | Medel | OpenDota/STRATZ; `scripts/extract.mjs` |
| S05 | Towers: spelaren som gör sista träffen får poängen. | Observerad | Medel | Användaruppgift; tower combat-log extraction |
| S06 | Roshan: spelaren med killing blow enligt `killed.npc_dota_roshan`. | Uppmätt | Medel | Summerar exakt till Roshan-chatthändelser över 12 matcher |
| S07 | Tormentor: spelets deltagarkredit finns i replayfältet `m_iTormentorKills`; last-hit används bara som fallback utan replay. | Verifierad och integrerad | Hög | Öppen Clarity-parser och 1 470 TI-spelarrader; exakt total är 3,169× last-hit-totalen |
| S08 | Courier: couriers som spelaren dödar. | Uppmätt | Låg | OpenDota jämfört med STRATZ, 10/10 |
| S09 | First Blood: spelaren med första killen, inte assist. | Uppmätt | Medel | `firstblood_claimed` stämmer mot chatthändelser |
| S10 | Teamfight: spelets sluträknare `m_flTeamFightParticipation`, som andel 0–1. | Verifierad | Hög | Replayfältet identifierat; OpenDota matchar inom 1e-5 på 98,6 % av 1 470 TI-rader och totalsumman inom 0,007 %. K/A/deaths-formeln är bara en rekonstruktion |
| S11 | Stuns: sekunder summeras per träffad hjälte. | Uppmätt | Medel | OpenDota combat-loggens `modifier_stunned`; Valve-definition ej verifierad |
| S12 | Observer wards: wards placerade, inte köpta; sentries ingår inte. | Uppmätt | Medel | OpenDota jämfört med STRATZ |
| S13 | Camps stacked: antal camps, inte antal creeps. | Uppmätt | Medel | OpenDota jämfört med STRATZ |
| S14 | Runes: tagna och bottled runes, men inte Wisdom runes. | Uppmätt | Medel | 120/120 player-games samt STRATZ-kontroll |
| S15 | Smokes: `item_uses.smoke_of_deceit`, alltså använda och inte köpta smokes. | Uppmätt | Medel | STRATZ itemUsed, 10/10 spelare |
| S16 | Madstones: exakt fantasyräknare är replayfältet `m_iNeutralTokensFound`; äldre matcher använder `bundle × 3,17`. | Verifierad och integrerad | Hög | Exakt/bundle = 3,177× över TI 2026 och EWC, 3,164× över 1win Essence II |
| S17 | Lotuses och Watchers finns som `m_iLotusesTaken` och `m_iWatchersTaken`; äldre matcher använder separat kalibrerade fallbacks. | Verifierad och integrerad | Hög | Öppen Clarity-parser, Valve-schemat och 3 630 exakta spelarrader |

## Titles

| ID | Regel | Status | Påverkan | Underlag och kod |
| --- | --- | --- | --- | --- |
| C01 | Ett gemensamt Prefix och ett gemensamt Suffix används för hela rostern och är gratis att byta. | Bekräftad | Medel | In-game Coaching Titles glossary; `lib/titles.ts` |
| C02 | Prefixens och Suffixens bonusvärden och villkor följer in-game glossary. | Bekräftad | Medel | `PREFIXES`/`SUFFIXES` i `lib/titles.ts` |
| C03 | Prefixens hjältegrupper finns inte i publika API:er, men finns som `Adjectives` i Dota-klientens `npc_heroes.txt`. | Implementationsgap | Medel | En annan pipeline har extraherat 129 rader till `hero_tags.csv`; vårt `HERO_GROUPS` är tomt och visar unknown |
| C04 | Patient, Underdog, Decisive, Clutch och Lucky mäts från matcherna. | Uppmätt | Medel | `SUFFIX_BITS` och `scripts/extract.mjs` |
| C05 | Tormented, Flayed Twins Acolyte och Cruel räknas ur replayn där överlägg finns; äldre matcher exkluderas ur deras triggerfrekvens. | Verifierad och integrerad | Medel | Combat-log attacker `npc_dota_miniboss`; First Blood-tid relativt `m_flGameStartTime`; hjälteposition relativt lagets fountain vid death |
| C06 | Coaching Title är ett separat lager efter emblemets multiplier, per spelare och game. Prefix och Suffix adderas inom lagret: `1 + prefix + suffix`. | Delvis uppmätt | Hög | Royal +10% reproducerar fyra Team Vision-playoffvärden till centen; samtidig Prefix+Suffix-trigger saknas och plus-tecknet är därför användarantagande; `FantasyCalculator.tsx` |

## Turnerings- och prognosregler

| ID | Regel | Status | Påverkan | Underlag och kod |
| --- | --- | --- | --- | --- |
| P01 | Stagegräns, format och spelade serier härleds från aktuell turnerings matchdata och får inte hårdkodas från ett annat TI. | Uppmätt | Hög | `lib/stages.ts`, `scripts/fetch-league.mjs` |
| P02 | Roller härleds från OpenDotas lane detection och löses till 2 Core / 1 Mid / 2 Support per lag. | Antagen | Hög | Har stämt i alla samtidiga registry-kontroller men är inte Valves fantasyroll |
| P03 | Aktuell roster föredras när den fortfarande matchar eventet; annars används eventdeltagande som fallback. | Uppmätt | Medel | OpenDota roster snapshot med tidsrimlighetskontroll; `buildLineups`/fetch-pipeline |
| P04 | Teamstyrkans påverkan på scoring är 1,84 % per 100 Elo. | Uppmätt | Medel | n=2910, t=4,05; `lib/strength.ts` |
| P05 | Varje stats prognos krymps mot fältmedlet enligt split-half-reliabilitet inom event. | Antagen | Hög | Förbättrar nuvarande backtest, men inom-event-reliabilitet överskattar överföring mellan månader/event |
| P06 | Aktuell OpenDota Elo kan användas för eventet som prognostiseras. | Uppmätt | Hög | Graderas per event; känt oanvändbart för flera äldre event |
| P07 | Träningsdata måste ligga helt före målturneringen. | Bekräftad | Hög | Projektets metodregel och automatisk cutoff i `scripts/build-training.mjs` |

## Högst prioriterade öppna frågor

1. **R04/R14:** modellera den bekräftade token-betalda refresh-mekaniken.
2. **T07:** fastställ traitutfallens fördelning; T06 är implementerad utan `none`.
3. **R06:** verifiera att quality-rerollen kan landa på varje annan tier; R07 är användarbekräftad.
4. **R13:** verifiera no-repeat-regelns exakta scope innan den implementeras.
5. **F11/S02:** Deaths-golvet är ett avsiktligt användarantagande som nu motsägs av replaybaserad extern evidens; verifiera med ett verkligt 11+ deaths-resultat och överväg att ta bort golvet.
6. **S17/S07:** utöka replaytäckningen bortom de tre importerade 2026-ligorna.
7. **P02:** jämför lane-heuristiken mot STRATZ Position där det är möjligt.

## Extern evidensgranskning

Granskningen använder en källhierarki:

1. In-game-skärmbilder eller data ur Dota-klienten.
2. Valve-publicerad text.
3. Reproducerbara kontroller mot rå match-/replaydata.
4. Oberoende implementationer och guider.
5. Enskilda observationer och kommentarer.

### Källor granskade hittills

- [Skärmbildsbaserad TI 2026-regeltranskription](https://github.com/saalocin/dotaTI2026/blob/main/TI2026_Rules.md) med de underliggande [in-game-bilderna](https://github.com/saalocin/dotaTI2026/tree/main/assests).
- [Dota-2-fantasy-predictor](https://github.com/thearft/Dota-2-fantasy-predictor), vars pipeline redovisar API-täckning och återger scoringordningen.
- Lokalt klonade `Kadadji1/dota2-fantasy-optimizer-2026`.
- [SpectralDotaFantasy](https://spectralxxx.github.io/) som oberoende kontroll av grundmekaniken.

### Första säkra slutsatser

- F01–F05, F07–F10, T01–T05, R01–R05, R08, statskalorna och C01–C02 stöds av skärmbilder från klienten eller transkription direkt från dem.
- Additiv quality/trait-stacking stöds både av ordalydelsen “additional percentage bonus to the base fantasy score” och av ett synligt Tier II-exempel med −10 % adjacency som visar 120 %.
- Högre qualities är uttryckligen ovanligare. En extern logg med 195 klientrolls
  ger vikterna 5:4:3:2:1; den fria skattningen är 32,8/28,5/22,1/11,7/5,0 %.
  Vikterna är nu implementerade och normaliseras över de utfall som är möjliga
  från aktuell tier. Valve publicerar fortfarande inga exakta odds.
- `npc_heroes.txt` innehåller de hjälptaggar Prefix kräver. C03 är ett lösbart implementationsgap, inte en permanent datalucka.
- Oanvända group-stage-tokens försvinner enligt användarbekräftelse; F12 är inte längre en öppen fråga.
- Varje emblem har alltid en trait och börjar med en slumpad trait. Rerollmodellen utesluter nu sitt interna analysvärde `none` från alla verkliga draws.
- En quality-reroll kan inte ge tillbaka samma tier. No-repeat mellan två deals ska tills vidare antas gälla alla tre visade alternativ, men behöver fortfarande direkt evidens och exakt scope.

### Skillnader mot Kadadji-projektet

Referensprojektet är användbart som jämförelse men inte som auktoritet. Dess
nuvarande kod eller dokumentation avviker från starkare in-game-evidens på minst
följande punkter:

| Fråga | BengTiPredictor | Kadadji-projektet | Evidensbedömning |
| --- | --- | --- | --- |
| Quality + traits | Adderas mot baspoängen | Multipliceras | Vår modell stöds av in-game-exemplet |
| Deaths under noll | Golvas vid noll | Tillåts bli negativ | Fortfarande öppet; projektskillnaden avgör inget |
| Fractal | Alla emblem som finns på bannern måste ha olika quality | Guidetext säger alla fem | In-game-texten säger alla qualities på bannern; vår läsning stöds |
| Vampiric | −10 % endast på angränsande emblem | −10 % på angränsande emblem | Projekten överensstämmer |
| Periodvärde | Bästa serien | Visar genomsnittlig matchscore över källturneringar | Deras visade prognos är inte samma storhet som faktisk periodscoring |

## Avgränsning för nästa steg

Steg 1 kartlägger reglerna men avgör inte öppna frågor. Innan en status höjs
behövs den faktiska källan, ett reproducerbart dataprov eller tillräckligt många
tydligt dokumenterade observationer.
