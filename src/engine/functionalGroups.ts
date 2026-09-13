/**
 * 官能团氢识别（设计文档 §5 显示规则）：
 * 判定某个原子的氢是否属于「官能团氢」——这类氢不受全局「显示 C-H 氢」开关控制，需始终可见。
 *
 * 识别规则：
 *  - 杂原子（O/N/S/P）上的氢：羟基/羧基 -OH、氨基 -NH₂、巯基 -SH、磺酸基 -SO₃H 等，
 *    由原子标签合并显示（OH / NH₂ / SH），天然常显；
 *  - 醛基（甲酰基）碳上的氢：R–CHO 的甲酰氢，属于醛官能团；
 *  - 端炔碳上的氢：R–C≡C–H 的炔氢，属于炔基官能团。
 *
 * 当官能团被破坏、其组成原子已不含氢（implicit_h = 0）时不再显示——例如酮 C=O 无氢，
 * 因此不产生任何常显氢原子。
 */
import type { Atom, MoleculeGraph } from '../types/molecule'
import { atomById, bondsOfAtom } from './graphUtils'

function otherAtomElement(graph: MoleculeGraph, bond: { atom1_id: number; atom2_id: number }, atomId: number): string {
  const otherId = bond.atom1_id === atomId ? bond.atom2_id : bond.atom1_id
  return atomById(graph, otherId)?.element ?? ''
}

/** 杂原子（非 C/H）上的氢即为官能团氢 */
function isHeteroatom(element: string): boolean {
  return !['C', 'H'].includes(element)
}

/**
 * 该原子的隐式氢是否需要「无视 C-H 开关常显」。
 * 返回 true 表示属于官能团氢（且确实存在氢，即 implicit_h > 0）。
 */
export function isFunctionalHydrogenCarrier(graph: MoleculeGraph, atom: Atom): boolean {
  if (atom.implicit_h <= 0) return false
  // 杂原子氢：由标签合并显示（OH / NH₂ / SH…）
  if (isHeteroatom(atom.element)) return true
  if (atom.element !== 'C') return false
  const bs = bondsOfAtom(graph, atom.atom_id)
  // 醛/甲酰基：碳上带 C=O（此时该碳仅剩 1 个氢，即甲酰氢）
  const hasCarbonyl = bs.some(
    (b) => b.order === 2 && !b.aromatic && otherAtomElement(graph, b, atom.atom_id) === 'O',
  )
  if (hasCarbonyl) return true
  // 端炔：碳上带 C≡C（该碳的氢即炔氢）
  const hasAlkyne = bs.some((b) => b.order === 3 && otherAtomElement(graph, b, atom.atom_id) === 'C')
  if (hasAlkyne) return true
  return false
}

/** 碳原子上的隐式氢是否属于官能团氢（供渲染层筛选） */
export function carbonHasFunctionalH(graph: MoleculeGraph, atom: Atom): boolean {
  return atom.element === 'C' && isFunctionalHydrogenCarrier(graph, atom)
}
