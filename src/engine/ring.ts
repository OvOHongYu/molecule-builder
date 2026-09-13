/**
 * 环检测：删边后两端仍连通即为环键（设计文档 §4.3.2 开环处理）。
 */
import type { Bond, BondOrder, MoleculeGraph } from '../types/molecule'
import { bondsOfAtom, componentAfterRemoving } from './graphUtils'
import { baseValences, usedValence } from './valence'

export function isRingBond(graph: MoleculeGraph, bondId: number): boolean {
  const b = graph.bonds.find((x) => x.bond_id === bondId)
  if (!b) return false
  const comp = componentAfterRemoving(graph, bondId, b.atom1_id)
  return comp.has(b.atom2_id)
}

/**
 * 找到包含指定键的最短环（BFS 从 atom1 到 atom2 避开该键）。
 * restrict 可限定参与成环的键（如仅芳香键）。
 * 返回按环序排列的键 id 与原子 id（含环上全部原子）。
 */
export function cycleThroughBond(
  graph: MoleculeGraph,
  bondId: number,
  restrict?: (b: Bond) => boolean,
): { bondIds: number[]; atomIds: number[] } | null {
  const bond = graph.bonds.find((b) => b.bond_id === bondId)
  if (!bond) return null
  const ok = (b: Bond): boolean => (restrict ? restrict(b) : true)
  const prev = new Map<number, { atom: number; bond: number }>()
  const seen = new Set<number>([bond.atom1_id])
  const queue = [bond.atom1_id]
  while (queue.length) {
    const cur = queue.shift()!
    for (const b of graph.bonds) {
      if (b.bond_id === bondId || !ok(b)) continue
      let other: number | null = null
      if (b.atom1_id === cur) other = b.atom2_id
      else if (b.atom2_id === cur) other = b.atom1_id
      if (other === null || seen.has(other)) continue
      seen.add(other)
      prev.set(other, { atom: cur, bond: b.bond_id })
      if (other === bond.atom2_id) {
        // 还原：atom2 → … → atom1 的路径键序（回溯终点 atom1 已含在 atomIds 末尾）
        const bondIds: number[] = [bondId]
        const atomIds: number[] = [other]
        let a = other
        while (a !== bond.atom1_id) {
          const p = prev.get(a)!
          bondIds.push(p.bond)
          atomIds.push(p.atom)
          a = p.atom
        }
        return { bondIds, atomIds }
      }
      queue.push(other)
    }
  }
  return null
}

/** 返回所有环键 id 集合 */
export function ringBondIds(graph: MoleculeGraph): Set<number> {
  const out = new Set<number>()
  for (const b of graph.bonds) {
    if (isRingBond(graph, b.bond_id)) out.add(b.bond_id)
  }
  return out
}

/**
 * 苯环等价六元环：芳香键构成的六元环，或**严格单/双交替**的六元环（手工绘制的凯库勒苯环）。
 * 仅当整个分子只含这一个六元环时判定，避免稠环/多环误判。
 * 返回按环序排列的键与原子；无则返回 null。
 */
export function benzeneLikeRing(
  graph: MoleculeGraph,
): { bondIds: number[]; atomIds: number[] } | null {
  if (ringAtomIds(graph).size !== 6) return null
  const aromaticBonds = graph.bonds.filter((b) => b.aromatic)
  if (aromaticBonds.length) {
    const atoms = new Set<number>()
    for (const b of aromaticBonds) {
      atoms.add(b.atom1_id)
      atoms.add(b.atom2_id)
    }
    if (atoms.size !== 6) return null
    const cyc = cycleThroughBond(graph, aromaticBonds[0].bond_id, (x) => x.aromatic)
    if (!cyc || cyc.atomIds.length !== 6 || new Set(cyc.atomIds).size !== 6) return null
    return cyc
  }
  for (const b of graph.bonds) {
    const cyc = cycleThroughBond(graph, b.bond_id)
    if (!cyc || cyc.atomIds.length !== 6 || new Set(cyc.atomIds).size !== 6) continue
    const bs = cyc.bondIds.map((id) => graph.bonds.find((x) => x.bond_id === id)!)
    if (bs.some((x) => x.order !== 1 && x.order !== 2)) continue
    let alt = true
    for (let i = 0; i < bs.length; i++) {
      if (bs[i].order === bs[(i + 1) % bs.length].order) {
        alt = false
        break
      }
    }
    if (alt) return cyc
  }
  return null
}

