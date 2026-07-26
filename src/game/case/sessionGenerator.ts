import type { CaseDefinition, CandidateFrog, NpcDefinition } from "./caseTypes";
import type { Fact, FrogFeatures, FrogId, NpcId, Personality } from "../../core/types";
import { demoCase } from "./demoCase";
import {
  describeFrogFeature,
  describeFrogFeatures,
  frogFeatureKeys,
  frogFeatureVocabulary,
} from "./frogFeatures";

const frogIds = ["tree-frog", "bullfrog", "marsh-frog"] as const satisfies readonly FrogId[];

export type GeneratedSessionCase = CaseDefinition & Readonly<{
  seed: number;
  fingerprint: string;
}>;

export function createSessionCase(seed: number): GeneratedSessionCase {
  const random = mulberry32(seed >>> 0);
  const motherId = frogIds[Math.floor(random() * frogIds.length)]!;
  const mother = randomFeatures(random);
  const remainingRed = frogFeatureVocabulary.redAdornment.filter((value) => value !== mother.redAdornment);
  const firstDecoy = changeFeatures(mother, {
    redAdornment: remainingRed[0]!,
    bodyTone: alternate("bodyTone", mother.bodyTone),
    eyeTone: alternate("eyeTone", mother.eyeTone),
  });
  const secondDecoy = changeFeatures(mother, {
    redAdornment: remainingRed[1]!,
    markingPattern: alternate("markingPattern", mother.markingPattern),
    headAdornment: alternate("headAdornment", mother.headAdornment),
    hindLegShape: alternate("hindLegShape", mother.hindLegShape),
  });
  const decoys = [firstDecoy, secondDecoy];
  let decoyIndex = 0;
  const featuresById = Object.fromEntries(frogIds.map((id) => [
    id,
    id === motherId ? mother : decoys[decoyIndex++]!,
  ])) as Record<FrogId, FrogFeatures>;

  const candidates = demoCase.candidates.map((candidate) => ({
    ...candidate,
    description: describeFrogFeatures(featuresById[candidate.id]),
    features: featuresById[candidate.id],
  })) as unknown as readonly CandidateFrog[];
  const motherCandidate = candidates.find((candidate) => candidate.id === motherId)!;
  const foreignCandidate = candidates.find((candidate) => candidate.id !== motherId)!;
  const rumorCandidate = candidates.find((candidate) => candidate.id !== motherId && candidate.id !== foreignCandidate.id)!;
  const motherRegion = demoCase.regions.find((region) => region.id === motherCandidate.regionId)!;

  const npcs = demoCase.npcs.map((npc) => ({
    ...npc,
    facts: factsForNpc(npc.id, mother, foreignCandidate.features, rumorCandidate.features, motherRegion.name),
  })) as unknown as readonly NpcDefinition[];
  const fingerprint = frogIds.map((id) => frogFeatureKeys.map((key) => featuresById[id][key]).join("|")).join("::");

  return {
    ...demoCase,
    seed,
    motherId,
    candidates,
    npcs,
    fingerprint,
  };
}

