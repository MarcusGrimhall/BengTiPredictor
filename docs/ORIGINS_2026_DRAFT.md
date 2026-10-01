# Testorigin 2026 — steg 1, arbetsutkast

Påbörjad 2026-09-24. Turneringsurvalet nedan valdes samma dag för att omfatta
flera format; roster, cutoff och källturneringsregel är ännu inte godkända.
Detta är alltså inte färdiga förhandsmanifest eller frysta modellval. Resultat
från målturneringarna får inte användas för att ändra urvalet i efterhand.

## Valda kronologiska origin

| Origin | OpenDota-ID | Första observerade karta (UTC) | Hela observerade fältet | Exakta kartor vid inventering | Roll i testet |
| --- | ---: | --- | ---: | ---: | --- |
| DreamLeague S28 | 19269 | 2026-02-16 10:55 | 16 lag, 83 spelare | 192/195 | Tidig utvecklingsorigin; formatet behöver särskild periodmappning |
| PGL Wallachia S7 | 19435 | 2026-03-07 08:00 | 16 lag, 81 spelare | 120/124 | Utvecklingsorigin; granska extra spelare/inhoppare |
| ESL One Birmingham | 19422 | 2026-03-22 11:59 | 16 lag, 80 spelare | 136/142 | Utvecklingsorigin |
| PGL Wallachia S8 | 19543 | 2026-04-18 07:00 | 16 lag, 80 spelare | 118/119 | Senare kronologisk utvecklingsorigin |
| Esports World Cup | 19785 | 2026-07-07 09:24 | 24 lag, 120 spelare | 156/157 | Senare retrospektivt test av större fält; använd alla 24 lag |
| TI 2026 | 19719 | 2026-08-13 03:03 | 16 lag, 80 spelare | 145/147 | Senare retrospektivt test; förhandsroster och konservativ cutoff finns i `PRELOCK_19719.md` |
| PGL Wallachia S9 | 20279 | 2026-09-19 07:00 | 16 lag, 80 spelare | 79/83 per 2026-09-24 | Retrospektiv 16-lagsgeneralrepetition; turneringen pågår |

Observerade spelare kan omfatta reserver eller byten och är inte ett förhandsroster.
Tiderna i tabellen kommer från matchdata och är inte godkända locktider.
Täckningen kommer från lokala `data/audits/league-ID.json`; Wallachia S9 är
ännu inte färdigspelad. Det slutliga urvalet ska beslutas på turneringarnas
egenskaper och historisk tillgänglighet, inte på dessa resultat eller vilken
modell som råkar prestera bäst.

## Tre skilda tids- och urvalsbeslut

- **Informationscutoff:** sista tid då en uppgift fick vara känd för prognosen.
  Sätts konservativt vid målturneringens roster-/fantasy-lock, eller före dess
  första schemalagda match när lock inte kan beläggas. Ingen historisk match får
  sluta vid eller efter denna tid.
- **Insamlingshorisont:** hämta tillräckligt bred historik före cutoff för att
  jämföra flera historikfönster på samma underlag. Att hämta en äldre match
  innebär inte att modellen måste ge den vikt.
- **Modellens historikfönster:** exempelvis fem månader före cutoff är en
  kandidat att pröva i steg 2 mot kortare och längre fönster, inte själva
  informationscutoffen. Frys både datumdefinition och eventuell halveringstid
  först efter kronologiska tester.

### Föreslagen källturneringsregel v0.2

För en origin med informationscutoff `T` upptäcks ligor genom konto-ID för
hela det daterade målfältet, oberoende av spelarnas gamla lag. Inventera alla
OpenDota-ligor som har minst en sådan spelares karta inom de sista 365 dagarna
före `T`. Ett event får användas som källa endast om hela eventet var färdigt
före `T`; modellens fönster avgör sedan vilka av dess kartor som får vikt.

Gruppera event med kriterier som kan beläggas före origin:

- **Huvudbank:** internationellt huvudevent på proffsnivå med ett annonserat
  fält om minst åtta lag, inte kval, division 2 eller uppvisning. Hela eventet
  ingår om minst ett målrosterkonto spelade där.
- **Kvalbank:** officiella kval till sådana huvudevent, separat märkta. Modeller
  med och utan kvalhistorik blir förregistrerade alternativ i steg 2.
- **Övriga proffsligor:** kvar i inventeringen för granskning, men inkluderas
  inte automatiskt bara för att OpenDota ger dem etiketten `professional`.

Inga målresultat eller replaytäckningar får styra grupperingen. Ett valt
källevent omfattar alla dess kartor i 90-procentsgrinden; misslyckad täckning
redovisas och återhämtas, inte tyst filtreras bort. Namn, format, fältstorlek
och eventuella undantag måste styrkas med daterade arrangörskällor innan
urvalet är fryst. Den nuvarande TI-listan med 17 källor är inte bevis för att
denna regel är fullständigt tillämpad.

