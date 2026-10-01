/**
 * palette.js —— 固定 28 色调色板（世界底色）＋ 角色/季节的附加色。
 * 昼夜与季节用全屏叠色（multiply），不换图。
 */

export const TILE = 16;

/** 28 色基底（索引即色板号） */
export const BASE = [
  "#1a1c2c", // 0 深墨（描边）
  "#5d275d", // 1 深紫
  "#b13e53", // 2 红
  "#ef7d57", // 3 橙
  "#ffcd75", // 4 沙金
  "#a7f070", // 5 亮草绿
  "#38b764", // 6 草绿
  "#257179", // 7 深青
  "#29366f", // 8 深蓝
  "#3b5dc9", // 9 蓝
  "#41a6f6", // 10 天蓝
  "#73eff7", // 11 浅青
  "#f4f4f4", // 12 白
  "#94b0c2", // 13 浅灰蓝
  "#566c86", // 14 中灰蓝
  "#333c57", // 15 深灰蓝
  "#dust",   // 占位（不用）
  "#5a6988", // 17 灰
  "#333c57", // 18
  "#8b9bb4", // 19
  "#e0d5b3", // 20 米白（纸）
  "#c4a35a", // 21 土黄
  "#8a6f4d", // 22 棕
  "#5d4a36", // 23 深棕
  "#de9e36", // 24 屋顶橙
  "#c95d42", // 25 瓦红
  "#7fc4c9", // 26 水光
  "#234",   // 27（占位）
];
BASE[16] = "#181425";

/** 简化取色 */
export const C = {
  ink: BASE[0], grass: BASE[6], grassLit: BASE[5], grassDark: "#1e6e50",
  road: BASE[13], roadEdge: BASE[14], water: BASE[9], waterLit: BASE[26],
  sand: BASE[4], plaza: BASE[20], plazaEdge: BASE[21],
  wall: BASE[20], wallShade: BASE[21], roof: BASE[24], roofDark: BASE[25],
  door: BASE[22], window: BASE[10], sign: BASE[12],
  tree: "#1a6e3c", treeLit: "#2c9454", trunk: BASE[23],
  bench: BASE[22], lamp: BASE[4], flower: [BASE[2], BASE[3], BASE[11], BASE[12]],
};

/** 角色部件色：发型 6 × 发色 6 × 衣色 8 × 肤色 4 */
export const HAIR_STYLE = 6;
export const HAIR_COLORS = ["#2b1c12", "#5a3825", "#8a5a2b", "#c9a15a", "#e8e3d5", "#b13e53"];
export const CLOTHES_COLORS = ["#b13e53", "#3b5dc9", "#38b764", "#ef7d57", "#566c86", "#8a5aa0", "#c95d42", "#257179"];
export const SKIN_COLORS = ["#f0c8a0", "#d9a066", "#a8734b", "#7a4e32"];

/** 六个时段的全屏叠色（multiply，rgba）与四季色板偏移 */
export const SEGMENT_TINTS = [
  "rgba(255,214,170,0.18)", // 清晨
  "rgba(255,255,255,0.02)", // 上午
  "rgba(255,252,235,0.0)",  // 正午
  "rgba(255,200,140,0.14)", // 午后
  "rgba(180,120,90,0.30)",  // 黄昏
  "rgba(40,50,110,0.42)",   // 夜晚
];

/** 四季：草色偏移与光色（[草替换色, 光叠加]） */
export const SEASONS = [
  { name: "春", grass: "#3fae6a", tint: "rgba(255,220,235,0.05)" },
  { name: "夏", grass: "#2f9e57", tint: "rgba(255,250,200,0.06)" },
  { name: "秋", grass: "#b98a3c", tint: "rgba(255,190,120,0.10)" },
  { name: "冬", grass: "#9fb3a8", tint: "rgba(210,230,255,0.16)" },
];

/** 按人生阶段给建筑换主色（不重生成布局） */
export const STAGE_ROOFS = {
  young: ["#c95d42", "#de9e36", "#3b5dc9", "#38b764", "#8a5aa0", "#257179"],
  mid: ["#b14e38", "#c98a2e", "#3151b8", "#2f9e57", "#7a4a8c", "#1f6168"],
  senior: ["#9c4230", "#b07626", "#2a4398", "#278548", "#653d73", "#1a5055"],
  old: ["#8a3a2b", "#9c6620", "#233a80", "#216e3d", "#553260", "#164247"],
};
