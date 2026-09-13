/**
 * 键渲染：单/双/三/芳香键，平行线偏移 + 圆周截断（设计文档 §6.2、§7.2）。
 * 芳香环按 Kekulé 式渲染：单键与双键交替；环内双键的内线朝环心偏移并两端缩短，
 * 环的衔接处由「落在键轴上的主线」保证闭合。
 */
import { useMemo } from 'react'
import type { Atom, MoleculeGraph } from '../types/molecule'
import { labelRadius, clipBondSegment, unitVec, type Pt } from './renderUtils'
import { OFF_DOUBLE, OFF_TRIPLE } from '../layout/geometry'
import { cycleThroughBond, isRingBond } from '../engine/ring'
import { atomLabelText } from './atoms'

interface Props {
  graph: MoleculeGraph
  atomMap: Map<number, Atom>
}

/** 端点圆周半径：碳端点 0（隐形），杂端点按合并标签（OH/NH₂…）大小 */
function radiusOf(atom: Atom): number {
  if (atom.element === 'C') return 0
  return labelRadius(atomLabelText(atom))
}

export function atomLabel(atom: Atom): string {
  return atomLabelText(atom)
}

/** 内侧线两端缩短比例（Kekulé 内线标准画法） */
const INNER_TRIM = 0.16

interface RingData {
  /** 芳香键 id → 环内序号奇偶（0 = 双键位，1 = 单键位） */
  aromaticParity: Map<number, number>
  /** 键 id → 所在环的质心（双键内线朝此偏移） */
  centers: Map<number, Pt>
}

function centroid(graph: MoleculeGraph, atomIds: number[]): Pt | null {
  let sx = 0
  let sy = 0
  let n = 0
  for (const id of atomIds) {
    const a = graph.atoms.find((x) => x.atom_id === id)
    if (!a) return null
    sx += a.x
    sy += a.y
    n++
  }
  return n > 0 ? { x: sx / n, y: sy / n } : null
}

function computeRingData(graph: MoleculeGraph): RingData {
  const aromaticParity = new Map<number, number>()
  const centers = new Map<number, Pt>()
  const done = new Set<number>()
  // 芳香环：每个连通的芳香键环做一次奇偶分配（苯 → 0,1,0,1,0,1 交替）
  for (const b of graph.bonds) {
    if (!b.aromatic || done.has(b.bond_id)) continue
    const cyc = cycleThroughBond(graph, b.bond_id, (x) => x.aromatic)
    if (cyc && cyc.bondIds.length >= 3) {
      const c = centroid(graph, cyc.atomIds)
      if (c) {
        cyc.bondIds.forEach((bid, i) => {
          if (!done.has(bid)) {
            done.add(bid)
            aromaticParity.set(bid, i % 2)
            centers.set(bid, c)
          }
        })
        continue
      }
    }
    // 孤立芳香键（异常数据）：按单键处理
    done.add(b.bond_id)
    aromaticParity.set(b.bond_id, 1)
  }
  // 非芳香双键在环内（如环己烯）：内线同样朝环心偏移
  for (const b of graph.bonds) {
    if (b.aromatic || b.order !== 2 || centers.has(b.bond_id)) continue
    if (!isRingBond(graph, b.bond_id)) continue
    const cyc = cycleThroughBond(graph, b.bond_id)
    if (cyc) {
      const c = centroid(graph, cyc.atomIds)
      if (c) centers.set(b.bond_id, c)
    }
  }
  return { aromaticParity, centers }
}

/**
 * 双键偏移方向符号选择：避开两端已有键（设计文档 §7.2 双键轴向对齐）。
 * 返回 +1 或 -1（乘在垂直向量上）。仅用于链上双键。
 */
function pickOffsetSign(atomA: Atom, atomB: Atom, atomMap: Map<number, Atom>, graph: MoleculeGraph, u: { x: number; y: number }): 1 | -1 {
  const p = { x: -u.y, y: u.x }
  const conflict = (center: Atom, dir: { x: number; y: number }): boolean => {
    for (const b of graph.bonds) {
      if (b.atom1_id !== center.atom_id && b.atom2_id !== center.atom_id) continue
      const otherId = b.atom1_id === center.atom_id ? b.atom2_id : b.atom1_id
      const other = atomMap.get(otherId)
      if (!other || b.aromatic) continue
      const q = unitVec(other.x - center.x, other.y - center.y)
      const dot = q.x * dir.x + q.y * dir.y
      if (dot > 0.6) return true // 方向夹角 < ~53°
    }
    return false
  }
  const mA = atomMap.get(atomA.atom_id)!
  const mB = atomMap.get(atomB.atom_id)!
  const cA = conflict(mA, p)
  const cB = conflict(mB, p)
  if (cA || cB) return -1
  return 1
}