Modellen kan senare välja fem månader eller ett annat fönster inom detta
bredare insamlade år. Att en källa samlas in ger inte dess äldre kartor
automatiskt vikt i femmånadersmodellen.

## Spelaridentitet och ändrad kontext

OpenDota-konto-ID är kopplingsnyckeln mellan matcher, men ett namn eller en
nutida laglista räcker inte som historiskt identitetsbevis. Konto-ID-kopplingar
ska kontrolleras mot daterade namn-/rosterkällor och matchidentiteter; tvetydiga
alias eller kontobyten kräver särskild granskning.

Historiska exakta matchrader kan normalt återanvändas ur cachen. För varje
origin måste spelarens underlag ändå byggas om med endast matcher före dess
cutoff. Behåll då historiskt lag, lane/rollindikation, patch och tid per match.
Fastställ separat vilket lag och vilken fantasyposition spelaren hade vid
målturneringens lock. Lag- eller positionsbyte får inte bakåtskriva gamla
matchers kontext; dess effekt på modell och osäkerhet hör till steg 2.

## Underlag som finns och som saknas

- TI 2026 har ett granskat förhandsroster, roller och en konservativ cutoff:
  [`PRELOCK_19719.md`](PRELOCK_19719.md). Dess 17 källturneringar är fortfarande
  ett forskningsurval utan fastställd generell urvalsregel.
