/**
 * 反应式 store（反应模块设计方案 §5.3、§10.3）：反应式编辑、历史、配平、持久化。
 *
 * 箭头文字的同步规则：
 *  - 未手动覆盖时，由「试剂列表 + 条件字段」自动合成（上方 = 试剂, 温度；下方 = 溶剂, 时间, 气氛）；
 *  - 一旦用户手动编辑过箭头文字，`textOverridden = true`，此后不再自动覆盖。
 */
import { create } from 'zustand'
import type {
  AgentEntry,
  ArrowKind,
  BalanceResult,
  ReactionConditions,
  ReactionScheme,
  SchemeComponent,
} from '../types/reaction'
import { emptyScheme, newId } from '../types/reaction'
import { balanceGraphs } from '../engine/balance'
import { cloneGraph } from '../engine/graphUtils'
import { loadJSON, saveJSON } from '../lib/localStore'
import type { MoleculeGraph } from '../types/molecule'

const LS_KEY = 'molecule-reactions-v1'
const HISTORY_LIMIT = 50

interface ReactionState {
  scheme: ReactionScheme
  /** 当前反应式是否已保存到本地 */
  saved: boolean
  /** 元素总量是否守恒 */
  conserved: boolean
  /** 最近一次配平结果 */
  balanceResult: BalanceResult | null
  past: ReactionScheme[]
  future: ReactionScheme[]

  reset(): void
  addReactant(molecule: MoleculeGraph, coeff?: number): void
  addProduct(molecule: MoleculeGraph, coeff?: number): void
  addAgent(agent: AgentEntry): void
  removeAgent(id: string): void
  moveComponent(side: Side, id: string, to: Side): void
  setCoefficient(side: Side, id: string, coeff: number): void
  removeComponent(side: Side, id: string): void
  setArrow(kind: ArrowKind): void
  setConditions(patch: Partial<ReactionConditions>): void
  setAboveText(text: string): void
  setBelowText(text: string): void
  /** 一键配平：解元素守恒方程并把最小正整数系数写回组分 */
  applyBalance(): void
  setSaved(saved: boolean): void
  undo(): void
  redo(): void
}

export type Side = 'reactants' | 'products'

/** 由试剂列表与条件字段合成箭头上下方文字 */
export function schemeArrowText(scheme: ReactionScheme): { above: string; below: string } {
  const c = scheme.conditions
  const aboveParts: string[] = []
  const agentText = scheme.agents.map((a) => a.text.trim()).filter(Boolean).join(' + ')
  if (agentText) aboveParts.push(agentText)
  if (c.catalyst) aboveParts.push(c.catalyst)
  if (c.temperature) aboveParts.push(c.temperature)
  const belowParts = [c.solvent, c.time, c.atmosphere].filter((v): v is string => !!v)
  return {
    above: aboveParts.join(', '),
    below: belowParts.join(', '),
  }
}

/** 重新计算箭头文字（仅在未手动覆盖时） */
function withSyncedText(scheme: ReactionScheme): ReactionScheme {
  if (scheme.textOverridden) return scheme
  const t = schemeArrowText(scheme)
  return { ...scheme, aboveText: t.above, belowText: t.below }
}

function recomputeConservation(scheme: ReactionScheme): boolean {
  return balanceGraphs(
    scheme.reactants.map((c) => c.molecule),
    scheme.products.map((c) => c.molecule),
  ).ok
}

