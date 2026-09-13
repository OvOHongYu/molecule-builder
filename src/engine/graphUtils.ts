/**
 * 图工具：邻接查询、连通分量、克隆、几何包围盒。
 */
import type { Atom, Bond, MoleculeGraph } from '../types/molecule'

export function atomById(graph: MoleculeGraph, id: number): Atom | undefined {
  return graph.atoms.find((a) => a.atom_id === id)
}

export function bondById(graph: MoleculeGraph, id: number): Bond | undefined {
  return graph.bonds.find((b) => b.bond_id === id)
}

export function atomIndex(graph: MoleculeGraph, id: number): number {
  return graph.atoms.findIndex((a) => a.atom_id === id)
}

export function bondsOfAtom(graph: MoleculeGraph, atomId: number): Bond[] {
  return graph.bonds.filter((b) => b.atom1_id === atomId || b.atom2_id === atomId)
}

export interface NeighborInfo {
  atom: Atom
  bond: Bond
  /** 当前原子为起点时，对方原子在键中的角色 */
  otherId: number
}

/** 按原子编号查找，不存在返回 undefined */
export function neighborIds(graph: MoleculeGraph, atomId: number): number[] {
  const out: number[] = []
  for (const b of graph.bonds) {
    if (b.atom1_id === atomId) out.push(b.atom2_id)
    else if (b.atom2_id === atomId) out.push(b.atom1_id)
  }
  return out
}

export function degree(graph: MoleculeGraph, atomId: number): number {
  return bondsOfAtom(graph, atomId).length
}

/** 深拷贝图（扁平对象可 spread 拷贝，坐标与标记一并复制） */
export function cloneGraph(g: MoleculeGraph): MoleculeGraph {
  return {
    atoms: g.atoms.map((a) => ({ ...a })),
    bonds: g.bonds.map((b) => ({ ...b })),
    nextAtomId: g.nextAtomId,
    nextBondId: g.nextBondId,
  }
}

/** 如果移除 excludeBond 后，从 startId 出发能到达 targetId，则返回包含 targetId 的连通分量；否则返回从 startId 出发的分量 */
export function componentAfterRemoving(
  graph: MoleculeGraph,
  excludeBondId: number,
  startId: number,
): Set<number> {
  const seen = new Set<number>([startId])
  const queue = [startId]
  while (queue.length) {
    const cur = queue.pop()!
    for (const b of bondsOfAtom(graph, cur)) {
      if (b.bond_id === excludeBondId) continue
      const next = b.atom1_id === cur ? b.atom2_id : b.atom1_id
      if (!seen.has(next)) {
        seen.add(next)
        queue.push(next)
      }
    }
  }
  return seen
}

/** 连通分量集合（全部） */
export function components(graph: MoleculeGraph): Set<number>[] {
  const seen = new Set<number>()
  const comps: Set<number>[] = []
  for (const a of graph.atoms) {
    if (seen.has(a.atom_id)) continue
    const comp = new Set<number>()
    const queue = [a.atom_id]
    seen.add(a.atom_id)
    while (queue.length) {
      const cur = queue.pop()!
      comp.add(cur)
      for (const b of bondsOfAtom(graph, cur)) {
        const next = b.atom1_id === cur ? b.atom2_id : b.atom1_id
        if (!seen.has(next)) {
          seen.add(next)
          queue.push(next)
        }
      }
    }
    comps.push(comp)
  }
  return comps
}

export function graphBBox(graph: MoleculeGraph) {
  if (!graph.atoms.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const a of graph.atoms) {
    if (a.x < minX) minX = a.x
    if (a.y < minY) minY = a.y
    if (a.x > maxX) maxX = a.x
    if (a.y > maxY) maxY = a.y
  }
  return { minX, minY, maxX, maxY }
}

/** 只保留给定 id 集合中的原子与键 */
export function subgraphKeep(
  graph: MoleculeGraph,
  keepIds: Set<number>,
): MoleculeGraph {
  return {
    atoms: graph.atoms.filter((a) => keepIds.has(a.atom_id)),
    bonds: graph.bonds.filter(
      (b) => keepIds.has(b.atom1_id) && keepIds.has(b.atom2_id),
    ),
    nextAtomId: graph.nextAtomId,
    nextBondId: graph.nextBondId,
  }
}