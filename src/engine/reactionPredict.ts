/**
 * 反应预测编排（反应模块设计方案 §7.4–§7.7）。
 *
 * 流程（按 rule.kind 三类分流）：
 *  - transform（A）：SMARTS 匹配 → 试剂/温度校验 → 变换 → settle+超价 → 拆分成品 → 守恒 → 命名
 *  - qualitative（B)：不执行变换，产出文字结论；跳过配平；燃烧类由分子式自动补系数
 *  - polymer（C）：展示重复单元；跳过配平
 *
 * 竞争排序：priority × 试剂匹配度（required 满配 / anyOf 部分 / exclude 淘汰）× 位点数。
 */
import type { MoleculeGraph } from '../types/molecule'
import type { ReactionRule, RuleKind } from '../types/rule'
import { ALL_RULES } from '../data/rules'
import { matchPatternsWith } from './smarts'
import { applyTransforms } from './reactionTransform'
import { molecularFormula, elementCounts } from './descriptors'
import { mergeGraphs } from './graphUtils'

export interface PredictionInput {
  reactants: MoleculeGraph[]
  agents: string[]
  temperature?: number
  ruleId?: string
}

export interface Candidate {
  id: string
  kind: RuleKind
  ruleId: string
  ruleName: string
  category: string
  /** kind='transform'：产物拆分后的子分子 */
  products?: MoleculeGraph[]
  /** 产物系数（配平后最小系数） */
  productCoeffs?: number[]
  /** kind='qualitative'：结论 */
  conclusion?: { text: string; phenomenon?: string; equationText?: string }
  /** kind='polymer'：聚合物信息 */
  polymer?: { name: string; degreeNote?: string; repeatUnitSmiles?: string }
  /** 命中位点的自有 atom_id（用于高亮展示） */
  hitAtoms: number[]
  /** 排序说明 */
  why: string[]
  /** 温度条件是否满足 */
  tempOk: boolean
  /** 试剂说明（未指定试剂时提示） */
  agentNote?: string
  priorityScore: number
  /**
   * 外部后端返回的产物 SMILES。
   * 外部服务以 SMILES 描述产物，需经 RDKit 才能转为分子图，
   * 因此外部候选先携带原始 SMILES，由调用方在 RDKit 可用时转换后再展示结构。
   */
  externalSmiles?: string[]
}

export interface PredictionResult {
  candidates: Candidate[]
  unparseable: boolean
}

/** 试剂匹配度：exclude 命中→淘汰；required 全中→1；anyOf 中→0.5；否则 0 */
function agentScore(rule: ReactionRule, agents: string[]): number | null {
  const set = new Set(agents.map((a) => a.trim().toLowerCase()).filter(Boolean))
  if (rule.agents?.exclude?.some((e) => set.has(e.toLowerCase()))) return null
  const req = rule.agents?.required ?? []
  const any = rule.agents?.anyOf ?? []
  let score = 0
  if (req.length && !req.every((r) => set.has(r.toLowerCase()))) return null
  if (req.length) score += 0.6
  else if (any.length) {
    if (!any.some((group) => group.every((r) => set.has(r.toLowerCase())))) return null
    score += 0.4
  }
  // 未指定任何试剂：只允许无试剂约束的规则
  if (!req.length && !any.length && !rule.agents?.exclude && set.size === 0) score += 0.3
  return score
}

function resolveAgentElement(rule: ReactionRule, agents: string[]): string | undefined {
  if (!rule.elementByAgent) return undefined
  const set = new Set(agents.map((a) => a.trim().toLowerCase()))
  for (const [id, el] of Object.entries(rule.elementByAgent.byAgent)) {
    if (set.has(id.toLowerCase())) return el
  }
  return rule.elementByAgent.fallback
}

const DEFAULT_BATCH = 'R3a'

