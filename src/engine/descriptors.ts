/**
 * 描述符：分子式、重原子计数、元素计数（设计文档 §9.1 实时命名输出）。
 */
import type { MoleculeGraph } from '../types/molecule'

/**
 * 元素计数（Hill 记法的唯一数据源）。
 *
 * 口径说明：`implicit_h` 由 `usedValence()` 计算，而该函数已把「显式 H 键」计入已用价，
 * 因此显式连出的 H 原子不会重复出现在 `implicit_h` 里。故氢总数 =
 * 「显式 H 原子个数（在 atoms 中逐个计数）+ 各原子 implicit_h 之和」，无需再单独补加。
 */
export function elementCounts(graph: MoleculeGraph): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const atom of graph.atoms) {
    counts[atom.element] = (counts[atom.element] ?? 0) + 1
    if (atom.implicit_h > 0) {
      counts.H = (counts.H ?? 0) + atom.implicit_h
    }
  }
  return counts
}

/** 分子式（Hill 记法：C、H 优先，其余按字母序；含形式电荷标记） */
export function molecularFormula(graph: MoleculeGraph): string {
  const counts = elementCounts(graph)
  const totalCharge = graph.atoms.reduce((s, a) => s + (a.charge ?? 0), 0)
  const order: string[] = []
  if (counts.C) order.push('C')
  if (counts.H) order.push('H')
  for (const el of Object.keys(counts).sort()) {
    if (el !== 'C' && el !== 'H' && el !== '*') order.push(el)
  }
  const parts = order
    .filter((el) => el !== '*' && (counts[el] ?? 0) > 0)
    .map((el) => {
      const n = counts[el]
      return n === 1 ? el : `${el}${n}`
    })
  let formula = parts.join('')
  if (totalCharge > 0) formula += `^${totalCharge}+`
  else if (totalCharge < 0) formula += `^${-totalCharge}-`
  return formula || '∅'
}

export function heavyAtomCount(graph: MoleculeGraph): number {
  return graph.atoms.filter((a) => a.element !== 'H').length
}

/** 总隐式氢之和（命名/SMILES 辅助） */
export function implicitHydrogens(graph: MoleculeGraph): number {
  let n = 0
  for (const a of graph.atoms) {
    n += a.implicit_h
  }
  return n
}