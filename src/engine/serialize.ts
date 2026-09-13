/**
 * 序列化：graph → molblock / SMILES（RDKit 可用时走 RDKit 规范化，否则自定义兜底）。
 */
import type { Atom, MoleculeGraph } from '../types/molecule'
import { bondsOfAtom, neighborIds } from './graphUtils'

/** 分子 → V2000 molblock（供 RDKit get_mol / set_new_coords 往返） */
export function graphToMolblock(graph: MoleculeGraph): string {
  const nAtoms = graph.atoms.length
  const nBonds = graph.bonds.length
  const counts =
    `${pad(nAtoms, 3)}${pad(nBonds, 3)}  0  0  0  0  0  0  0  0999 V2000`
  const lines: string[] = []
  lines.push('  MoleculeBuilder')
  lines.push('  2026-09-12')
  lines.push('')
  lines.push(counts)
  for (const a of graph.atoms) {
    const x = (a.x || 0).toFixed(4).padStart(10)
    const y = (a.y || 0).toFixed(4).padStart(10)
    const z = '0.0000'
    // V2000 原子行：x(10) y(10) z(10) + 空格 + 元素符号（右对齐 3 列）
    lines.push(`${x}${y}${z} ${a.element.padStart(3, ' ')} 0  0  0  0  0  0  0  0  0  0  0  0`)
  }
  for (const b of graph.bonds) {
    const order = b.aromatic ? 4 : b.order
    lines.push(`${pad(b.atom1_id, 3)}${pad(b.atom2_id, 3)}${pad(order, 3)}  0  0  0  0  0`)
  }
  // 形式电荷
  const charged = graph.atoms.filter((a) => a.charge !== 0)
  if (charged.length) {
    const entries = charged.map((a) => `${pad(graph.atoms.indexOf(a) + 1, 3)} ${pad(a.charge, 3)}`)
    lines.push(`M  CHG${pad(charged.length, 3)}${entries.join('')}`)
  }
  lines.push('M  END')
  return lines.join('\n') + '\n'
}

function pad(n: number, w: number): string {
  return String(n).padStart(w, ' ')
}

/** 解析 molblock 2D 坐标（按原子行顺序返回） */
export function parseMolblockCoords(mb: string): Array<{ x: number; y: number }> {
  const lines = mb.split('\n')
  // counts 行：第 4 行（0 基下标 3）
  const countsLine = lines.find((l) => /V2000$/.test(l.trim())) ?? ''
  const nAtoms = parseInt(countsLine.slice(0, 3).trim() || '0', 10)
  const out: Array<{ x: number; y: number }> = []
  const countsIdx = lines.findIndex((l) => /V2000$/.test(l.trim()))
  for (let i = 0; i < nAtoms; i++) {
    const line = lines[countsIdx + 1 + i]
    if (!line) break
    out.push({
      x: parseFloat(line.slice(0, 10)),
      y: parseFloat(line.slice(10, 20)),
    })
  }
  return out
}

/* ---------------- 自定义 SMILES（RDKit 不可用时的兜底） ---------------- */

function symbolOf(a: Atom): string {
  if (a.in_ring && a.element === 'C') return 'c'
  const el = a.element === 'C' ? 'C' : a.element
  let s = el
  if (a.charge > 0) s += '+'.repeat(a.charge)
  if (a.charge < 0) s += '-'.repeat(-a.charge)
  return s
}

export function toFallbackSmiles(graph: MoleculeGraph): string {
  const comps = componentsOf(graph)
  return comps.map((comp) => writeComponent(graph, comp)).join('.')
}

function componentsOf(graph: MoleculeGraph): number[][] {
  const seen = new Set<number>()
  const out: number[][] = []
  for (const a of graph.atoms) {
    if (seen.has(a.atom_id)) continue
    const comp: number[] = []
    const q = [a.atom_id]
    seen.add(a.atom_id)
    while (q.length) {
      const cur = q.pop()!
      comp.push(cur)
      for (const n of neighborIds(graph, cur)) {
        if (!seen.has(n)) {
          seen.add(n)
          q.push(n)
        }
      }
    }
    out.push(comp)
  }
  return out
}

