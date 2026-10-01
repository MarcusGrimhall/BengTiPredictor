# PGL Wallachia S8: återhämtning av historiska källor

**Läge 2026-10-01, efter regelbytet för negativa Stuns:** `recover-sources`
kördes om för de sex blockerade källorna. Tre passerar nu exakt-dataauditen:
BLAST Slam III 42/43, PGL Wallachia S4 115/115 och Esports World Cup 2025
89/89. Därmed är **17 av 20** huvudevent godkända. FISSURE Universe 5 avbröts
efter 62 av 116 replayer (61 exakta kartor). DreamLeague 26 och PGL Wallachia
S5 har kompletta råmatcher men ännu inga replayer. Ingen av de tre får
tränas som exakt källa förrän replayhämtningen är klar och auditen passerar.
Tabellen nedan är den ursprungliga snapshoten från 2026-09-25.

Avslutad 2026-09-25 från cachade S8-manifest och råmatcher. Slutrapporten finns
i `data/audits/recover-sources-19543.json`. **14 av 20** valda huvudevent
passerar grinden för minst 90 % exakta kartor: **1 665/1 716** kartor i dessa
event. Återupptagningen krävde **0 nya råmatchanrop och 0 replaynedladdningar**.
Sex event var blockerade i denna körning; inga av dem fick då tränas som exakta källor.

| Turnering (ID) | Exakta kartor | Slutläge |
| --- | ---: | --- |
| BLAST Slam III (17418) | 37/43 | Blockerad |
| BLAST Slam IV (17419) | 96/96 | Godkänd |
| BLAST Slam V (17420) | 92/94 | Godkänd |
| PGL Wallachia S4 (18058) | 44/115 | Blockerad |
| FISSURE Universe 5 (18107) | 0/116 | Blockerad |
| DreamLeague 26 (18111) | 0/202 | Blockerad |
| TI 2025 (18324) | 130/144 | Godkänd |
| PGL Wallachia S5 (18358) | 0/116 | Blockerad |
| Clavision Snow-Ruyi (18359) | 82/85 | Godkänd |
| Esports World Cup 2025 (18375) | 0/89 | Blockerad |
| FISSURE Universe 6 (18433) | 106/117 | Godkänd |
| FISSURE Universe 7 (18633) | 73/75 | Godkänd |
| FISSURE Playground 2 (18863) | 123/124 | Godkänd |
| DreamLeague 27 (18988) | 206/206 | Godkänd |
| PGL Wallachia S6 (18920) | 116/118 | Godkänd |
| BLAST Slam VI (19099) | 98/100 | Godkänd |
| FISSURE Universe 8 (19239) | 95/96 | Godkänd |
| DreamLeague 28 (19269) | 192/195 | Godkänd |
| ESL One Birmingham 2026 (19422) | 136/142 | Godkänd |
| PGL Wallachia S7 (19435) | 120/124 | Godkänd |

## Varför sex källor är blockerade

Alla **104** råmatchfel i de sex eventen är negativa `stuns`-värden, ett per
karta. De gäller Pangolier (hero 120) i 101 kartor, hero 11 i två och hero 39
i en. Därmed ligger den högsta möjliga exakta täckningen under 90 %-kravet
redan före replayfasen:

| Turnering | Negativa kartor | Tak | Krävs |
| --- | ---: | ---: | ---: |
| BLAST Slam III | 5 | 38/43 | 39 |
| PGL Wallachia S4 | 12 | 103/115 | 104 |
| FISSURE Universe 5 | 16 | 100/116 | 105 |
| DreamLeague 26 | 36 | 166/202 | 182 |
| PGL Wallachia S5 | 22 | 94/116 | 105 |
| Esports World Cup 2025 | 13 | 76/89 | 81 |

[OpenDotas parser](https://github.com/odota/parser/blob/master/src/main/java/opendota/Parse.java)
kopierar `m_vecDataTeam.*.m_fStuns` från replayens lagstatistik. Därför är de
negativa talen inte skapade av projektets extraktor. Från 2026-10-01 behålls
de enligt ägarens antagna regel även om direkt klientverifiering saknas.
Denna rapport är en historisk snapshot och har inte körts om efter regelbytet.
De låga dåvarande
exaktantalen i de blockerade eventen beror också på att replayhämtning med
avsikt hoppades över när råfältstaket redan låg under grinden.