/** 该键是否属于苯环等价六元环（用于工具条提示与键级切换） */
export function isBenzeneLikeBond(graph: MoleculeGraph, bondId: number): boolean {
  const ring = benzeneLikeRing(graph)
  return !!ring && ring.bondIds.includes(bondId)
}

/**
 * 桥键集合（restrict 可限定参与判定的键）。迭代版 Tarjan，O(V+E)。
 * 一条键是桥 ⇔ 删除它后两端不再连通 ⇔ 它不在任何环上。
 */
export function bridgeBondIds(graph: MoleculeGraph, restrict?: Set<number>): Set<number> {
  const eu: number[] = []
  const ev: number[] = []
  const eid: number[] = []
  const nodeAdj = new Map<number, number[]>()
  const push = (id: number, ei: number) => {
    const arr = nodeAdj.get(id)
    if (arr) arr.push(ei)
    else nodeAdj.set(id, [ei])
  }
  for (const b of graph.bonds) {
    if (restrict && !restrict.has(b.bond_id)) continue
    const ei = eid.length
    eid.push(b.bond_id)
    eu.push(b.atom1_id)
    ev.push(b.atom2_id)
    push(b.atom1_id, ei)
    push(b.atom2_id, ei)
  }
  const disc = new Map<number, number>()
  const low = new Map<number, number>()
  const bridge = new Set<number>()
  let timer = 0
  for (const start of nodeAdj.keys()) {
    if (disc.has(start)) continue
    disc.set(start, timer)
    low.set(start, timer)
    timer++
    const stack: Array<{ node: number; parentEdge: number; idx: number }> = [
      { node: start, parentEdge: -1, idx: 0 },
    ]
    while (stack.length) {
      const fr = stack[stack.length - 1]
      const inc = nodeAdj.get(fr.node)!
      if (fr.idx < inc.length) {
        const ei = inc[fr.idx++]
        if (ei === fr.parentEdge) continue
        const nxt = eu[ei] === fr.node ? ev[ei] : eu[ei]
        if (!disc.has(nxt)) {
          disc.set(nxt, timer)
          low.set(nxt, timer)
          timer++
          stack.push({ node: nxt, parentEdge: ei, idx: 0 })
        } else {
          low.set(fr.node, Math.min(low.get(fr.node)!, disc.get(nxt)!))
        }
      } else {
        stack.pop()
        const parent = stack[stack.length - 1]
        if (parent) {
          low.set(parent.node, Math.min(low.get(parent.node)!, low.get(fr.node)!))
          if (low.get(fr.node)! > disc.get(parent.node)!) bridge.add(fr.parentEdge)
        }
      }
    }
  }
  const out = new Set<number>()
  eid.forEach((bid, ei) => {
    if (bridge.has(ei)) out.add(bid)
  })
  return out
}

/**
 * 该键所在的最短环若为「显式凯库勒环」（偶数元且单/双严格交替），返回环上键序列。
 * 用于把手工画出的交替环与芳香键同等对待。
 */
export function kekuleRingThroughBond(graph: MoleculeGraph, bondId: number): number[] | null {
  const cyc = cycleThroughBond(graph, bondId)
  if (!cyc || cyc.bondIds.length < 4 || cyc.bondIds.length % 2 !== 0) return null
  const bs = cyc.bondIds.map((id) => graph.bonds.find((b) => b.bond_id === id))
  if (bs.some((b) => !b || (b.order !== 1 && b.order !== 2))) return null
  const orders = bs.map((b) => b!.order)
  for (let i = 0; i < orders.length; i++) {
    if (orders[i] === orders[(i + 1) % orders.length]) return null
  }
  return cyc.bondIds
}

/** 该键是否「芳香等价」：芳香键，或处于显式凯库勒交替环上 */
export function isAromaticLikeBond(graph: MoleculeGraph, bondId: number): boolean {
  const bond = graph.bonds.find((b) => b.bond_id === bondId)
  if (!bond) return false
  if (bond.aromatic) return true
  return kekuleRingThroughBond(graph, bondId) !== null
}

