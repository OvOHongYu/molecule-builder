/**
 * 价键规则：价表、隐式氢、孤对电子、超价校验（设计文档 §5、§12）。
 */
import type { Atom, Bond, MoleculeGraph } from '../types/molecule'
import { bondsOfAtom } from './graphUtils'

/** 中性原子的常见价（含可选高价态，如 S 4/6、P 5、N 5） */
const BASE_VALENCE: Record<string, number[]> = {
  C: [4],
  N: [3, 5],
  O: [2],
  S: [2, 4, 6],
  P: [3, 5],
  F: [1],
  Cl: [1],
  Br: [1],
  I: [1],
  H: [1],
}

export function baseValences(element: string): number[] {
  return BASE_VALENCE[element] ?? [1]
}

/** 形式电荷修正后的目标价：正电荷每 +1 价减 0/1 视元素；原型取保守主价 */
function targetValence(element: string, charge: number): number {
  let v = BASE_VALENCE[element]?.[0] ?? 1
  // 常见电荷修正：O⁻/N⁻ 价不变（用于负电荷提示），正电荷原子按主价处理
  if (charge > 0 && (element === 'O' || element === 'S')) v = Math.max(1, v - 1)
  return v
}

/**
 * 计算原子已用价（设计文档 §5.3 隐式氢规则）：
 * 芳香环内原子按 Kekulé 计——首根芳香键计 2、其余芳香键各计 1（苯环碳 2 根芳香 = 3，+1 根外接键 = 4），
 * 单/双/三键分别记 order。
 */
export function usedValence(bonds: Bond[]): number {
  let used = 0
  let aromaticSeen = 0
  for (const b of bonds) {
    if (b.aromatic) {
      used += aromaticSeen === 0 ? 2 : 1
      aromaticSeen++
    } else {
      used += b.order
    }
  }
  return used
}

/** 隐式氢计算：价 − 已用价 − 自由基，负值为超价 */
export function computeImplicitH(atom: Atom, bonds: Bond[]): number {
  const t = targetValence(atom.element, atom.charge)
  const used = usedValence(bonds)
  return Math.max(0, t - used - (atom.radical > 0 ? atom.radical : 0))
}

/** 孤对电子粗略估计（仅 O/N/S/P；卤素 0），用于属性面板展示 */
export function estimateLonePairs(atom: Atom, bonds: Bond[]): number {
  if (atom.element === 'H' || atom.element === 'C') return 0
  if (['F', 'Cl', 'Br', 'I'].includes(atom.element)) return 0
  const t = targetValence(atom.element, atom.charge)
  const used = usedValence(bonds)
  // 中性：价 − 已用价 − 隐式氢；若为负（超价）取 0
  return Math.max(0, t - used - atom.implicit_h)
}

/** 全图重算 implicit_h 与 lone_pairs（所有编辑操作后调用） */
export function recalcImplicitH(graph: MoleculeGraph): MoleculeGraph {
  const g = graph.atoms.map((a) => ({ ...a }))
  const bonds = graph.bonds.map((b) => ({ ...b }))
  for (const atom of g) {
    const bs = bonds.filter((b) => b.atom1_id === atom.atom_id || b.atom2_id === atom.atom_id)
    atom.implicit_h = computeImplicitH(atom, bs)
    atom.lone_pairs = estimateLonePairs(atom, bs)
  }
  return { atoms: g, bonds, nextAtomId: graph.nextAtomId, nextBondId: graph.nextBondId }
}

export interface ValenceIssue {
  atomId: number
  element: string
  message: string
}

/** 超价校验：implicit_h < 0 的原子（含显式 H 过多的情况） */
export function valenceIssues(graph: MoleculeGraph): ValenceIssue[] {
  const issues: ValenceIssue[] = []
  const map = new Map(graph.atoms.map((a) => [a.atom_id, a]))
  for (const atom of graph.atoms) {
    const bonds = bondsOfAtom(graph, atom.atom_id)
    const used = usedValence(bonds)
    // 含显式 H：显式连接的 H 也要计入已用价
    const bondedH = bonds.filter((b) => {
      const other = b.atom1_id === atom.atom_id ? b.atom2_id : b.atom1_id
      return map.get(other)?.element === 'H'
    }).length
    const totalUsed = used
    const attempts = totalUsed + (bondedH > 0 ? 0 : 0)
    void attempts
    const t = targetValence(atom.element, atom.charge)
    if (totalUsed > t) {
      const maxVal = Math.max(...BASE_VALENCE[atom.element] ?? [1])
      // 芳香键按 1 计，可能低估；仅对明确超出主价上限报错
      if (totalUsed > maxVal) {
        issues.push({
          atomId: atom.atom_id,
          element: atom.element,
          message: `${atom.element} 最多 ${maxVal} 键，当前 ${totalUsed} 键`,
        })
      }
    }
  }
  return issues
}

/** 校验替换/新增是否导致超价（dryRun 结果） */
export function isOverValence(graph: MoleculeGraph): boolean {
  return valenceIssues(graph).length > 0
}