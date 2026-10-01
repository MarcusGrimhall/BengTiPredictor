// Reviewed source metadata corrections. Raw OpenDota caches are never edited.
// 997639 is assigned to two different opponent pairs in Clavision Snow-Ruyi:
// two maps Team Yandex–9131584 and one Team Yandex–8255888. A series cannot
// change opponent, so the singleton gets a distinct synthetic numeric ID.
const corrections = new Map([
  [8392583515, { leagueId: 18359, rawSeriesId: 997639,
    teams: [8255888, 9823272], seriesId: -8392583515 }]
]);

export function sourceSeriesId(match) {
  const correction = corrections.get(match.match_id);
  if (!correction) return match.series_id || -match.match_id;
  const teams = [match.radiant_team_id, match.dire_team_id].sort((a, b) => a - b);
  if (match.leagueid !== correction.leagueId || match.series_id !== correction.rawSeriesId
    || teams[0] !== correction.teams[0] || teams[1] !== correction.teams[1]) {
    throw new Error(`Series correction evidence changed for match ${match.match_id}`);
  }
  return correction.seriesId;
}