export const useReactionStore = create<ReactionState>((set, get) => {
  /** 应用一次带历史的变更 */
  const commit = (next: ReactionScheme): void => {
    const scheme = withSyncedText(next)
    const past = [...get().past, JSON.parse(JSON.stringify(get().scheme)) as ReactionScheme]
    if (past.length > HISTORY_LIMIT) past.shift()
    set({
      past,
      future: [],
      scheme,
      conserved: recomputeConservation(scheme),
      saved: false,
    })
  }

  /** 轻量变更（不改历史），用于系数微调与文字输入 */
  const patch = (next: ReactionScheme): void => {
    const scheme = withSyncedText(next)
    set({ scheme, conserved: recomputeConservation(scheme), saved: false })
  }

  return {
    scheme: emptyScheme(),
    saved: false,
    conserved: false,
    balanceResult: null,
    past: [],
    future: [],

    reset: () =>
      set({ scheme: emptyScheme(), saved: false, conserved: false, balanceResult: null, past: [], future: [] }),

    addReactant: (molecule, coeff = 1) => {
      const s = get().scheme
      commit({
        ...s,
        reactants: [...s.reactants, { id: newId(), molecule: cloneGraph(molecule), coefficient: coeff }],
      })
    },

    addProduct: (molecule, coeff = 1) => {
      const s = get().scheme
      commit({
        ...s,
        products: [...s.products, { id: newId(), molecule: cloneGraph(molecule), coefficient: coeff }],
      })
    },

    addAgent: (agent) => {
      const s = get().scheme
      commit({ ...s, agents: [...s.agents, agent] })
    },

    removeAgent: (id) => {
      const s = get().scheme
      commit({ ...s, agents: s.agents.filter((a) => a.id !== id) })
    },

    moveComponent: (side, id, to) => {
      if (side === to) return
      const s = get().scheme
      const comp = s[side].find((c) => c.id === id)
      if (!comp) return
      const fromList = s[side].filter((c) => c.id !== id)
      const toList = [...s[to], comp]
      commit(
        side === 'reactants'
          ? { ...s, reactants: fromList, products: toList }
          : { ...s, reactants: toList, products: fromList },
      )
    },

    setCoefficient: (side, id, coeff) => {
      const s = get().scheme
      const c = Math.max(1, Math.min(99, Math.round(coeff) || 1))
      patch({ ...s, [side]: s[side].map((x) => (x.id === id ? { ...x, coefficient: c } : x)) })
    },

    removeComponent: (side, id) => {
      const s = get().scheme
      commit({ ...s, [side]: s[side].filter((c) => c.id !== id) })
    },

    setArrow: (kind) => {
      const s = get().scheme
      patch({ ...s, arrow: { kind } })
    },

    setConditions: (p) => {
      const s = get().scheme
      patch({ ...s, conditions: { ...s.conditions, ...p } })
    },

    setAboveText: (text) => patch({ ...get().scheme, aboveText: text, textOverridden: true }),

    setBelowText: (text) => patch({ ...get().scheme, belowText: text, textOverridden: true }),

    applyBalance: () => {
      const s = get().scheme
      const res = balanceGraphs(
        s.reactants.map((c) => c.molecule),
        s.products.map((c) => c.molecule),
      )
      if (res.ok) {
        const apply = (list: SchemeComponent[], coeffs: number[]): SchemeComponent[] =>
          list.map((c, i) => ({ ...c, coefficient: Math.max(1, coeffs[i] ?? 1) }))
        commit({
          ...s,
          reactants: apply(s.reactants, res.reactantCoeffs),
          products: apply(s.products, res.productCoeffs),
        })
        set({ balanceResult: res })
      } else {
        set({ balanceResult: res })
      }
    },

    setSaved: (saved) => set({ saved }),

    undo: () => {
      const { past, future, scheme } = get()
      if (!past.length) return
      const prev = past[past.length - 1]
      set({
        past: past.slice(0, -1),
        future: [scheme, ...future].slice(0, HISTORY_LIMIT),
        scheme: prev,
        conserved: recomputeConservation(prev),
      })
    },

    redo: () => {
      const { past, future, scheme } = get()
      if (!future.length) return
      const next = future[0]
      set({
        past: [...past, scheme].slice(-HISTORY_LIMIT),
        future: future.slice(1),
        scheme: next,
        conserved: recomputeConservation(next),
      })
    },
  }
})

/** 从 localStorage 读回上次保存的反应式（若有） */
export function loadLastScheme(): ReactionScheme | null {
  const raw = loadJSON<ReactionScheme | null>(LS_KEY, null)
  if (!raw || !Array.isArray(raw.reactants)) return null
  return JSON.parse(JSON.stringify(raw)) as ReactionScheme
}

export function saveScheme(scheme: ReactionScheme): void {
  saveJSON(LS_KEY, scheme)
}