function writeComponent(graph: MoleculeGraph, comp: number[]): string {
  if (!comp.length) return ''
  const root = Math.min(...comp)
  const digitsUsed = new Set<number>()
  let nextDigit = 0

  const freeDigit = (): string => {
    let d = nextDigit
    while (digitsUsed.has(d)) d++
    nextDigit = d + 1
    // 环闭合编号：1-9，超出用 %nn
    const label = d >= 9 ? `%${d + 1}` : String(d + 1)
    digitsUsed.add(d)
    return label
  }

  const bondMarker = (fromId: number, toId: number): string => {
    const bs = graph.bonds.filter(
      (b) =>
        (b.atom1_id === fromId && b.atom2_id === toId) ||
        (b.atom1_id === toId && b.atom2_id === fromId),
    )
    const b = bs[0]
    if (!b) return ''
    if (b.aromatic) return ''
    if (b.order === 2) return '='
    if (b.order === 3) return '#'
    return ''
  }

  // 阶段一：DFS 生成树，标记树边（仅非树边才是环闭合边）
  const treeEdge = new Set<number>()
  const preorderRank = new Map<number, number>()
  const seen = new Set<number>()
  let rank = 0
  const walk = (id: number, par: number | null): void => {
    seen.add(id)
    preorderRank.set(id, rank++)
    for (const b of bondsOfAtom(graph, id)) {
      const other = b.atom1_id === id ? b.atom2_id : b.atom1_id
      if (other === par) continue
      if (seen.has(other)) continue
      treeEdge.add(b.bond_id)
      walk(other, id)
    }
  }
  walk(root, null)

  // 阶段二：非树边分配闭环数字
  const closureDigit = new Map<number, string>() // bondId -> digit
  for (const b of graph.bonds) {
    if (treeEdge.has(b.bond_id)) continue
    if (!seen.has(b.atom1_id) || !seen.has(b.atom2_id)) continue
    closureDigit.set(b.bond_id, freeDigit())
  }

  // 阶段三：DFS 写出；先写者开环，后写者闭环
  const written = new Set<number>()
  const pendingClosures = new Map<number, string[]>()
  const writeAtom = (id: number, parentId: number | null): string => {
    const atom = graph.atoms.find((a) => a.atom_id === id)!
    let s = symbolOf(atom)
    // 闭合先前打开的环（后写者）
    const closes = pendingClosures.get(id)
    if (closes?.length) {
      s += closes.join('')
      pendingClosures.delete(id)
    }
    written.add(id)
    // 非树边闭环数字：先写者（rank 更小）开环，队列记录给后写者
    for (const b of bondsOfAtom(graph, id)) {
      if (treeEdge.has(b.bond_id)) continue
      const other = b.atom1_id === id ? b.atom2_id : b.atom1_id
      const digit = closureDigit.get(b.bond_id)
      if (!digit) continue
      if (!seen.has(other)) continue
      if (preorderRank.get(other)! > preorderRank.get(id)!) {
        s += digit
        pendingClosures.set(other, [...(pendingClosures.get(other) ?? []), digit])
      }
    }
    // 分支处理：仅本原子的树边邻居作为子分支（非树边已由闭环数字表示）
    const children: number[] = []
    for (const b of bondsOfAtom(graph, id)) {
      if (!treeEdge.has(b.bond_id)) continue
      const other = b.atom1_id === id ? b.atom2_id : b.atom1_id
      if (other !== parentId && !written.has(other)) children.push(other)
    }
    if (children.length) {
      const first = children[0]
      s += bondMarker(id, first) + writeAtom(first, id)
      for (let i = 1; i < children.length; i++) {
        const c = children[i]
        s += '(' + bondMarker(id, c) + writeAtom(c, id) + ')'
      }
    }
    return s
  }

  return writeAtom(root, null)
}