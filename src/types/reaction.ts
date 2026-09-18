/**
 * 反应模块数据模型（反应模块设计方案 §4）。
 *
 * 设计要点：
 *  - 反应物与产物都是完整的 MoleculeGraph，与分子库条目同构，可自由存取与渲染；
 *  - 计量系数只存在于 SchemeComponent，不污染分子图；
 *  - 试剂可无结构（如 Pd/C、分子筛），故 molecule 可选。
 */
import type { MoleculeGraph } from './molecule'

/** 箭头形态 */
export type ArrowKind = 'forward' | 'equilibrium' | 'resonance'

export const ARROW_SYMBOL: Record<ArrowKind, string> = {
  forward: '→',
  equilibrium: '⇌',
  resonance: '↔',
}

export const ARROW_LABEL: Record<ArrowKind, string> = {
  forward: '正向 →',
  equilibrium: '平衡 ⇌',
  resonance: '共振 ↔',
}

/** 反应式中的一端组分（反应物或产物） */
export interface SchemeComponent {
  id: string
  molecule: MoleculeGraph
  /** 计量系数，正整数，默认 1 */
  coefficient: number
}

/** 试剂 / 催化剂条目（可带结构，也可纯文字） */
export interface AgentEntry {
  id: string
  /** 自由文本名，如 "Pd/C"、"reflux" */
  text: string
  /** 可选结构（来自试剂库条目或分子库） */
  molecule?: MoleculeGraph
  /** 来源试剂库条目 id */
  reagentId?: string
}

/** 结构化反应条件（与箭头文字双向同步） */
export interface ReactionConditions {
  /** 催化剂 / 主要试剂，写在箭头上方 */
  catalyst?: string
  temperature?: string
  solvent?: string
  time?: string
  atmosphere?: string
  note?: string
}

/** 完整反应式 */
export interface ReactionScheme {
  id: string
  reactants: SchemeComponent[]
  agents: AgentEntry[]
  products: SchemeComponent[]
  arrow: { kind: ArrowKind }
  /** 箭头上下方文字（支持上下标），由条件字段自动同步或手动覆盖 */
  aboveText: string
  belowText: string
  conditions: ReactionConditions
  /** 用户是否手动改写过箭头文字；为 true 时不再自动同步条件字段 */
  textOverridden?: boolean
  title?: string
  createdAt: number
  /** 去重键，见设计方案 §10.3 */
  key?: string
}

/** 元素守恒状态（单个元素） */
export interface ElementBalance {
  element: string
  left: number
  right: number
}

/** 配平结果 */
export interface BalanceResult {
  /** 是否已配平（或可配平） */
  ok: boolean
  reactantCoeffs: number[]
  productCoeffs: number[]
  /** 逐元素守恒明细 */
  elements: ElementBalance[]
  /** 是否存在多组配平方案 */
  multiple: boolean
  /** 面向用户的说明 */
  message: string
}

/** 试剂类别（试剂与条件库 §9.1） */
export type ReagentCategory =
  | 'acid'
  | 'base'
  | 'oxidant'
  | 'reductant'
  | 'catalyst'
  | 'ligand'
  | 'solvent'
  | 'dehydrant'
  | 'protective'
  | 'other'

/** 条件预设（试剂与条件库 §9.1） */
export interface ConditionPreset {
  id: string
  name: string
  /** 催化剂 / 主要试剂（写在箭头上方） */
  catalyst?: string
  temperature?: string
  solvent?: string
  time?: string
  atmosphere?: string
  /** 关联规则 id */
  ruleId?: string
  note?: string
}

/** 新建一个空反应式 */
export function emptyScheme(): ReactionScheme {
  return {
    id: newId(),
    reactants: [],
    agents: [],
    products: [],
    arrow: { kind: 'forward' },
    aboveText: '',
    belowText: '',
    conditions: {},
    createdAt: Date.now(),
  }
}

export function newId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
