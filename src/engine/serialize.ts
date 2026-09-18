/**
 * 序列化：graph → molblock / SMILES（RDKit 可用时走 RDKit 规范化，否则自定义兜底）。
 */
import type { Atom, Bond, BondOrder, MoleculeGraph } from '../types/molecule'
import { bondsOfAtom, neighborIds } from './graphUtils'
import { cycleThroughBond } from './ring'

/**
 * 芳香键 → 凯库勒交替键级。
 * 实测：V2000 的「键级 4（芳香）」写法无法被当前 RDKit MinimalLib 解析（get_mol 返回 null），
 * 而绝大多数工具也更偏好凯库勒式，故导出时统一转为单双交替。
 */
function kekuleOrders(graph: MoleculeGraph): Map<number, BondOrder> {
  const out = new Map<number, BondOrder>()
  const done = new Set<number>()
  for (const b of graph.bonds) {
    if (!b.aromatic || done.has(b.bond_id)) continue
    const cyc = cycleThroughBond(graph, b.bond_id, (x) => x.aromatic)
    if (cyc && cyc.bondIds.length >= 3) {
      cyc.bondIds.forEach((bid, i) => {
        if (done.has(bid)) return
        done.add(bid)
        out.set(bid, i % 2 === 0 ? 2 : 1)
      })
      continue
    }
    // 孤立芳香键（异常数据）：按单键处理
    done.add(b.bond_id)
    out.set(b.bond_id, 1)
  }
  return out
}

/** 分子 → V2000 molblock（供 RDKit get_mol 往返与 .mol 导出） */
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
  // V2000 的键行与电荷行按「原子在原子块中的序号（1 基）」引用原子，
  // 而不是我们的内部 atom_id（编号删除后不回收，可能不连续）。
  // 必须做 id → 序号 的映射，否则任何经过删除的分子都会写出错误的连接关系。
  const posOf = new Map<number, number>()
  graph.atoms.forEach((a, i) => posOf.set(a.atom_id, i + 1))
  for (const a of graph.atoms) {
    // 严格对齐 RDKit 自身的输出格式（实测其 get_molblock() 字段布局）：
    // x(10) y(10) z(10) + 空格(1) + 元素符号(3, 左对齐) + 质量差(2) + 11 个 3 列字段 = 69 列。
    const x = (a.x || 0).toFixed(4).padStart(10)
    const y = (a.y || 0).toFixed(4).padStart(10)
    const z = '0.0000'.padStart(10)
    lines.push(`${x}${y}${z} ${a.element.padEnd(3, ' ')} 0${'  0'.repeat(11)}`)
  }
  const kek = kekuleOrders(graph)
  for (const b of graph.bonds) {
    const order = b.aromatic ? (kek.get(b.bond_id) ?? 1) : b.order
    const p1 = posOf.get(b.atom1_id)
    const p2 = posOf.get(b.atom2_id)
    if (p1 === undefined || p2 === undefined) continue
    lines.push(`${pad(p1, 3)}${pad(p2, 3)}${pad(order, 3)}  0`)
  }
  // 形式电荷
  const charged = graph.atoms.filter((a) => a.charge !== 0)
  if (charged.length) {
    const entries = charged.map((a) => `${pad(posOf.get(a.atom_id)!, 3)} ${pad(a.charge, 3)}`)
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

/**
 * molblock → MoleculeGraph（V2000）。
 * 用于把外部来源的结构（如试剂库 SMILES 经 RDKit 转换、外部预测返回的产物）接入自有图模型。
 * 芳香性按键级推断：RDKit 输出的 Kekulé 式会被识别为交替单双键环并标记为芳香。
 */
export function molblockToGraph(mb: string): MoleculeGraph | null {
  const lines = mb.split('\n')
  const countsIdx = lines.findIndex((l) => /V2000$/.test(l.trim()))
  if (countsIdx < 0) return null
  const counts = lines[countsIdx]
  const nAtoms = parseInt(counts.slice(0, 3).trim() || '0', 10)
  const nBonds = parseInt(counts.slice(3, 6).trim() || '0', 10)
  if (!nAtoms) return null

  const atoms: Atom[] = []
  for (let i = 0; i < nAtoms; i++) {
    const line = lines[countsIdx + 1 + i]
    if (!line) return null
    const x = parseFloat(line.slice(0, 10)) || 0
    const y = parseFloat(line.slice(10, 20)) || 0
    const element = line.slice(31, 34).trim()
    if (!element) return null
    atoms.push({
      atom_id: i + 1,
      element,
      charge: 0,
      radical: 0,
      implicit_h: 0,
      stereo: '',
      lone_pairs: 0,
      x,
      y,
    })
  }

  const bonds: Bond[] = []
  for (let i = 0; i < nBonds; i++) {
    const line = lines[countsIdx + 1 + nAtoms + i]
    if (!line) break
    const a = parseInt(line.slice(0, 3).trim() || '0', 10)
    const b = parseInt(line.slice(3, 6).trim() || '0', 10)
    const raw = parseInt(line.slice(6, 9).trim() || '1', 10)
    // 键级 4 = 芳香；其余 1/2/3
    const aromatic = raw === 4
    const order: BondOrder = aromatic ? 1 : raw === 3 ? 3 : raw === 2 ? 2 : 1
    if (!a || !b) continue
    bonds.push({
      bond_id: bonds.length + 1,
      atom1_id: a,
      atom2_id: b,
      order,
      aromatic,
      stereo: '',
    })
  }

  // 形式电荷（M  CHG n atom chg ...）
  for (let i = countsIdx + 1; i < lines.length; i++) {
    const l = lines[i]
    if (!l.startsWith('M  CHG')) continue
    const n = parseInt(l.slice(6, 9).trim() || '0', 10)
    for (let k = 0; k < n; k++) {
      const off = 9 + k * 8
      const idx = parseInt(l.slice(off, off + 3).trim() || '0', 10)
      const chg = parseInt(l.slice(off + 3, off + 6).trim() || '0', 10)
      const target = atoms[idx - 1]
      if (target) target.charge = chg
    }
  }

  return {
    atoms,
    bonds,
    nextAtomId: nAtoms + 1,
    nextBondId: bonds.length + 1,
  }
}

/* ---------------- 自定义 SMILES（RDKit 不可用时的兜底） ---------------- */

function symbolOf(a: Atom, graph: MoleculeGraph): string {
  // 仅当该碳处于「芳香键」上才用小写 c；
  // 不能用 in_ring（那只是渲染层的环成员提示，饱和环同样为 true，会把环己烷误写成 c1ccccc1）
  const isAromaticCarbon =
    a.element === 'C' && bondsOfAtom(graph, a.atom_id).some((b) => b.aromatic)
  if (isAromaticCarbon) return 'c'
  let s = a.element
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
    let s = symbolOf(atom, graph)
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