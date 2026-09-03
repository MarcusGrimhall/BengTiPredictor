# Arbetsplan

Målet är att vanliga spelare ska kunna lita på att reglerna och matchdatan är
korrekt hanterade, utan att behöva förstå modellen bakom resultatet.

Vi gör ett steg i taget. Efter varje steg granskar vi resultatet innan nästa
steg påbörjas.

## Steg 1 — Lista reglerna

- Samla alla regler projektet använder.
- Märk varje regel som bekräftad, uppmätt, antagen eller okänd.
- Notera vilka regler som påverkar resultatet mest.

**Klart när:** varje regel har en källa eller uttryckligen är märkt som osäker.

## Steg 2 — Jämför med referensprojektet

- Jämför regler och beräkningar med `dota2-fantasy-optimizer-2026`.
- Dokumentera skillnader utan att anta att något av projekten automatiskt har
  rätt.
- Bestäm vilken evidens som skulle kunna avgöra varje skillnad.

**Klart när:** varje relevant skillnad är förklarad eller lämnad som en tydlig
öppen fråga.

## Steg 3 — Kontrollera datahämtningen

- Följ varje stat från API-svar till visat resultat.
- Kontrollera saknade, nollställda och ofullständigt parsade värden.
- Kontrollera att målturneringen aldrig läcker in i träningsdatan.
- Lägg till tester för problem som kan ge trovärdiga men felaktiga siffror.

**Klart när:** varje använd stat har ett känt ursprung och ett automatiskt
rimlighetstest.

## Steg 4 — Rätta en regel i taget

- Börja med den osäkerhet som påverkar råden mest.
- Samla evidens innan beteendet ändras.
- Lägg till test, ändra kod och uppdatera dokumentation tillsammans.
- Kör `npm run validate` och `npm run build` efter varje ändring.

**Klart när:** ändringen är testad, dokumenterad och dess effekt på resultaten
är redovisad.

## Steg 5 — Visa osäkerhet för spelaren

- Visa enkelt om ett råd bygger på bekräftade eller antagna regler.
- Förklara varför ett alternativ rekommenderas.
- Undvik att utse en vinnare när alternativen inte går att skilja säkert.

**Klart när:** en spelare kan förstå både rådet och hur säkert det är utan att
läsa projektdokumentationen.

## Steg 6 — Förbättra modellen

- Arbeta först nu med bättre prognoser, kalibrering och optimering.
- Mät varje förbättring mot nuvarande validering och en enkel baslinje.

**Klart när:** förbättringen fungerar på data den inte tränades på och inte
försämrar redan verifierat beteende.

## Närmast

**Steg 1 — Lista reglerna** är kartlagt och användargranskat i `RULE_AUDIT.md`.
Granskningen 2026-09-03 avgjorde token-expiry, det obligatoriska traitläget och
att en quality-reroll inte kan ge samma tier. Replayintegrationen är nu
genomförd: exakta game-state-räknare används där överlägg finns, med kalibrerade
fallbacks för äldre matcher. No-repeat mellan deals och Deaths-golvet är fortsatt
uttryckliga antaganden. Nästa kontrollpunkt är **steg 2 — jämför med
referensprojektet**.
