import type { AgentId, CommunicationStyle, Personality } from "../../core/types";

export type PersonalityMotion = Readonly<{
  followDistance: number;
  sideOffset: number;
  speed: number;
  tailAmplitude: number;
  tailFrequency: number;
  bobAmplitude: number;
}>;

const motionByPersonality: Record<Personality, PersonalityMotion> = {
  cautious: {
    followDistance: 2.45,
    sideOffset: -0.65,
    speed: 3.1,
    tailAmplitude: 0.22,
    tailFrequency: 4.2,
    bobAmplitude: 0.025,
  },
  impulsive: {
    followDistance: 2.05,
    sideOffset: 0.05,
    speed: 4.5,
    tailAmplitude: 0.48,
    tailFrequency: 7.2,
    bobAmplitude: 0.06,
  },
  social: {
    followDistance: 2.7,
    sideOffset: 0.65,
    speed: 3.7,
    tailAmplitude: 0.34,
    tailFrequency: 5.2,
    bobAmplitude: 0.09,
  },
};

export function getPersonalityMotion(
  personality: Personality,
): PersonalityMotion {
  return motionByPersonality[personality];
}

export const agentMarkerColors: Record<AgentId, number> = {
  modian: 0x8fc7de,
  xiaolang: 0xf1c94b,
  paopao: 0xe98b91,
};

export const personalityLabels: Record<Personality, string> = {
  cautious: "谨慎",
  impulsive: "冲动",
  social: "亲和",
};

export const communicationStyleByPersonality: Record<Personality, CommunicationStyle> = {
  cautious: "literal",
  impulsive: "embellishing",
  social: "agreeable",
};

export const communicationStyleLabels: Record<CommunicationStyle, string> = {
  literal: "照实复述",
  embellishing: "爱夸张，偶尔会把猜测说成事实",
  agreeable: "容易顺着同伴改口",
};
