/**
 * 描述符：分子式、重原子计数（设计文档 §9.1 实时命名输出）。
 */
import type { MoleculeGraph } from '../types/molecule'
import { bondsOfAtom } from './graphUtils'

/** 分子式（Hill 记法：C、H 优先，其余按字母序；含形式电荷标记） */
export function molecularFormula(graph: MoleculeGraph): string {
  const counts = new Map<string, number>()
  let totalCharge = 0
  for (const atom of graph.atoms) {
    totalCharge += atom.charge ?? 0
    const bonds = bondsOfAtom(graph, atom.atom_id)
    let h = atom.implicit_h
    if (atom.element === 'C') {
      // 显式连到该原子的 H 单独计数
      const explicitH = bonds.filter((b) => {
        const other = b.atom1_id === atom.atom_id ? b.atom2_id : b.atom1_id
        return graph.atoms.find((a) => a.atom_id === other)?.element === 'H'
      }).length
      h += explicitH
    }
    counts.set(atom.element, (counts.get(atom.element) ?? 0) + 1)
    if (h > 0) counts.set('H', (counts.get('H') ?? 0) + h)
  }
  const order: string[] = []
  if (counts.has('C')) order.push('C')
  if (counts.has('H')) order.push('H')
  for (const el of [...counts.keys()].sort()) {
    if (el !== 'C' && el !== 'H' && el !== '*') order.push(el)
  }
  // 忽略未知元素
  const parts = order.filter((el) => el !== '*' && counts.get(el)! > 0).map((el) => {
    const n = counts.get(el)!
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