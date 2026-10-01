# PGL Wallachia S8: källmanifest, steg 1

Kört 2026-09-24 med `prelock-19543-groupstage.draft.json`, cutoff
**2026-04-18 06:00 UTC**, 365 dagars inventering. Det kompletta maskinella
protokollet finns i `data/audits/prepare-sources-19543.json` (lokal cache).
[Rosterbevis och cutoff](../PRELOCK_19543.md) och
[alla 84 källklassningar](source-selection-19543.json) är separata underlag.

## Hämtning och checkpoint

- 16 lag × 5 positioner; alla 80 konto-ID:n har minst en kontrollerad råmatch
  före cutoff. Detta styrker kontokopplingen, inte en arkiverad PGL-registrering.
- 84 kontolänkade ligor: **20 internationella huvudevent**, **30 kval** i egen
  kategori och **34 övriga** dokumenterade. Inga klassningar saknas.
- Alla **20/20 godkända huvudevent har nu matchmanifest**, tillsammans 2 397
  kartor. **11 manifest hämtades** av skriptet; 9 fanns redan i cache. Ingen
  manifesthämtning misslyckades. Återkörning med `--limit 0` gav 20 cacheträffar
  och 0 nya API-anrop, medan rapporten bevarade de 11 tidigare hämtningarna.
- Ingen råmatch eller replay hämtades av det nya skriptet. Tidigare manuell
  hämtning stoppades vid atomiska cachecheckpointen. Den har lämnat vissa
  rå- och replayfiler som räknas nedan.

## Datastatus per godkänd källa

`Rå` och `replay` betyder att cachefilen finns, inte att innehållet är exakt.
Sex event har sedan tidigare en giltig exakt-dataaudit som passerar 90 %.
Frågetecken betyder att någon aktuell godkänd audit saknas; ingen sådan källa
får användas för träning ännu.

| ID | Huvudevent | Manifest | Rå | Replay | Exakt audit |
| ---: | --- | ---: | ---: | ---: | --- |
| 18058 | PGL Wallachia S4 | 115 | 115 | 49 | ? |
| 17418 | BLAST Slam III | 43 | 42 | 29 | ? |
| 18107 | FISSURE Universe 5 | 116 | 102 | 0 | ? |
| 18111 | DreamLeague 26 | 202 | 0 | 0 | ? |
| 18358 | PGL Wallachia S5 | 116 | 0 | 0 | ? |
| 18375 | Esports World Cup 2025 | 89 | 0 | 0 | ? |
| 18433 | FISSURE Universe 6 | 117 | 0 | 0 | ? |
| 18359 | Clavision Snow-Ruyi | 85 | 0 | 0 | ? |
| 18324 | TI 2025 | 144 | 144 | 0 | ? |
| 18633 | FISSURE Universe 7 | 75 | 0 | 0 | ? |
| 17419 | BLAST Slam IV | 96 | 0 | 0 | ? |
| 18863 | FISSURE Playground 2 | 124 | 0 | 0 | ? |
| 18920 | PGL Wallachia S6 | 118 | 0 | 0 | ? |
| 17420 | BLAST Slam V | 94 | 0 | 0 | ? |
| 18988 | DreamLeague 27 | 206 | 206 | 206 | 206/206, godkänd |
| 19239 | FISSURE Universe 8 | 96 | 96 | 96 | 95/96, godkänd |
| 19099 | BLAST Slam VI | 100 | 100 | 100 | 98/100, godkänd |
| 19269 | DreamLeague 28 | 195 | 195 | 195 | 192/195, godkänd |
| 19435 | PGL Wallachia S7 | 124 | 124 | 123 | 120/124, godkänd |
| 19422 | ESL One Birmingham 2026 | 142 | 142 | 142 | 136/142, godkänd |

Totalt saknas **1 131 råmatchfiler** och **1 457 replayfiler** i de 20
manifesten. De 14 raderna med `?` saknar en godkänd aktuell exakt-dataaudit.
Råmatcherna i TI 2025 och andra befintliga filer kan vara otillräckliga även
när filen finns; filantalet är därför bara en inventering. Nästa separat
återhämtningssteg måste hämta råmatcher/replays och köra kvalitetsgrinden.

## Osäkra fall och fel

- S8-rostret är en **retrospektiv förhandsrekonstruktion**. Daterade artiklar
  anger lagen och inhoppare före start, och tidigare matcher bekräftar varje
  konto-ID, men någon arkiverad, tidsstämplad PGL-lista med alla 80 konto-ID:n
  har inte hittats. Det får inte beskrivas som ett faktiskt förhandslåst test.
- Elva råmatchalias skiljer sig från kanoniska spelarnamn: watson, Malady,
  Ace, Kiritych, gpk, Kataomi, Ws, ATF, KJ, DarkMago och Frank. Konto-ID,
  match-ID, alias och tider finns i
  [identitetsrapporten](roster-identity-19543.json).
- Livekörningen av OpenDotas stora Explorer-fråga gav HTTP 522. Den använda
  inventeringen återanvänder tidigare kontobaserad `discover-sources`-utdata;
  de 80 ID:n är samma mängd och inga av dem förekom i de matcherna som kunde
  ändra inventeringen när cutoff flyttades från 07:00 till 06:00 UTC. Beviset
  redovisas i [rosterdokumentet](../PRELOCK_19543.md).
- Manifesten hade inga ogiltiga ID:n, sena matcher eller avvikande antal mot
  OpenDotas upptäckta eventkartor. Kval och övriga ligor hämtades inte.

Fem månaders historik är fortfarande en **kandidat för steg 2**. Ingen modell
har tränats eller jämförts i denna körning.
