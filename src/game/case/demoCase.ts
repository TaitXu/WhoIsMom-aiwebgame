import type { CaseDefinition } from "./caseTypes";

export const demoCase = {
  motherId: "marsh-frog",
  regions: [
    { id: "rainleaf-pool", name: "雨叶池", grid: [-1, -1], center: [-18, 0, -18], accentColor: 0xe98b91, landmark: "willow" },
    { id: "dragonfly-shoal", name: "蜻蜓浅滩", grid: [0, -1], center: [0, 0, -18], accentColor: 0x75cbd3, landmark: "dragonfly-post" },
    { id: "spring-grassbank", name: "春草岸", grid: [1, -1], center: [18, 0, -18], accentColor: 0xf1c94b, landmark: "spring-flower" },
    { id: "pebble-bend", name: "卵石弯", grid: [-1, 0], center: [-18, 0, 0], accentColor: 0xe97968, landmark: "stone-arch" },
    { id: "hatching-pool", name: "孵化静池", grid: [0, 0], center: [0, 0, 0], accentColor: 0x8fc7de, landmark: "nest" },
    { id: "turtle-reedbank", name: "乌龟苇岸", grid: [1, 0], center: [18, 0, 0], accentColor: 0x74be57, landmark: "reed-tower" },
    { id: "mudflat", name: "暖泥滩", grid: [-1, 1], center: [-18, 0, 18], accentColor: 0xd9825b, landmark: "mud-bloom" },
    { id: "lotus-causeway", name: "莲叶堤", grid: [0, 1], center: [0, 0, 18], accentColor: 0xf0a3b2, landmark: "lotus-arch" },
    { id: "crescent-reed-bay", name: "月牙苇湾", grid: [1, 1], center: [18, 0, 18], accentColor: 0x60bfa0, landmark: "crescent-reeds" },
  ],
  npcs: [
    {
      id: "dragonfly",
      name: "旅行蜻蜓",
      role: "刚从远方雨林旅行回来",
      regionId: "dragonfly-shoal",
      position: [0, 0.8, -24.5],
      topics: ["appearance", "location", "source"],
      facts: [
        { id: "dragonfly-appearance", topic: "appearance", value: "红脚、蓝绿色背部", time: "上周", place: "远方雨林", source: "亲眼所见" },
        { id: "dragonfly-location", topic: "location", value: "那只青蛙住在雨林的林下水洼", time: "上周", place: "远方雨林", source: "亲眼所见" },
        { id: "dragonfly-source", topic: "source", value: "这是旅行途中见到的，不是本地河道", time: "上周", place: "远方雨林", source: "旅行见闻" },
      ],
    },
    {
      id: "grasshopper",
      name: "弹簧蚱蜢",
      role: "懂得如何借荷叶边缘起跳",
      regionId: "spring-grassbank",
      position: [22.5, 0.2, -19],
      topics: ["jump", "source"],
      facts: [
        { id: "grasshopper-jump", topic: "jump", value: "先压低尾巴，等荷叶回弹时朝下一片叶心跳", place: "春草岸", source: "亲自示范" },
        { id: "grasshopper-source", topic: "source", value: "跳跃方法来自蚱蜢在本地荷叶上的反复练习", place: "春草岸", source: "本地经验" },
      ],
    },
    {
      id: "turtle",
      name: "老乌龟",
      role: "守着芦苇湾的老住民",
      regionId: "turtle-reedbank",
      position: [22, 0.15, 1],
      topics: ["appearance", "location", "source"],
      facts: [
        { id: "turtle-appearance", topic: "appearance", value: "一只戴荷叶帽、黄色腹部的本地泽蛙", time: "昨晚", place: "本地河道", source: "亲眼所见" },
        { id: "turtle-location", topic: "location", value: "它往月牙苇湾去了", time: "昨晚", place: "月牙苇湾", source: "亲眼所见" },
        { id: "turtle-source", topic: "source", value: "乌龟昨晚就在河边亲眼看见它经过", time: "昨晚", place: "本地河道", source: "本地目击" },
      ],
    },
    {
      id: "crab",
      name: "河蟹",
      role: "在卵石弯收集闪亮东西",
      regionId: "pebble-bend",
      position: [-22, 0.12, 1],
      topics: ["appearance", "location", "source"],
      facts: [
        { id: "crab-appearance", topic: "appearance", value: "石头边有一小片黄色蛙皮", time: "今天", place: "月牙苇湾入口", source: "现场痕迹" },
        { id: "crab-location", topic: "location", value: "湿脚印从石头边一路朝月牙苇湾延伸", time: "今天", place: "月牙苇湾", source: "现场痕迹" },
        { id: "crab-source", topic: "source", value: "河蟹没有看见青蛙，只找到了新鲜痕迹", time: "今天", place: "卵石弯", source: "间接证据" },
      ],
    },
  ],
  candidates: [
    { id: "tree-frog", name: "红眼树蛙", description: "红脚、蓝绿色背部、荷叶帽", bodyColor: 0x55b8a4, bellyColor: 0x9edcc8, accentColor: 0xe96b67, accessory: "leaf-hat", regionId: "rainleaf-pool", position: [-22, 0, -18] },
    { id: "bullfrog", name: "大牛蛙", description: "黄色腹部、体型大、红围巾", bodyColor: 0x65884b, bellyColor: 0xe8c85f, accentColor: 0xd94f55, accessory: "red-scarf", regionId: "mudflat", position: [-20, 0, 19] },
    { id: "marsh-frog", name: "本地泽蛙", description: "黄色腹部、细腿、荷叶帽", bodyColor: 0x6fb86c, bellyColor: 0xf1d66f, accentColor: 0x315f4c, accessory: "leaf-hat", regionId: "crescent-reed-bay", position: [21, 0, 20] },
  ],
  obstacles: [
    { id: "tangled-reeds", name: "缠绕水草", description: "把打结的水草慢慢解开", regionId: "rainleaf-pool", position: [-15, 0, -22], reward: 1, preferredPersonality: "cautious" },
    { id: "petal-drift", name: "花瓣漂堆", description: "把挡路的花瓣推回水流", regionId: "dragonfly-shoal", position: [-5, 0, -15], reward: 1, preferredPersonality: "social" },
    { id: "driftwood-jam", name: "漂木堵塞", description: "合力推开卡在卵石间的木头", regionId: "pebble-bend", position: [-17, 0, -4], reward: 2, preferredPersonality: "impulsive" },
    { id: "silt-bubbles", name: "淤泥泡泡", description: "按顺序戳破冒出的泥泡", regionId: "turtle-reedbank", position: [15, 0, 4], reward: 1, preferredPersonality: "social" },
    { id: "fallen-rushes", name: "倒伏芦苇", description: "把倒下的芦苇扶回岸边", regionId: "mudflat", position: [-15, 0, 15], reward: 1, preferredPersonality: "cautious" },
    { id: "lily-clutter", name: "拥挤荷叶", description: "重新排好挤成一团的荷叶", regionId: "lotus-causeway", position: [4, 0, 19], reward: 2, preferredPersonality: "impulsive" },
  ],
  gates: [
    { id: "dragonfly-gap", name: "蜻蜓叶隙", description: "一只会跳跃的蝌蚪可以越过去侦察", regionId: "dragonfly-shoal", position: [0, 0, -21.5], requirement: "one" },
    { id: "lotus-gate", name: "莲叶长桥", description: "三只蝌蚪都掌握跳跃后才能一起通过", regionId: "lotus-causeway", position: [18, 0, 9.5], requirement: "all" },
  ],
} as const satisfies CaseDefinition;