export function randomSessionSeed(): number {
  const values = new Uint32Array(1);
  globalThis.crypto?.getRandomValues(values);
  return values[0] || ((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0);
}

export function sessionPersonalityOrder(seed: number): readonly Personality[] {
  const random = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  const personalities: Personality[] = ["cautious", "impulsive", "social"];
  for (let index = personalities.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [personalities[index], personalities[swapIndex]] = [personalities[swapIndex]!, personalities[index]!];
  }
  return personalities;
}

function factsForNpc(
  npcId: NpcId,
  mother: FrogFeatures,
  foreign: FrogFeatures,
  rumor: FrogFeatures,
  motherRegionName: string,
): readonly Fact[] {
  if (npcId === "dragonfly") {
    return [
      fact("dragonfly-appearance", "appearance", describeFrogFeature("redAdornment", foreign.redAdornment), "上周", "远方雨林", "亲眼所见", "contextual"),
      fact("dragonfly-back-color", "appearance", describeFrogFeature("bodyTone", foreign.bodyTone), "上周", "远方雨林", "亲眼所见", "contextual"),
      fact("dragonfly-markings", "appearance", describeFrogFeature("markingPattern", foreign.markingPattern), "上周", "远方雨林", "亲眼所见", "contextual"),
      fact("dragonfly-location", "location", "那只青蛙住在雨林的林下水洼", "上周", "远方雨林", "亲眼所见"),
      fact("dragonfly-source", "source", "这是旅行途中见到的，不是本地河道", "上周", "远方雨林", "旅行见闻"),
    ];
  }
  if (npcId === "grasshopper") {
    return [
      fact("grasshopper-jump", "jump", "先压低尾巴，等荷叶回弹时朝下一片叶心跳", undefined, "春草岸", "亲自示范"),
      fact("grasshopper-location", "location", `练跳时瞥见一个身影朝${motherRegionName}方向蹦走了`, "今早", "春草岸", "亲眼瞥见", "contextual"),
      fact("grasshopper-source", "source", "跳跃方法来自蚱蜢在本地荷叶上的反复练习", undefined, "春草岸", "本地经验"),
    ];
  }
  if (npcId === "turtle") {
    return [
      fact("turtle-appearance", "appearance", describeFrogFeature("bellyTone", mother.bellyTone), "昨晚", "本地河道", "亲眼所见", "true"),
      fact("turtle-head-shape", "appearance", describeFrogFeature("headAdornment", mother.headAdornment), "昨晚", "本地河道", "亲眼所见", "true"),
      fact("turtle-eye-color", "appearance", describeFrogFeature("eyeTone", mother.eyeTone), "昨晚", "本地河道", "亲眼所见", "true"),
      fact("turtle-leg-shape", "appearance", describeFrogFeature("hindLegShape", mother.hindLegShape), "昨晚", "本地河道", "亲眼所见", "true"),
      { ...fact("turtle-appearance-after-travel", "appearance", `昨晚的身影并不是${describeFrogFeature("redAdornment", foreign.redAdornment)}`, "昨晚", "本地河道", "亲眼所见", "contextual"), requiresAnyFactIds: ["dragonfly-appearance", "dragonfly-back-color"] },
      fact("turtle-location", "location", `它往${motherRegionName}去了`, "昨晚", motherRegionName, "亲眼所见", "true"),
      fact("turtle-source", "source", "乌龟昨晚就在河边亲眼看见它经过", "昨晚", "本地河道", "本地目击", "true"),
      fact("turtle-jump", "jump", "起跳前先稳住方向，等水面平下来再朝叶片中心发力", undefined, "乌龟苇岸", "岸边观察"),
    ];
  }
  return [
    fact("crab-appearance", "appearance", `水鸟说那道影子有${describeFrogFeature("redAdornment", rumor.redAdornment)}`, "今天", `${motherRegionName}入口`, "水鸟转述", "false"),
    fact("crab-markings", "appearance", `水鸟说它有${describeFrogFeature("markingPattern", rumor.markingPattern)}`, "今天", `${motherRegionName}入口`, "水鸟转述", "contextual"),
    { ...fact("crab-appearance-after-turtle", "appearance", `${describeFrogFeature("bellyTone", mother.bellyTone)}也可能只是沾上的花粉`, "今天", `${motherRegionName}入口`, "现场猜测", "contextual"), requiresAnyFactIds: ["turtle-appearance", "turtle-head-shape", "turtle-appearance-after-travel"] },
    fact("crab-location", "location", `湿脚印从石头边一路朝${motherRegionName}延伸`, "今天", motherRegionName, "现场痕迹", "true"),
    fact("crab-source", "source", "河蟹没有看见青蛙，只找到了新鲜痕迹", "今天", "卵石弯", "间接证据", "contextual"),
  ];
}

function fact(
  id: string,
  topic: Fact["topic"],
  value: string,
  time?: string,
  place?: string,
  source?: string,
  veracity?: Fact["veracity"],
): Fact {
  return { id, topic, value, time, place, source, veracity };
}

function randomFeatures(random: () => number): FrogFeatures {
  return Object.fromEntries(frogFeatureKeys.map((key) => {
    const values = frogFeatureVocabulary[key];
    return [key, values[Math.floor(random() * values.length)]!];
  })) as unknown as FrogFeatures;
}

function changeFeatures(features: FrogFeatures, changes: Partial<FrogFeatures>): FrogFeatures {
  return { ...features, ...changes };
}

function alternate<Key extends keyof FrogFeatures>(key: Key, value: FrogFeatures[Key]): FrogFeatures[Key] {
  const values = frogFeatureVocabulary[key] as unknown as readonly FrogFeatures[Key][];
  return values.find((candidate) => candidate !== value) ?? value;
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
