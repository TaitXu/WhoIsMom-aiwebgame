import type {
  FrogFeatureConstraints,
  FrogFeatures,
  FrogFeatureVocabulary,
  FrogId,
} from "../../core/types";

export const frogFeatureKeys = [
  "bodyTone",
  "bellyTone",
  "eyeTone",
  "markingPattern",
  "headAdornment",
  "redAdornment",
  "hindLegShape",
] as const satisfies readonly (keyof FrogFeatures)[];

export const frogFeatureVocabulary = {
  bodyTone: ["blue-green", "olive-green", "olive-brown"],
  bellyTone: ["cream", "warm-yellow"],
  eyeTone: ["red-brown", "amber"],
  markingPattern: ["sparse-dark", "dense-light"],
  headAdornment: ["leaf-hat", "reed-crown"],
  redAdornment: ["ankle-ribbons", "scarf", "flower-pin"],
  hindLegShape: ["slender", "sturdy"],
} as const satisfies FrogFeatureVocabulary;

export const fallbackFrogNames: Record<FrogId, string> = {
  "tree-frog": "溪声阿姨",
  "bullfrog": "微雨阿姨",
  "marsh-frog": "晚风阿姨",
};

export const fallbackFrogFeatures: Record<FrogId, FrogFeatures> = {
  "tree-frog": {
    bodyTone: "blue-green",
    bellyTone: "warm-yellow",
    eyeTone: "red-brown",
    markingPattern: "sparse-dark",
    headAdornment: "leaf-hat",
    redAdornment: "ankle-ribbons",
    hindLegShape: "slender",
  },
  "bullfrog": {
    bodyTone: "olive-green",
    bellyTone: "warm-yellow",
    eyeTone: "amber",
    markingPattern: "dense-light",
    headAdornment: "reed-crown",
    redAdornment: "scarf",
    hindLegShape: "sturdy",
  },
  "marsh-frog": {
    bodyTone: "olive-brown",
    bellyTone: "warm-yellow",
    eyeTone: "amber",
    markingPattern: "dense-light",
    headAdornment: "leaf-hat",
    redAdornment: "flower-pin",
    hindLegShape: "slender",
  },
};

// These anchors keep generated appearances consistent with the case's existing clues.
export const frogFeatureConstraints: FrogFeatureConstraints = {
  "tree-frog": {
    bodyTone: "blue-green",
    eyeTone: "red-brown",
    markingPattern: "sparse-dark",
    redAdornment: "ankle-ribbons",
  },
  "bullfrog": {
    eyeTone: "amber",
    markingPattern: "dense-light",
    redAdornment: "scarf",
    hindLegShape: "sturdy",
  },
  "marsh-frog": fallbackFrogFeatures["marsh-frog"],
};

const featureLabels: { [Key in keyof FrogFeatures]: Record<FrogFeatures[Key], string> } = {
  bodyTone: {
    "blue-green": "蓝绿色背部",
    "olive-green": "橄榄绿色背部",
    "olive-brown": "橄榄褐色背部",
  },
  bellyTone: {
    cream: "乳白色腹部",
    "warm-yellow": "暖黄色腹部",
  },
  eyeTone: {
    "red-brown": "红棕色眼睛",
    amber: "琥珀色眼睛",
  },
  markingPattern: {
    "sparse-dark": "疏落深色斑纹",
    "dense-light": "密集浅色斑纹",
  },
  headAdornment: {
    "leaf-hat": "头戴圆叶帽",
    "reed-crown": "头戴细苇冠",
  },
  redAdornment: {
    "ankle-ribbons": "脚踝系红丝带",
    scarf: "颈间系红围巾",
    "flower-pin": "脸侧别红花饰",
  },
  hindLegShape: {
    slender: "后腿修长",
    sturdy: "后腿粗壮",
  },
};

const revealingNameTerms = [
  "蓝", "绿", "褐", "黄", "红", "琥珀", "眼", "斑", "叶", "苇", "帽", "冠", "围巾", "丝带", "花", "腿", "脚",
];

export function describeFrogFeatures(features: FrogFeatures): string {
  return [
    featureLabels.bodyTone[features.bodyTone],
    featureLabels.bellyTone[features.bellyTone],
    featureLabels.eyeTone[features.eyeTone],
    featureLabels.markingPattern[features.markingPattern],
    featureLabels.headAdornment[features.headAdornment],
    featureLabels.redAdornment[features.redAdornment],
    featureLabels.hindLegShape[features.hindLegShape],
  ].join("、");
}

export function frogFeatureVector(features: FrogFeatures): string {
  return frogFeatureKeys.map((key) => features[key]).join("|");
}

export function countSharedFrogFeatures(first: FrogFeatures, second: FrogFeatures): number {
  return frogFeatureKeys.filter((key) => first[key] === second[key]).length;
}

export function frogNameRevealsFeature(name: string): boolean {
  return revealingNameTerms.some((term) => name.includes(term));
}
