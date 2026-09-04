package se.bengti;

import skadistats.clarity.model.Entity;
import skadistats.clarity.model.FieldPath;
import skadistats.clarity.processor.entities.OnEntityCreated;
import skadistats.clarity.processor.entities.OnEntityUpdated;
import skadistats.clarity.processor.runner.SimpleRunner;
import skadistats.clarity.source.MappedFileSource;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class ReplayStats {
    private static final Pattern PLAYER_FIELD = Pattern.compile(
        "m_vecDataTeam\\.(\\d{4})\\.(m_iPlayerSteamID|m_iSmokesUsed|m_iNeutralTokensFound|"
            + "m_iWatchersTaken|m_iLotusesTaken|m_iTormentorKills|m_iCourierKills|"
            + "m_nAcquiredMadstone|m_nCurrentMadstone)"
    );
    private final Map<String, Entity> teamData = new LinkedHashMap<>();

    private void remember(Entity entity) {
        String name = entity.getDtClass().getDtName();
        if (name.equals("CDOTA_DataRadiant") || name.equals("CDOTA_DataDire")) {
            teamData.put(name, entity);
        }
    }

    @OnEntityCreated
    public void onCreated(Entity entity) { remember(entity); }

    @OnEntityUpdated
    public void onUpdated(Entity entity, FieldPath[] ignored, int count) { remember(entity); }

    private static Number number(Object value) {
        return value instanceof Number n ? n : 0L;
    }

    private void printJson() {
        System.out.print("{\"players\":[");
        boolean firstPlayer = true;
        for (Map.Entry<String, Entity> team : teamData.entrySet()) {
            Map<String, Map<String, Number>> rows = new LinkedHashMap<>();
            Entity entity = team.getValue();
            for (FieldPath path : entity.getDtClass().collectFieldPaths(entity.getState())) {
                String field = entity.getDtClass().getNameForFieldPath(path);
                Matcher matcher = PLAYER_FIELD.matcher(field);
                if (!matcher.matches()) continue;
                rows.computeIfAbsent(matcher.group(1), unused -> new LinkedHashMap<>())
                    .put(matcher.group(2), number(entity.getPropertyForFieldPath(path)));
            }
            for (Map.Entry<String, Map<String, Number>> player : rows.entrySet()) {
                Map<String, Number> row = player.getValue();
                if (!firstPlayer) System.out.print(',');
                firstPlayer = false;
                long steamId = row.getOrDefault("m_iPlayerSteamID", 0L).longValue();
                long accountId = steamId > 76561197960265728L ? steamId - 76561197960265728L : 0L;
                String side = team.getKey().endsWith("Radiant") ? "radiant" : "dire";
                System.out.printf(
                    "{\"side\":\"%s\",\"index\":%d,\"accountId\":%d,"
                        + "\"lotuses\":%d,\"watchers\":%d,\"madstones\":%d,"
                        + "\"tormentor\":%d,\"smokes\":%d,\"courier\":%d,"
                        + "\"acquiredMadstone\":%d,\"currentMadstone\":%d}",
                    side,
                    Long.parseLong(player.getKey()),
                    accountId,
                    row.getOrDefault("m_iLotusesTaken", 0).longValue(),
                    row.getOrDefault("m_iWatchersTaken", 0).longValue(),
                    row.getOrDefault("m_iNeutralTokensFound", 0).longValue(),
                    row.getOrDefault("m_iTormentorKills", 0).longValue(),
                    row.getOrDefault("m_iSmokesUsed", 0).longValue(),
                    row.getOrDefault("m_iCourierKills", 0).longValue(),
                    row.getOrDefault("m_nAcquiredMadstone", 0).longValue(),
                    row.getOrDefault("m_nCurrentMadstone", 0).longValue()
                );
            }
        }
        System.out.println("]}");
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 1) throw new IllegalArgumentException("Usage: replay-stats <replay.dem>");
        ReplayStats processor = new ReplayStats();
        try (MappedFileSource source = new MappedFileSource(args[0])) {
            new SimpleRunner(source).runWith(processor);
        }
        processor.printJson();
    }
}