- [PGL:s S9-sida](https://www.pglesports.com/dota2/wallachia-s9-2026/)
  anger 16 lag, Swiss Group och dubbel eliminering i Playoffs. Sidan listar
  lagnamn men inte konto-ID:n, positioner eller publiceringstid för varje roster.
- En [förhandsartikel från 18 september](https://www.offstage.gg/dota2/news/pgl-wallachia-season-9-preview-format-rosters-and-schedule-for-day-1)
  listar fem spelare per S9-lag i positionsordning och markerar inhoppare hos
  1w, Aurora och Team Nemesis. Artikeln saknar OpenDota-konto-ID:n och anger
  ett playoffformat som motsäger PGL. Använd den som rosterkandidat, inte som
  ensam verifiering av identitet eller format. Kontrollera också om sidan
  ändrats efter publicering.
- För övriga origin saknas ännu daterade roster-/positionskällor, granskade
  reservbyten, officiella periodgränser och en konservativ cutoff.

### Pilot: PGL Wallachia S8

S8 är första pilot för att pröva arbetsflödet, inte ett event vars utfall ska
styra modellvalet. Den lokala auditen har 118/119 exakta kartor och den
genererade resultatfilen har 16 lag och 80 observerade spelare. Ändå beskriver
en [artikel publicerad 17 april, före första matchen](https://dltv.org/news/anons-pgl-wallachia-s8-razbor-sostavov-mnojestvo-zamen-i-format-provedeniya-)
inhoppare eller ersättare hos Team Yandex, Tundra, Team Spirit, MOUZ och Team
Liquid samt OG → Virtus.pro och paiN Gaming → South America Rejects. Den visar
varför en lista byggd ur spelade matcher eller antal observerade spelare inte
får användas som förhandsroster. Artikeln är ett första daterat förändringsspår;
varje uppgift behöver kopplas till fem faktiska spelare, positioner och
konto-ID:n vid den valda cutoffen.

Med **endast de sex redan cachade exakta källeventen före en provisorisk cutoff
2026-04-18 07:00 UTC** finns 847 exakta kartor. När S8:s observerade 80
konton används som *diagnostisk proxy* har 72 minst 20 historiska exakta kartor
och åtta färre: XinQ 0, daze 9, aik 10, Ghost 14, Batyuk 15, V-Tune 15, Bach
18 och Xm 18. Detta är inte ett godkänt förhandsroster eller en slutlig
täckningssiffra. Alla sex cachade event ligger inom cirka fem månader före S8;
för att jämföra fem månader mot längre fönster på samma origin måste äldre
relevanta event hittas och granskas.

Det befintliga `discover --target` följer bara mållagens team-ID och söker
`--months 12` som 360 dagar; det kan missa spelares tidigare lag och de fem
äldsta dagarna i den föreslagna 365-dagarsregeln. Sökresultat därifrån är
ledtrådar, inte bevis på en fullständig källpopulation.

En kontobaserad OpenDota-inventering med `discover-sources` och samma
provisoriska S8-rosterproxy gav 84 länkade ligor: 78 är färdigspelade och
klassade `premium`/`professional`, varav 72 saknar lokalt matchmanifest. En
första namnbaserad sortering pekar ut 20 internationella huvudevent, sex med
lokalt manifest och 14 utan. Det är en arbetslista, inte en validerad
arrangörsklassificering. Den visar att den breda OpenDota-etiketten ensam skulle
kräva mycket återhämtning från regionala ligor och kval av olika nivå.
Kommandots förhandsmanifestläge provkördes separat med TI 2026:s granskade
Group-roster: 80 konton gav 82 länkade ligor och 74 färdiga
`premium`/`professional`-kandidater. Detta kontrollerar att läget fungerar, men
klassar inte heller dessa ligor automatiskt.

| Tidigare huvudevent i S8-piloten | ID | S8-konton där | Matchmanifest |
| --- | ---: | ---: | --- |
| PGL Wallachia S4 2025 | 18058 | 50 | Saknas |
| BLAST Slam III | 17418 | 40 | Saknas |
| FISSURE Universe 5 | 18107 | 36 | Saknas |
| DreamLeague 26 | 18111 | 42 | Saknas |
| PGL Wallachia S5 2025 | 18358 | 46 | Saknas |
| Esports World Cup 2025 | 18375 | 51 | Saknas |
| FISSURE Universe 6 | 18433 | 42 | Saknas |
| Clavision Snow-Ruyi 2025 | 18359 | 28 | Saknas |
| TI 2025 | 18324 | 49 | Saknas; äldre genererad summering är inte exakt |
| FISSURE Universe 7 | 18633 | 31 | Saknas |
| BLAST Slam IV | 17419 | 37 | Saknas |
| FISSURE Playground 2 | 18863 | 51 | Saknas |
| PGL Wallachia S6 2025 | 18920 | 48 | Saknas |
| BLAST Slam V | 17420 | 31 | Saknas |
| DreamLeague 27 | 18988 | 66 | Finns |
| FISSURE Universe 8 | 19239 | 32 | Finns |
| BLAST Slam VI | 19099 | 41 | Finns |
| DreamLeague 28 | 19269 | 56 | Finns |
| PGL Wallachia S7 2026 | 19435 | 58 | Finns |
| ESL One Birmingham 2026 | 19422 | 55 | Finns |

`S8-konton där` räknar bara kontomedverkan som OpenDota nu kopplar till
eventet; det är inte ett mått på exakta fantasystatvektorer. Tabellen måste
uppdateras med ett verifierat förhandsroster innan källurvalet fastställs.

XinQ har noll kartor i de sex cachade källeventen men förekommer i flera äldre
huvudevent inom året. En femmånadersmodell kan ändå behöva fallback för honom
om de kartorna ligger utanför sitt fönster. Andra spelare med tunn cachad
historik syns främst i kval; därför ska kvalbanken testas separat i stället
för att antingen blandas in utan märkning eller kastas bort.

## Beslut och arbete innan steg 1 kan stängas

1. Välj en kommande turnering för ett faktiskt förhandstest när en sådan är
   annonserad. Behåll hela deltagarfältet för varje origin ovan. Alla sju
   listade event är retrospektiva; Wallachia S9 hade redan börjat när
   inventeringen gjordes.
2. Fastställ den föreslagna källturneringsregeln med dokumenterade
   arrangörskällor. Den kontobaserade pilotinventeringen finns; upprepa den med
   verifierade förhandsroster för varje origin och klassificera även relevanta
   event utan lokalt cachemanifest. En misslyckad datagrind ska dokumenteras
   och återhämtas, inte döljas genom att ta bort ett besvärligt event efteråt.
3. För varje origin: spara daterad laglista och position 1–5 per lag. Koppla
   spelarna till konto-ID:n med en automatisk jämförelse av källista och
   matchidentiteter; granska tvetydigheter, avvikelser och inhoppare manuellt.
   Mappa 1+3 till Core, 2 till Mid och 4+5 till Support. Spara källa och tid då
   varje roster senast var känd. Ändringar ska ha egna tidsstämplade poster.
4. Ta en konservativ cutoff från publicerat schema eller faktisk fantasy-lock.
   Den ska ligga före första tillåtna målmatchen. Kontrollera tidszoner och
   dokumentera varför just tidpunkten valdes.
5. Bekräfta Group/Playoff-format och periodgränser mot arrangören. Skilj
   förhandskänd information från sådant som bara går att fastställa efteråt.
6. Bygg ett manifest per origin enligt `EXACT_PIPELINE.md`. Kör
   `validatePreparation` och jämför konto-ID:n/roller mot källorna; `train`
   och prognosval hör till senare steg.

Ett origin är redo för steg 2 först när hela förhandsfältet, konton, roller,
cutoff, källurvalsregel och avvikelser kan återskapas från daterad evidens.
