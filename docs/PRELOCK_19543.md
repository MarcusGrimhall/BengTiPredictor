# PGL Wallachia S8 Group — retrospektiv förhandsrekonstruktion

Granskad 2026-09-24. Maskinläsbart roster och käll-ID:n finns i
[`prelock-19543-groupstage.draft.json`](../prelock-19543-groupstage.draft.json).
Detta är en rekonstruktion av uppgifter tillgängliga före spelstart, inte ett
arkiverat fantasy-lock eller en prognos som faktiskt låstes då. Den nuvarande
turneringssidan används bara som efterhandskontroll av namn/positioner.

## Cutoff

**2026-04-18 06:00:00 UTC** (`1776492000`). En [17-aprilsplan från
Offstage](https://www.offstage.ru/dota2/news/raspisanie-pgl-wallachia-season-8)
anger första två serierna kl. 10:00 Moskvatid den 18 april, det vill säga
07:00 UTC. Den första matchen i den lokala OpenDota-filen börjar 07:00:08 UTC.
Vi lägger därför cutoff en timme före annonserad start och kräver att en
historisk karta **slutade strikt före** 06:00. Någon tidsstämplad offentlig
fantasy-lock till sekunden har inte kunnat beläggas. Ett sent annonserat
rosterbyte efter 06:00 skulle kräva ett separat manifest; ingen sådan ändring
har hittats i de granskade källorna.

`rosterKnownAt` är satt till 2026-04-18 00:00 UTC som en konservativ
"känt senast"-tid efter de granskade 16–17-aprilartiklarna. Den är inte
artiklarnas exakta publiceringstid. [Offstage 17 april](https://www.offstage.ru/dota2/news/team-spirit-bez-collapse-tundra-esports-bez-pure-vse-zayavlennye-zameny-na-pgl-wallachia-season-8)
rapporterar att PGL då hade publicerat de fulla laguppställningarna, men vi har
inte hittat en tidsstämplad kopia av PGL:s ursprungliga 80-spelarlista med
Steamkonto-ID:n. Detta begränsar hur starkt manifestet kan kallas förhandslåst.

## Lag och startfemmor

Kolumnerna 1–5 nedan är positioner, inte fantasyklasser. ID inom parentes är
OpenDota/Steam-konto-ID. Fantasyroller härleds som 1+3 Core, 2 Mid och 4+5
Support. [Daterad lagfältlista 17 april](https://rdy.gg/en/dota2/news/pgl-wallachia-season-8-survival-guide-teams-standins-format-schedule-prize-pool),
[daterad ändringslista 17 april](https://dltv.org/news/anons-pgl-wallachia-s8-razbor-sostavov-mnojestvo-zamen-i-format-provedeniya-)
och [GamerLegions femma 31 mars](https://www.offstage.ru/dota2/news/ghost-oficzialno-prisoedinilsya-k-gamerlegion)
är huvudsakliga förhandskällor. För positioner och stavning har vi dessutom
ställt rekonstruktionen mot [turneringens nuvarande historiska
rostersida](https://liquipedia.net/dota2/PGL/Wallachia/8), som kan ha ändrats
efter start och därför inte ensam är förhandsevidens.

| Lag | Pos 1 | Pos 2 | Pos 3 | Pos 4 | Pos 5 |
| --- | --- | --- | --- | --- | --- |
| Team Yandex | watson (171262902) | CHIRA_JUNIOR (312436974) | DM (56351509) | Saksa (103735745) | Malady (93817671) |
| Tundra Esports | V-Tune (152455523) | bzm (93618577) | 33 (86698277) | Ari (346412363) | Whitemon (136829091) |
| PARIVISION | Satanic (1044002267) | No[o]ne- (106573901) | SSS (402583877) | 9Class (164199202) | Dukalis (73401082) |
| Team Spirit | Yatoro (321580662) | Larl (106305042) | Batyuk (140835095) | rue (847565596) | panto (108958769) |
| Xtreme Gaming | Ame (898754153) | NothingToSay (173978074) | Xxs (129958758) | fy (101695162) | xNova (94296097) |
| Team Liquid | m1CKe (152962063) | Nisha (201358612) | Ace (97590558) | Ekki (230487729) | tOfu (16497807) |
| BetBoom Team | Kiritych (172099728) | gpk (480412663) | MieRo (165564598) | Save- (317880638) | Kataomi (196878136) |
| Aurora Gaming | Nightfall (124801257) | Mikoto (301750126) | Ws (126842529) | Mira (256156323) | kaori (320219866) |
| Team Falcons | skiter (100058342) | Malr1ne (898455820) | ATF (183719386) | Cr1t- (25907144) | Sneyking (10366616) |
| HEROIC | Yuma (177203952) | TaiLung (1026694469) | Wisper (292921272) | Thiolicor (105045291) | KJ (81306398) |
| MOUZ | Crystallis (127617979) | lorenof (210053851) | BOOM (190826739) | yamich (9403474) | aik (1202267677) |
| Vici Gaming | shiro (320252024) | Xm (137129583) | Bach (118134220) | XinQ (157475523) | y` (111114687) |
| Natus Vincere | gotthejuice (957204049) | Niku (185590374) | pma (835864135) | daze (919735867) | Riddys (130991304) |
| GamerLegion | Ghost (206642367) | RCY (154974246) | Fayde (160119017) | Bignum (90423751) | Speeed (191362875) |
| Virtus.pro | Timado (97658618) | Abed (154715080) | SaberLight (126212866) | Hellscream (241884166) | Fly (94155156) |
| South America Rejects | Wits (363758022) | DarkMago (352545711) | Frank (252737052) | Scofield (157989498) | Elmisho (1031547092) |

## Sena byten och identitet

Den [daterade ändringslistan](https://www.offstage.ru/dota2/news/team-spirit-bez-collapse-tundra-esports-bez-pure-vse-zayavlennye-zameny-na-pgl-wallachia-season-8)
anger Batyuk för Collapse, DM för Noticed, V-Tune för Pure, Ekki för Boxi och
lorenof för MidOne. Den nämner Korb3n och Malik som **möjliga reserver** för
Spirit respektive Yandex. De är inte med i startfemmorna och deras deltagande
vid ett hypotetiskt fantasy-lock är inte bevisat. [DLTV:s förhandsartikel](https://dltv.org/news/anons-pgl-wallachia-s8-razbor-sostavov-mnojestvo-zamen-i-format-provedeniya-)
rapporterar också XinQ:s återkomst, daze för Zayac, Virtus.pro för OG samt
South America Rejects för paiN Gaming. [Team Yandex-femman med DM finns
redan 16 april](https://www.offstage.ru/dota2/news/dm-zayavlen-offlejnerom-team-yandex-na-pgl-wallachia-season-8).

Konto-ID:n kontrollerades mot lokalt cachade råmatcher som slutade före cutoff.
Efter återhämtning av PGL Wallachia S4 har **80/80 konton** minst en sådan
match; match-ID, tid, alias och källturnering finns per spelare i
[`roster-identity-19543.json`](reports/roster-identity-19543.json).
Elva kanoniska namn skiljer sig typografiskt från råmatchalias, exempelvis
`watson`/`医者watson\``, `KJ`/`KingJungles` och `ATF`/`AMMAR_THE_F`.
Ingen kontokollision hittades, men ett äldre matchalias bevisar endast
kontokopplingen och inte att spelaren var registrerad i S8:s startfemma före
cutoff. Just den sista kopplingen vilar på de daterade rosterkällorna ovan.

## Ny källinventering

De 80 ID:n är exakt samma mängd som i den tidigare diagnostiska körningen.
Livekörningen med detta manifest avbröts av HTTP 522 från OpenDotas stora
Explorer-fråga, även uppdelad i batcher. Den tidigare rapporten hade cutoff
07:00 UTC; den nya har 06:00 UTC, och även 365-dagarsfönstrets start flyttas
en timme. Vi frågade OpenDota om de fem ligamatcher som kan ändra inventeringen i de två
ändrade timintervallen (match-ID 8258990124, 8259003110, 8259013593,
8775919432, 8775922536) och därefter om deras deltagande konton: **ingen**
av S8:s 80 spelare deltog. Därför är eventlistan och spelarmedverkan
ekvivalenta vid den nya cutoffen. Den explicit omräknade, märkta rapporten
ligger i `data/audits/source-events-19543-prelock.json` (gitignorerad), och
grupperingen av alla 84 länkade event finns i
[`source-selection-19543.json`](reports/source-selection-19543.json).

Urvalet omfattar 20 internationella huvudevent, 30 separata kvalevent och
34 övriga ligor. Den polska landslagskvalificeringen 18045 räknas som övrig,
inte som kval till ett av de valda internationella huvudeventen. OpenDotas
`premium`/`professional` är ett sökfilter, inte ett kvalitetsbeslut. Eventens
individuella arrangörskälla och status finns i urvalsrapporten. Att en källa
är vald garanterar inte exakt data; varje event måste fortfarande klara
90-procentsgrinden. Fem månader är endast ett fönster att testa i steg 2.

## Återupptagbar manifesthämtning

`npm run prepare-sources` använder den kontobaserade inventeringen och det
manuellt granskade urvalet ovan. S8-körningen återanvände den förenade
Explorer-rapporten därför att livefrågan gav HTTP 522; samma 80 ID:n och den
ändrade timgränsen kontrollerades som beskrivet ovan. I en ny origin kör
skriptet `discover-sources` direkt. Validerade cachemanifest sparas atomiskt och
behålls vid avbrott. S8:s [körningsrapport](reports/prepare-sources-19543.md)
redovisar alla 20 källor, rå-/replayluckor och kvarstående identitetsosäkerhet.
Inget historikfönster är valt och ingen modell har tränats.