export function BondLines({ graph, atomMap }: Props) {
  const ringData = useMemo(() => computeRingData(graph), [graph])

  const renderLine = (seg: { p: Pt; v: Pt }, key?: string, opacity?: number, from = 0, to = 1) => (
    <line
      key={key}
      x1={seg.p.x + seg.v.x * from}
      y1={seg.p.y + seg.v.y * from}
      x2={seg.p.x + seg.v.x * to}
      y2={seg.p.y + seg.v.y * to}
      strokeOpacity={opacity}
      strokeLinecap="round"
    />
  )

  return (
    <g className="bonds" stroke="currentColor" strokeWidth={1.4} fill="none">
      {graph.bonds.map((b) => {
        const a = atomMap.get(b.atom1_id)
        const c = atomMap.get(b.atom2_id)
        if (!a || !c) return null
        const ra = radiusOf(a)
        const rb = radiusOf(c)
        const u = unitVec(c.x - a.x, c.y - a.y)
        const p = unitVec(-u.y, u.x)

        // —— 芳香键：Kekulé 交替（偶数位 = 双键，奇数位 = 单键）——
        if (b.aromatic) {
          const parity = ringData.aromaticParity.get(b.bond_id) ?? 1
          const center = ringData.centers.get(b.bond_id)
          if (parity === 0 && center) {
            // 双键位：主线在键轴上（保证与相邻键衔接闭合），内线朝环心偏移并缩短
            const axis = clipBondSegment(a, ra, c, rb, { x: 0, y: 0 })
            const mid = { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 }
            const inward = unitVec(center.x - mid.x, center.y - mid.y)
            const inner = clipBondSegment(a, ra, c, rb, {
              x: inward.x * OFF_DOUBLE,
              y: inward.y * OFF_DOUBLE,
            })
            return (
              <g key={b.bond_id}>
                {renderLine(axis)}
                {renderLine(inner, undefined, 1, INNER_TRIM, 1 - INNER_TRIM)}
              </g>
            )
          }
          const seg = clipBondSegment(a, ra, c, rb, { x: 0, y: 0 })
          return renderLine(seg, String(b.bond_id))
        }

        if (b.order === 1) {
          const seg = clipBondSegment(a, ra, c, rb, { x: 0, y: 0 })
          return renderLine(seg, String(b.bond_id))
        }

        if (b.order === 2) {
          // 主线永远在键轴上（与相邻键衔接），第二根线偏移一侧：
          // 环内双键侧线朝环心；链上双键侧线选空侧（避开相邻键）
          const center = ringData.centers.get(b.bond_id)
          const axis = clipBondSegment(a, ra, c, rb, { x: 0, y: 0 })
          let sideDir: Pt
          if (center) {
            const mid = { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 }
            sideDir = unitVec(center.x - mid.x, center.y - mid.y)
          } else {
            const s = pickOffsetSign(a, c, atomMap, graph, u)
            sideDir = { x: p.x * s, y: p.y * s }
          }
          const inner = clipBondSegment(a, ra, c, rb, {
            x: sideDir.x * OFF_DOUBLE,
            y: sideDir.y * OFF_DOUBLE,
          })
          return (
            <g key={b.bond_id}>
              {renderLine(axis)}
              {renderLine(inner, undefined, 1, INNER_TRIM, 1 - INNER_TRIM)}
            </g>
          )
        }

        // 三键：三条平行线
        const segs = [-1, 0, 1].map((k) =>
          clipBondSegment(a, ra, c, rb, { x: p.x * OFF_TRIPLE * k, y: p.y * OFF_TRIPLE * k }),
        )
        return (
          <g key={b.bond_id}>
            {segs.map((s, i) => (
              <line
                key={i}
                x1={s.p.x}
                y1={s.p.y}
                x2={s.p.x + s.v.x}
                y2={s.p.y + s.v.y}
                strokeLinecap="round"
              />
            ))}
          </g>
        )
      })}
    </g>
  )
}