/** 运行预测（同步模式：需要已加载的 RDKit 模块） */
export function runPredictionWithAllRules(
  mod: unknown,
  input: PredictionInput,
  allRules: ReactionRule[] = ALL_RULES,
): PredictionResult {
  const candidates: Candidate[] = []
  const agents = input.agents.map((a) => a.trim().toLowerCase()).filter(Boolean)

  // 全部反应物合并为单张图，匹配跨分子反应中心
  const combined: MoleculeGraph = mergeGraphs(input.reactants)
  const unparseable = input.reactants.length > 0 && combined.atoms.length === 0

  for (const rule of allRules) {
    if (input.ruleId && rule.id !== input.ruleId) continue

    // 试剂与温度校验（transform / polymer 均可能受条件约束）
    const aScore = rule.agents ? agentScore(rule, agents) : 0.3
    if (aScore === null) continue
    let tempOk = true
    if (rule.tempRange && input.temperature != null) {
      tempOk = input.temperature >= rule.tempRange[0] && input.temperature <= rule.tempRange[1]
      if (!tempOk && rule.category === 'elimination') {
        // 消去类若温度不满足，跳过（条件分流）
        continue
      }
    }

    switch (rule.kind) {
      case 'transform': {
        if (!rule.transforms) continue
        const matches = collectMatches(mod, combined, rule)
        for (const m of matches) {
          const applied = applyTransforms(combined, rule.transforms, {
            matchOf: (p, copy) => m.matchOf(p, copy),
            agentElement: resolveAgentElement(rule, agents),
          })
          if (!applied.ok) continue
          // 拆分产物
          const products = splitFragments(applied.graph)
          if (!products.length) continue
          // 元素守恒（仅比较反应物与产物）
          const diff = elementDiff(input.reactants, products)
          const why: string[] = []
          why.push(rule.note ?? rule.name)
          if (diff.length) {
            // 说明差异来自哪里：多数情况是试剂（H₂/H₂O/X₂/HX 等）贡献了原子，
            // 这些原子进入了产物但试剂本身不在反应物侧，故无法自动配平。
            // delta = 反应物 − 产物：>0 表示反应物侧多，<0 表示反应物侧少。
            const desc = diff.map((d) => `${d.element} ${d.delta > 0 ? '多' : '少'}${Math.abs(d.delta)}`).join('、')
            const consumesAgent = rule.agents?.required?.length || rule.agents?.anyOf?.length
            why.push(
              consumesAgent
                ? `元素未完全守恒（${desc}）：试剂参与成键，其原子计入产物。采纳后可把对应试剂也加入反应物侧以完成配平`
                : `元素未完全守恒（${desc}），该规则可能只描述了主反应中心，请手工补全副产物`,
            )
          }
          if (input.agents.length === 0) {
            why.push('未指定试剂，结果仅供参考')
          }
          candidates.push({
            id: `${rule.id}-${candidates.length}-${m.hitAtoms.join('.')}`,
            kind: 'transform',
            ruleId: rule.id,
            ruleName: rule.name,
            category: rule.category,
            products,
            hitAtoms: m.hitAtoms,
            why,
            tempOk,
            priorityScore: rule.priority + aScore * 10,
          })
        }
        break
      }
      case 'qualitative': {
        const hit = firstHitAtoms(mod, combined, rule)
        if (hit === null) continue
        const why = [rule.note ?? rule.name]
        if (input.agents.length === 0) why.push('未指定试剂，结果仅供参考')
        candidates.push({
          id: `${rule.id}-q-${candidates.length}`,
          kind: 'qualitative',
          ruleId: rule.id,
          ruleName: rule.name,
          category: rule.category,
          conclusion: { text: rule.conclusion?.text ?? rule.name, phenomenon: rule.conclusion?.phenomenon },
          hitAtoms: hit,
          why,
          tempOk,
          priorityScore: rule.priority + aScore * 5,
        })
        break
      }
      case 'polymer': {
        const hit = firstHitAtoms(mod, combined, rule)
        if (hit === null) continue
        candidates.push({
          id: `${rule.id}-p-${candidates.length}`,
          kind: 'polymer',
          ruleId: rule.id,
          ruleName: rule.name,
          category: rule.category,
          polymer: {
            name: rule.polymer?.name ?? rule.name,
            degreeNote: rule.polymer?.degreeNote,
            repeatUnitSmiles: rule.polymer?.repeatUnitSmiles,
          },
          hitAtoms: hit,
          why: ['聚合反应不参与配平（n 为聚合度）'],
          tempOk,
          priorityScore: rule.priority + aScore * 5,
        })
        break
      }
    }
  }

  // 排序：priorityScore 降序
  const sorted = candidates.sort((a, b) => b.priorityScore - a.priorityScore)
  return { candidates: sorted, unparseable }
}

/** B/C 类规则的命中判定：任一 pattern 命中即算命中，返回高亮原子 */
function firstHitAtoms(mod: unknown, graph: MoleculeGraph, rule: ReactionRule): number[] | null {
  if (!rule.patterns.length) return []
  const hit = new Set<number>()
  for (const p of rule.patterns) {
    const ms = matchPatternsWith(mod, graph, p.smarts, p.labels)
    if (!ms.length) return null
    for (const m of ms) m.atomIds.forEach((id) => hit.add(id))
  }
  return [...hit]
}

