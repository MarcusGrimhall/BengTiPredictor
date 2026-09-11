package se.bengti;

import skadistats.clarity.model.Entity;
import skadistats.clarity.model.FieldPath;
import skadistats.clarity.processor.entities.OnEntityCreated;
import skadistats.clarity.processor.entities.OnEntityUpdated;
import skadistats.clarity.processor.runner.SimpleRunner;
import skadistats.clarity.processor.reader.OnMessage;
import skadistats.clarity.wire.shared.demo.proto.Demo.CDemoFileInfo;
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
    private Entity resource;
    private Long matchId;

    @OnMessage(CDemoFileInfo.class)
    public void onFileInfo(CDemoFileInfo info) {
        if (info.hasGameInfo() && info.getGameInfo().hasDota()
            && info.getGameInfo().getDota().hasMatchId()) {
            matchId = info.getGameInfo().getDota().getMatchId();
        }
    }

    private final Map<String, Entity> teamData = new LinkedHashMap<>();

    private void remember(Entity entity) {
        String name = entity.getDtClass().getDtName();
        if (name.equals("CDOTA_PlayerResource")) resource = entity;
        if (name.equals("CDOTA_DataRadiant") || name.equals("CDOTA_DataDire")) {
            teamData.put(name, entity);
        }
    }

    @OnEntityCreated
    public void onCreated(Entity entity) { remember(entity); }

    @OnEntityUpdated
    public void onUpdated(Entity entity, FieldPath[] ignored, int count) { remember(entity); }

    private static Number number(Object value) {
        return value instanceof Number n ? n : null;
    }

    private void printJson() {
        if (matchId == null) throw new IllegalStateException("Missing replay match metadata");
        Map<Long, Number> teamfight = new LinkedHashMap<>();
        if (resource != null) {
            Map<String, Number> steamIds = new LinkedHashMap<>();
            Map<String, Number> participation = new LinkedHashMap<>();
            for (FieldPath path : resource.getDtClass().collectFieldPaths(resource.getState())) {
                String field = resource.getDtClass().getNameForFieldPath(path);
                String[] parts = field.split("\\.");
                if (parts.length != 3) continue;
                Number value = number(resource.getPropertyForFieldPath(path));
                if (value == null) continue;
                if (parts[0].equals("m_vecPlayerData") && parts[2].equals("m_iPlayerSteamID")) steamIds.put(parts[1], value);
                if (parts[0].equals("m_vecPlayerTeamData") && parts[2].equals("m_flTeamFightParticipation")) participation.put(parts[1], value);
            }
            for (Map.Entry<String, Number> entry : steamIds.entrySet()) {
                teamfight.put(entry.getValue().longValue(), participation.get(entry.getKey()));
            }
        }
        System.out.print("{\"matchId\":" + matchId + ",\"players\":[");
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
                long steamId = row.get("m_iPlayerSteamID") == null ? 0L : row.get("m_iPlayerSteamID").longValue();
                long accountId = steamId > 76561197960265728L ? steamId - 76561197960265728L : 0L;
                String side = team.getKey().endsWith("Radiant") ? "radiant" : "dire";
                System.out.printf(
                    "{\"side\":\"%s\",\"index\":%d,\"accountId\":%d,"
                        + "\"lotuses\":%s,\"watchers\":%s,\"madstones\":%s,"
                        + "\"tormentor\":%s,\"smokes\":%s,\"courier\":%s,"
                        + "\"acquiredMadstone\":%s,\"currentMadstone\":%s,\"teamfight\":%s}",
                    side,
                    Long.parseLong(player.getKey()),
                    accountId,
                    row.get("m_iLotusesTaken"),
                    row.get("m_iWatchersTaken"),
                    row.get("m_iNeutralTokensFound"),
                    row.get("m_iTormentorKills"),
                    row.get("m_iSmokesUsed"),
                    row.get("m_iCourierKills"),
                    row.get("m_nAcquiredMadstone"),
                    row.get("m_nCurrentMadstone"),
                    teamfight.get(steamId)
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
