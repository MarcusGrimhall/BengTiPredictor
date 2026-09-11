import test from "node:test";
import assert from "node:assert/strict";
import { exactMatch, replayErrors, REPLAY_FIELDS } from "../scripts/exact-data.mjs";
import { validatePreparation, buildExactTraining } from "../scripts/training-contract.mjs";

function fixture() {
  const match = {match_id:1,leagueid:2,start_time:1000,duration:1200,radiant_team_id:1,dire_team_id:2,radiant_win:true,series_id:1,series_type:1,
    players:Array.from({length:10},(_,i) => ({account_id:i+1,player_slot:i<5?i:128+i-5,hero_id:i+1,
      kills:0,deaths:0,last_hits:0,denies:0,gold_per_min:1,towers_killed:0,courier_kills:0,firstblood_claimed:0,
      stuns:0,obs_placed:0,camps_stacked:0,rune_pickups:0,teamfight_participation:0,killed:{},item_uses:{}}))};
  const replay = {match:{matchId:1,players:match.players.map((p) => ({accountId:p.account_id,playerSlot:p.player_slot,heroId:p.hero_id,
    stats:Object.fromEntries(Object.values(REPLAY_FIELDS).map((f) => [f,0]))}))}};
  return {match,replay};
}
test("complete observed zero counters survive; missing replay never becomes zero",()=>{
  const {match,replay}=fixture(); assert.equal(exactMatch(match,replay).exact,true);
  const absent=exactMatch(match); assert.equal(absent.exact,false);
  assert.equal(absent.players[0].stats.watchers,null); assert.equal(absent.players[0].stats.smokes,0);
  delete match.players[0].item_uses;
  assert.equal(exactMatch(match,replay).players[0].stats.smokes,null);
});
test("all required fields and identity checked; a replay-title flag proves nothing",()=>{
  for(const field of Object.values(REPLAY_FIELDS)) {
    const {match,replay}=fixture(); delete replay.match.players[0].stats[field];
    assert.equal(exactMatch(match,replay).exact,false);
  }
  const {match,replay}=fixture(); replay.match.players[0].accountId=2;
  assert.ok(replayErrors(replay,match).length); assert.equal(exactMatch(match,replay).exact,false);
  const wrong=fixture();wrong.replay.match.matchId=99;
  assert.equal(exactMatch(wrong.match,wrong.replay).players[0].stats.watchers,null);
});
test("impossible values rejected instead of clamped or calibrated",()=>{
  const {match,replay}=fixture();match.players[0].stuns=-0.5;
  const got=exactMatch(match,replay); assert.equal(got.exact,false);assert.deepEqual(got.players[0].invalid,["stuns"]);
  replay.match.players[1].stats.teamfight_participation=1.1;assert.ok(replayErrors(replay,match).length);
});
test("roster evidence and explicit lock prevent post-event inference",()=>{
  assert.throws(()=>validatePreparation({}),/cutoff/);
  const roster=Array.from({length:5},(_,i)=>({accountId:i+1,name:`P${i}`,teamId:1,teamName:"A",role:["core","core","mid","support","support"][i]}));
  const config={targetLeagueId:3,stage:"groupStage",cutoff:3000,rosterKnownAt:2000,rosterSource:"pre-lock captured roster",sourceLeagueIds:[2],roster};
  validatePreparation(config);
  assert.throws(()=>validatePreparation({...config,rosterKnownAt:3001}),/before lock/);
  const {match,replay}=fixture(),fact=exactMatch(match,replay);
  assert.throws(()=>buildExactTraining(config,[{...fact,endTime:3000}]),/post-lock/);
  assert.throws(()=>buildExactTraining(config,[fact,fact]),/Duplicate/);
  assert.throws(()=>buildExactTraining(config,[{...fact,exact:false}]),/Incomplete/);
  assert.throws(()=>buildExactTraining(config,[fact]),/minimum 20/);
});