/** 为断裂的芳香残基按凯库勒交替分配显式键级（局部为森林，逐支交替） */
function assignKekuleOrders(graph: MoleculeGraph, ids: Set<number>): Map<number, BondOrder> {
  const order = new Map<number, BondOrder>()
  const adj = new Map<number, Array<{ bond: number; other: number }>>()
  const push = (a: number, e: { bond: number; other: number }) => {
    const arr = adj.get(a)
    if (arr) arr.push(e)
    else adj.set(a, [e])
  }
  for (const b of graph.bonds) {
    if (!ids.has(b.bond_id)) continue
    push(b.atom1_id, { bond: b.bond_id, other: b.atom2_id })
    push(b.atom2_id, { bond: b.bond_id, other: b.atom1_id })
  }
  const visited = new Set<number>()
  for (const start of [...adj.keys()].sort((a, b) => a - b)) {
    if (visited.has(start)) continue
    visited.add(start)
    const stack: Array<{ node: number; parentOrder: BondOrder | null }> = [
      { node: start, parentOrder: null },
    ]
    while (stack.length) {
      const { node, parentOrder } = stack.pop()!
      let first = true
      for (const e of adj.get(node) ?? []) {
        if (order.has(e.bond)) continue
        const o: BondOrder = parentOrder === null ? (first ? 2 : 1) : ((3 - parentOrder) as BondOrder)
        order.set(e.bond, o)
        if (!visited.has(e.other)) {
          visited.add(e.other)
          stack.push({ node: e.other, parentOrder: o })
        }
        first = false
      }
    }
  }
  // 价键安全：若某原子因分配的双键超价，则降为单键
  for (const a of graph.atoms) {
    const inc = adj.get(a.atom_id)
    if (!inc || inc.length < 2) continue
    const maxV = Math.max(1, ...baseValences(a.element))
    const others = bondsOfAtom(graph, a.atom_id).filter((b) => !ids.has(b.bond_id))
    const otherUsed = usedValence(others)
    let assigned = inc.reduce((s, e) => s + (order.get(e.bond) ?? 1), 0)
    if (otherUsed + assigned <= maxV) continue
    for (const e of inc) {
      if (otherUsed + assigned <= maxV) break
      if (order.get(e.bond) === 2) {
        order.set(e.bond, 1)
        assigned -= 1
      }
    }
  }
  return order
}

/**
 * 芳香性规范化：环被打断后残留的芳香键（已不在任何芳香环上）去芳香化，
 * 并按凯库勒交替赋予显式单/双键 —— 避免「环已破坏却仍标为芳香键」，同时保持双键数目与价键正确。
 */
export function normalizeAromatics(graph: MoleculeGraph): MoleculeGraph {
  const aromaticIds = new Set(graph.bonds.filter((b) => b.aromatic).map((b) => b.bond_id))
  if (!aromaticIds.size) return graph
  const bridges = bridgeBondIds(graph, aromaticIds)
  const leftover = new Set([...aromaticIds].filter((id) => bridges.has(id)))
  if (!leftover.size) return graph
  const orderOf = assignKekuleOrders(graph, leftover)
  const bonds = graph.bonds.map((b) =>
    b.aromatic && leftover.has(b.bond_id)
      ? { ...b, aromatic: false, order: orderOf.get(b.bond_id) ?? 1 }
      : b,
  )
  return { ...graph, bonds }
}

/** 返回环内原子 id 集合 */
export function ringAtomIds(graph: MoleculeGraph): Set<number> {
  const ringBonds = ringBondIds(graph)
  const out = new Set<number>()
  for (const b of graph.bonds) {
    if (ringBonds.has(b.bond_id)) {
      out.add(b.atom1_id)
      out.add(b.atom2_id)
    }
  }
  return out
}

/**
 * 找出包含某原子的最小环成员列表（用于正多边形模板）。
 * 通过 BFS 找从 atomId 到其某个邻居的另一条路径，从而还原环的原子序列。
 */
export function cycleThroughAtom(
  graph: MoleculeGraph,
  atomId: number,
): number[] | null {
  const ringIds = ringAtomIds(graph)
  if (!ringIds.has(atomId)) return null
  // BFS 找一条从 atomId 出发，经过至少一个环键回到 atomId 的最短环
  // 简化：深度受限 BFS 找最短回路（排除直接返回的边）
  let best: number[] | null = null
  const queue: { id: number; path: number[]; prevBond: number | null }[] = [
    { id: atomId, path: [], prevBond: null },
  ]
  while (queue.length) {
    const { id, path, prevBond } = queue.shift()!
    if (path.length > 12) continue
    for (const b of graph.bonds) {
      if (b.bond_id === prevBond) continue
      if (!ringIds.has(b.atom1_id) || !ringIds.has(b.atom2_id)) continue
      const next = b.atom1_id === id ? b.atom2_id : b.atom1_id
      const np = [...path, next]
      if (next === atomId) {
        if (!best || np.length < best.length) best = np
        continue
      }
      if (path.length < 12 && !path.includes(next)) {
        queue.push({ id: next, path: np, prevBond: b.bond_id })
      }
    }
  }
  return best
}