function collectMatches(
  mod: unknown,
  graph: MoleculeGraph,
  rule: ReactionRule,
): Array<{ matchOf(p: string, copy?: number): Map<string, number> | null; hitAtoms: number[] }> {
  const patternMatches: Record<string, Array<Map<string, number>>> = {}
  let hit = new Set<number>()
  for (const p of rule.patterns) {
    const ms = matchPatternsWith(mod, graph, p.smarts, p.labels)
    if (!ms.length) return []
    patternMatches[p.id] = ms.map((m) => new Map(Object.entries(m.labels)))
    for (const m of ms) m.atomIds.forEach((id) => hit.add(id))
  }
  // 逐 pattern 取匹配副本数；单 pattern 全枚举，多 pattern 取首组
  return [{ matchOf: (pp, copy) => patternMatches[pp]?.[copy ?? 0] ?? null, hitAtoms: [...hit] }]
}

/** 按连通分量拆分成品为若干独立分子 */
export function splitFragments(graph: MoleculeGraph): MoleculeGraph[] {
  const comps = componentsOf(graph)
  return comps.map((ids) => ({
    atoms: graph.atoms.filter((a) => ids.has(a.atom_id)),
    bonds: graph.bonds.filter((b) => ids.has(b.atom1_id) && ids.has(b.atom2_id)),
    nextAtomId: graph.nextAtomId,
    nextBondId: graph.nextBondId,
  }))
}

function componentsOf(graph: MoleculeGraph): Set<number>[] {
  const seen = new Set<number>()
  const out: Set<number>[] = []
  for (const a of graph.atoms) {
    if (seen.has(a.atom_id)) continue
    const comp = new Set<number>()
    const q = [a.atom_id]
    seen.add(a.atom_id)
    while (q.length) {
      const cur = q.pop()!
      comp.add(cur)
      for (const b of graph.bonds) {
        let next: number | null = null
        if (b.atom1_id === cur) next = b.atom2_id
        else if (b.atom2_id === cur) next = b.atom1_id
        if (next != null && !seen.has(next)) {
          seen.add(next)
          q.push(next)
        }
      }
    }
    out.push(comp)
  }
  return out
}

/** 反应物与产物的元素差异（只列出不相等的元素） */
export function elementDiff(
  reactants: MoleculeGraph[],
  products: MoleculeGraph[],
): Array<{ element: string; delta: number }> {
  const sum = (gs: MoleculeGraph[]): Record<string, number> => {
    const r: Record<string, number> = {}
    for (const g of gs) {
      for (const [el, n] of Object.entries(elementCounts(g))) r[el] = (r[el] ?? 0) + n
    }
    return r
  }
  const l = sum(reactants)
  const r = sum(products)
  const keys = [...new Set([...Object.keys(l), ...Object.keys(r)])].sort()
  const out: Array<{ element: string; delta: number }> = []
  for (const k of keys) {
    const delta = (l[k] ?? 0) - (r[k] ?? 0)
    if (delta !== 0) out.push({ element: k, delta })
  }
  return out
}

/**
 * 燃烧类方程式：由反应物元素组成自动补全系数。
 *
 * 反应通式 CxHyOz + a O₂ → x CO₂ + (y/2) H₂O，其中 a = x + y/4 − z/2。
 * 系数可能含 1/4，故先按公分母 4 展开为整数，再约去最大公约数。
 */
export function combustionEquation(reactants: MoleculeGraph[]): string {
  const totals: Record<string, number> = {}
  for (const g of reactants) {
    for (const [el, n] of Object.entries(elementCounts(g))) totals[el] = (totals[el] ?? 0) + n
  }
  const C = totals.C ?? 0
  const H = totals.H ?? 0
  const O = totals.O ?? 0
  if (C <= 0 || H <= 0) return ''

  // 以公分母 4 表示各系数
  const fuel = 4
  const co2 = 4 * C
  const h2o = 2 * H
  const o2 = 4 * C + H - 2 * O
  if (o2 <= 0) return ''
  const g0 = gcdInt(gcdInt(fuel, co2), gcdInt(h2o, o2))
  const d = g0 > 1 ? g0 : 1

  const term = (n: number, unit: string): string => {
    const k = n / d
    return k > 1 ? `${k}${unit}` : unit
  }
  const fuelFormula = molecularFormula(reactants[0])
  if (!fuelFormula) return ''
  return `${term(fuel, fuelFormula)} + ${term(o2, 'O₂')} → ${term(co2, 'CO₂')} + ${term(h2o, 'H₂O')}`
}

function gcdInt(a: number, b: number): number {
  a = Math.abs(a)
  b = Math.abs(b)
  while (b) {
    const t = a % b
    a = b
    b = t
  }
  return a || 1
}

/** 是否为 B 类燃烧规则（供 UI 渲染方程式） */
export function isCombustionRule(rule: ReactionRule): boolean {
  return rule.kind === 'qualitative' && !!rule.conclusion?.combustion
}

/** 批次缺省 */
export function defaultOrder(): string {
  return DEFAULT_BATCH
}