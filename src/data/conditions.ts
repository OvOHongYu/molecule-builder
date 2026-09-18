/**
 * 条件预设（反应模块设计方案 §9）。用于一键填充箭头上方文字与结构化条件。
 * ruleId 关联规则 id（R3 启用后用于条件分流），可在规则前保持为空。
 */
import type { ConditionPreset } from '../types/reaction'

export const CONDITIONS: ConditionPreset[] = [
  { id: 'cond-esterification', name: 'Fischer 酯化', temperature: 'Δ', catalyst: '浓H₂SO₄', note: '酸 + 醇 → 酯 + 水' },
  { id: 'cond-etoh-dehydrate', name: '酸催化脱水', temperature: 'Δ', catalyst: '浓H₂SO₄', note: '分子间成醚（140℃）/ 分子内消去（170℃）' },
  { id: 'cond-hydrogenation', name: '催化加氢', temperature: 'Δ', catalyst: 'Ni', atmosphere: 'H₂', note: '烯/炔/芳烃加氢' },
  { id: 'cond-alkene-add-hx', name: '烯烃加卤化氢', catalyst: 'HX', note: '马氏规则' },
  { id: 'cond-alkene-add-h2o', name: '烯烃加水', catalyst: 'H₂O/H⁺', note: '马氏规则' },
  { id: 'cond-alkene-ox-kmno4', name: '酸性高锰酸钾氧化', catalyst: 'KMnO₄/H⁺', temperature: 'Δ', note: '烯/炔氧化断键' },
  { id: 'cond-dilute-cold-kmno4', name: '稀冷高锰酸钾（邻二醇）', catalyst: 'KMnO₄(稀,冷)', solvent: '中性', note: '烯烃 → 邻二醇' },
  { id: 'cond-ketone-reduce', name: '酮还原', catalyst: 'H₂/Ni', temperature: 'Δ', note: '酮 → 仲醇' },
  { id: 'cond-aldehyde-reduce', name: '醛还原', catalyst: 'H₂/Ni', temperature: 'Δ', note: '醛 → 伯醇' },
  { id: 'cond-silver-mirror', name: '银镜反应', catalyst: '银氨溶液', solvent: '水浴', note: '醛基检验' },
  { id: 'cond-cuoh2', name: '氢氧化铜氧化', catalyst: '新制Cu(OH)₂', temperature: 'Δ', note: '醛基检验，砖红色沉淀' },
  { id: 'cond-bromination', name: '苯环卤代', catalyst: 'FeBr₃', note: '苯 + 溴' },
  { id: 'cond-nitration', name: '硝化', catalyst: '浓HNO₃/浓H₂SO₄', temperature: '50~60 ℃', note: '苯 → 硝基苯' },
  { id: 'cond-sulfonation', name: '磺化', catalyst: '浓H₂SO₄', temperature: 'Δ', note: '苯 → 苯磺酸' },
  { id: 'cond-sidechain-ox', name: '侧链氧化', catalyst: '酸性KMnO₄', temperature: 'Δ', note: '甲苯 → 苯甲酸（需苄位H）' },
  { id: 'cond-benzyne-reduce', name: '苯加氢', catalyst: 'Ni', temperature: 'Δ', atmosphere: 'H₂', note: '苯 → 环己烷' },
  { id: 'cond-halo-hydrolysis', name: '卤代烃水解', catalyst: 'NaOH水溶液', temperature: 'Δ', note: 'R-X → R-OH' },
  { id: 'cond-halo-elimination', name: '卤代烃消去', catalyst: 'NaOH醇溶液', temperature: 'Δ', note: 'R-CH2CH2X → 烯烃' },
  { id: 'cond-combustion', name: '完全燃烧', catalyst: 'O₂', temperature: '点燃', note: '碳氢化合物 → CO₂ + H₂O' },
  { id: 'cond-acid-hydrolysis-ester', name: '酯的酸性水解', catalyst: '稀H₂SO₄', temperature: 'Δ', note: '可逆' },
  { id: 'cond-base-hydrolysis-ester', name: '酯的碱性水解', catalyst: 'NaOH', temperature: 'Δ', note: '完全，皂化' },
  { id: 'cond-ammonium-salt', name: '饱和硫酸铵盐析', catalyst: '(NH₄)₂SO₄(饱和)', note: '蛋白质盐析（可逆）' },
  { id: 'cond-deny', name: '变性', note: '加热/重金属盐/乙醇/紫外线' },
]

export function findCondition(id: string): ConditionPreset | undefined {
  return CONDITIONS.find((c) => c.id === id)
}