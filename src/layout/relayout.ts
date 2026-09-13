/**
 * 排版编排（设计文档 §7.1 触发时机）：
 * - localRelax：编辑后局部微调（新端点已按标准角放置，此处仅修正键长漂移）。
 */
import type { MoleculeGraph } from '../types/molecule'
import { atomById, bondsOfAtom } from '../engine/graphUtils'
import { BOND_LEN } from './geometry'

/** 局部松弛：键长标准化（手动锁定原子不动） */
export function localRelax(graph: MoleculeGraph): MoleculeGraph {
  const atoms = graph.atoms.map((a) => ({ ...a }))
  // 按原子序号从大到小处理叶子节点，向父节点方向归一键长
  const sorted = [...atoms].sort((a, b) => b.atom_id - a.atom_id)
  for (const atom of sorted) {
    if (atom.manuallyPlaced) continue
    const bs = bondsOfAtom(graph, atom.atom_id)
    if (bs.length !== 1) continue
    const b = bs[0]
    const parentId = b.atom1_id === atom.atom_id ? b.atom2_id : b.atom1_id
    const parent = atomById(graph, parentId)
    if (!parent) continue
    const dx = atom.x - parent.x
    const dy = atom.y - parent.y
    const len = Math.hypot(dx, dy)
    if (len < 1e-6) continue
    const k = BOND_LEN / len
    const idx = atoms.findIndex((a) => a.atom_id === atom.atom_id)
    if (idx >= 0) {
      atoms[idx].x = parent.x + dx * k
      atoms[idx].y = parent.y + dy * k
    }
  }
  return {
    ...graph,
    atoms,
    nextAtomId: graph.nextAtomId,
    nextBondId: graph.nextBondId,
  }
}