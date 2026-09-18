/**
 * 反应规则类型定义（反应模块设计方案 §7.1、§8）。
 *
 * 规则是**声明式数据**，不是代码：新增规则只加数据、不改引擎。
 * 产物形态 `kind` 决定引擎走完整变换路径还是短路路径，见设计方案 §8.1 的 A/B/C 三类。
 */
import type { BondOrder } from './molecule'

/** 规则产物形态：A 结构变换 / B 定性结论 / C 聚合提示 */
export type RuleKind = 'transform' | 'qualitative' | 'polymer'

export type RuleCategory =
  | 'addition'
  | 'elimination'
  | 'substitution'
  | 'oxidation'
  | 'reduction'
  | 'esterification'
  | 'hydrolysis'
  | 'condensation'
  | 'polymerization'
  | 'property'
  | 'other'

export const CATEGORY_LABEL: Record<RuleCategory, string> = {
  addition: '加成',
  elimination: '消去',
  substitution: '取代',
  oxidation: '氧化',
  reduction: '还原',
  esterification: '酯化',
  hydrolysis: '水解',
  condensation: '缩合',
  polymerization: '聚合',
  property: '性质',
  other: '其他',
}

/** 反应中心模式 */
export interface PatternDef {
  /** 唯一名，供变换算子按名引用 */
  id: string
  smarts: string
  /** SMARTS 原子序号（0 基）→ 占位标签，如 { 0: 'C1', 1: 'O' } */
  labels?: Record<number, string>
  /** 需要的匹配副本数（分子间反应 > 1），如炔三聚为 3 */
  copies?: number
}

export interface AtomRef {
  /** pattern id */
  p: string
  /** 占位标签；`new0`/`new1`… 引用本次变换中 addAtom 产生的新原子 */
  label: string
  /** 该 pattern 的第几个匹配副本（分子间反应用，默认 0） */
  copy?: number
}

export interface BondRef {
  a: AtomRef
  b: AtomRef
}

/** 变换算子：与 engine/moleculeOps 同构，作用于自有 MoleculeGraph。
 *  `element: '$agent'` 表示元素由命中的试剂决定（见 ReactionRule.elementByAgent）。 */
export type TransformOp =
  | { op: 'setBondOrder'; bond: BondRef; order: BondOrder }
  | { op: 'removeBond'; bond: BondRef }
  | { op: 'addBond'; bond: BondRef; order: BondOrder }
  | { op: 'setElement'; atom: AtomRef; element: string }
  | { op: 'setCharge'; atom: AtomRef; charge: number }
  | { op: 'addAtom'; to: AtomRef; element: string; order: BondOrder }
  | { op: 'removeAtom'; atom: AtomRef }

/** 试剂约束 */
export interface AgentsConstraint {
  /** 必需试剂（试剂库 id） */
  required?: string[]
  /** 任选一组即可 */
  anyOf?: string[][]
  /** 排除试剂（出现则不适用） */
  exclude?: string[]
}

export interface ReactionRule {
  /** 如 "R-ALC-05" */
  id: string
  name: string
  category: RuleCategory
  kind: RuleKind
  patterns: PatternDef[]
  agents?: AgentsConstraint
  /**
   * 产物元素由命中的试剂决定（如「加卤素」：Br₂→Br、Cl₂→Cl）。
   * 变换算子里写 `element: '$agent'` 时按此表解析；未命中则用 fallback。
   */
  elementByAgent?: { byAgent: Record<string, string>; fallback: string }
  /** 温度范围（℃），用于条件分流，如醇 140/170 ℃ */
  tempRange?: [number, number]
  /** kind='transform' 时必填 */
  transforms?: TransformOp[]
  /** kind='qualitative' 时必填 */
  conclusion?: {
    /** 结论，如 "FeCl₃ 显紫色（鉴别酚）" */
    text: string
    /** 现象描述 */
    phenomenon?: string
    /** 燃烧类：产物固定为 CO₂ + H₂O，可由分子式自动补全系数 */
    combustion?: boolean
  }
  /** kind='polymer' 时必填 */
  polymer?: {
    /** 重复单元的 SMILES（用于渲染与「插入画布」） */
    repeatUnitSmiles?: string
    name: string
    degreeNote?: string
  }
  /** 是否为逆反应（供未来逆合成复用） */
  reversible?: boolean
  /** 同一位点的竞争排序权重 */
  priority: number
  note?: string
}
