/**
 * 化学规范自动整理布局（设计文档 §7）：
 *  - 环系：正多边形模板（键长严格标准化，苯环呈正六边形）
 *  - 链与取代基：BFS 铺设，按杂化态取标准键角（sp³ 109.5° / sp² 120° / sp 180°）
 *  - 候选方向按「与已放置原子的最小间距最大化」择优（原子间距优化，避免堆叠）
 *  - 按主惯性轴对齐到指定方向（自动对齐）
 *  - 多片段：水平等距排布（合理分布），整体质心保持不变
 *  - 稠合环系等非简单环：先用原坐标做键长/间距约束松弛，再接入主布局
 *  - 仅改动渲染坐标 x/y，不触碰原子与键数据（保持化学正确性与完整性）
 *
 * 性能：邻接表 + 均匀网格近邻查询，整体接近 O(n)，不含 RDKit 往返，可同步执行。
 */
import type { BondOrder, MoleculeGraph } from '../types/molecule'
import { atomById, graphBBox } from '../engine/graphUtils'
import { bridgeBondIds } from '../engine/ring'
import { BOND_LEN, DEG } from './geometry'

export interface ArrangeParams {
  /** 标准键长（px） */
  bondLength: number
  /** 原子最小间距 / 片段间隔（px） */
  spacing: number
  /** 主链对齐方向（度，0 = 水平向右） */
  direction: number
  /** 是否按主轴自动对齐到指定方向 */
  align: boolean
}

export const DEFAULT_ARRANGE_PARAMS: ArrangeParams = {
  bondLength: BOND_LEN,
  spacing: 56,
  direction: 0,
  align: true,
}

export const DIRECTION_PRESETS: Array<{ label: string; value: number }> = [
  { label: '水平', value: 0 },
  { label: '30°', value: 30 },
  { label: '60°', value: 60 },
  { label: '垂直', value: 90 },
]

interface Pt {
  x: number
  y: number
}

interface Adj {
  id: number
  order: BondOrder
  aromatic: boolean
}

/* ---------------- 均匀网格：近邻距离查询 ---------------- */

class SpaceGrid {
  private readonly cell: number
  private readonly map = new Map<string, Pt[]>()

  constructor(cell: number) {
    this.cell = Math.max(1e-3, cell)
  }

  private key(cx: number, cy: number): string {
    return `${cx}:${cy}`
  }

  add(p: Pt): void {
    const k = this.key(Math.floor(p.x / this.cell), Math.floor(p.y / this.cell))
    const arr = this.map.get(k)
    if (arr) arr.push(p)
    else this.map.set(k, [p])
  }

  /** 与已放置点的最近距离；相邻 3×3 网格内无点则视为足够远（Infinity） */
  minDist(x: number, y: number): number {
    const cx = Math.floor(x / this.cell)
    const cy = Math.floor(y / this.cell)
    let best = Infinity
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const arr = this.map.get(this.key(cx + i, cy + j))
        if (!arr) continue
        for (const p of arr) {
          const d = Math.hypot(p.x - x, p.y - y)
          if (d < best) best = d
        }
      }
    }
    return best
  }
}

/* ---------------- 邻接与杂化态 ---------------- */

function buildAdj(graph: MoleculeGraph): Map<number, Adj[]> {
  const m = new Map<number, Adj[]>()
  for (const a of graph.atoms) m.set(a.atom_id, [])
  for (const b of graph.bonds) {
    m.get(b.atom1_id)?.push({ id: b.atom2_id, order: b.order, aromatic: b.aromatic })
    m.get(b.atom2_id)?.push({ id: b.atom1_id, order: b.order, aromatic: b.aromatic })
  }
  return m
}

/** 按杂化态取标准键角（度） */
function idealBondAngle(adj: Adj[]): number {
  if (adj.some((x) => x.order === 3)) return 180
  if (adj.some((x) => x.order === 2 || x.aromatic)) return 120
  return 109.4712
}

/* ---------------- 环系 ---------------- */

/**
 * 环键集合 = 非桥键。复用 ring 模块的 O(V+E) 桥检测，
 * 避免「逐键删边再判连通」的 O(E²) 开销（大分子性能关键）。
 */
function ringBondSet(graph: MoleculeGraph): Set<number> {
  const bridges = bridgeBondIds(graph)
  const ring = new Set<number>()
  for (const b of graph.bonds) {
    if (!bridges.has(b.bond_id)) ring.add(b.bond_id)
  }
  return ring
}

interface RingSystem {
  atoms: number[]
  bonds: number[]
  /** 简单环（单环）：可用正多边形模板 */
  simple: boolean
}

function findRingSystems(
  graph: MoleculeGraph,
  compSet: Set<number>,
  ringBonds: Set<number>,
): RingSystem[] {
  const ringAdj = new Map<number, Array<{ id: number; bid: number }>>()
  const push = (id: number, e: { id: number; bid: number }) => {
    const arr = ringAdj.get(id)
    if (arr) arr.push(e)
    else ringAdj.set(id, [e])
  }
  for (const b of graph.bonds) {
    if (!ringBonds.has(b.bond_id)) continue
    if (!compSet.has(b.atom1_id) || !compSet.has(b.atom2_id)) continue
    push(b.atom1_id, { id: b.atom2_id, bid: b.bond_id })
    push(b.atom2_id, { id: b.atom1_id, bid: b.bond_id })
  }
  const seen = new Set<number>()
  const systems: RingSystem[] = []
  for (const start of ringAdj.keys()) {
    if (seen.has(start)) continue
    const atoms: number[] = []
    const bonds = new Set<number>()
    const q = [start]
    seen.add(start)
    while (q.length) {
      const cur = q.pop()!
      atoms.push(cur)
      for (const e of ringAdj.get(cur) ?? []) {
        bonds.add(e.bid)
        if (!seen.has(e.id)) {
          seen.add(e.id)
          q.push(e.id)
        }
      }
    }
    const bondList = [...bonds]
    const simple = bondList.length === atoms.length && atoms.every((a) => (ringAdj.get(a) ?? []).length === 2)
    systems.push({ atoms, bonds: bondList, simple })
  }
  return systems
}

/** 环上原子的顺次排列（可指定起点原子） */
function ringCycleOrder(graph: MoleculeGraph, sys: RingSystem, startAtom?: number): number[] | null {
  const adj = new Map<number, number[]>()
  const push = (id: number, v: number) => {
    const arr = adj.get(id)
    if (arr) arr.push(v)
    else adj.set(id, [v])
  }
  for (const bid of sys.bonds) {
    const b = graph.bonds.find((x) => x.bond_id === bid)
    if (!b) continue
    push(b.atom1_id, b.atom2_id)
    push(b.atom2_id, b.atom1_id)
  }
  const start = startAtom !== undefined && sys.atoms.includes(startAtom) ? startAtom : sys.atoms[0]
  const order = [start]
  let prev = -1
  let cur = start
  while (order.length < sys.atoms.length) {
    const nxt = (adj.get(cur) ?? []).find((x) => x !== prev && !order.includes(x))
    if (nxt === undefined) return null
    order.push(nxt)
    prev = cur
    cur = nxt
  }
  return order
}

/** 正 n 边形顶点：顶点 0 位于 startAngle */
function polygonPoints(center: Pt, n: number, R: number, startAngle: number): Pt[] {
  const pts: Pt[] = []
  for (let i = 0; i < n; i++) {
    const a = startAngle + (i * 2 * Math.PI) / n
    pts.push({ x: center.x + R * Math.cos(a), y: center.y + R * Math.sin(a) })
  }
  return pts
}

/** 稠合/复杂环系：以原坐标为初值的键长 + 间距松弛（局部坐标，质心在原点） */
function relaxRingLocal(
  graph: MoleculeGraph,
  adj: Map<number, Adj[]>,
  sys: RingSystem,
  params: ArrangeParams,
): Map<number, Pt> {
  const local = new Map<number, Pt>()
  const cur = sys.atoms.map((id) => atomById(graph, id)!)
  const cx = cur.reduce((s, a) => s + a.x, 0) / sys.atoms.length
  const cy = cur.reduce((s, a) => s + a.y, 0) / sys.atoms.length
  for (const id of sys.atoms) {
    const a = atomById(graph, id)!
    local.set(id, { x: a.x - cx, y: a.y - cy })
  }
  const set = new Set(sys.atoms)
  const bonds: Array<[number, number]> = []
  for (const b of graph.bonds) {
    if (set.has(b.atom1_id) && set.has(b.atom2_id)) bonds.push([b.atom1_id, b.atom2_id])
  }
  const ids = sys.atoms
  const iterations = Math.min(200, 40 + ids.length * 12)
  for (let it = 0; it < iterations; it++) {
    const disp = new Map<number, Pt>()
    for (const id of ids) disp.set(id, { x: 0, y: 0 })
    // 键长约束
    for (const [a, b] of bonds) {
      const pa = local.get(a)!
      const pb = local.get(b)!
      let dx = pb.x - pa.x
      let dy = pb.y - pa.y
      const d = Math.hypot(dx, dy) || 1e-6
      const f = ((d - params.bondLength) / d) * 0.5
      dx *= f
      dy *= f
      const da = disp.get(a)!
      const db = disp.get(b)!
      da.x += dx
      da.y += dy
      db.x -= dx
      db.y -= dy
    }
    // 非键原子排斥
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i]
        const b = ids[j]
        if ((adj.get(a) ?? []).some((e) => e.id === b)) continue
        const pa = local.get(a)!
        const pb = local.get(b)!
        let dx = pb.x - pa.x
        let dy = pb.y - pa.y
        const d = Math.hypot(dx, dy) || 1e-6
        if (d >= params.spacing) continue
        const f = ((params.spacing - d) / d) * 0.25
        dx *= f
        dy *= f
        const da = disp.get(a)!
        const db = disp.get(b)!
        da.x -= dx
        da.y -= dy
        db.x += dx
        db.y += dy
      }
    }
    for (const id of ids) {
      const p = local.get(id)!
      const d = disp.get(id)!
      local.set(id, { x: p.x + d.x, y: p.y + d.y })
    }
  }
  return local
}

/* ---------------- 方向择优 ---------------- */

function pickDirection(
  adj: Map<number, Adj[]>,
  p: number,
  pos: Map<number, Pt>,
  grid: SpaceGrid,
  params: ArrangeParams,
): Pt {
  const pp = pos.get(p)!
  const angles = (adj.get(p) ?? [])
    .filter((e) => pos.has(e.id))
    .map((e) => {
      const q = pos.get(e.id)!
      return Math.atan2(q.y - pp.y, q.x - pp.x)
    })
  const ideal = idealBondAngle(adj.get(p) ?? []) * DEG
  let cands: number[]
  if (!angles.length) {
    cands = [params.direction * DEG]
  } else if (angles.length === 1) {
    cands = [angles[0] + ideal, angles[0] - ideal]
  } else {
    // 已有 ≥2 键：选择最大空隙的平分线（及次大空隙）
    const sorted = [...angles].sort((a, b) => a - b)
    const gaps: Array<{ mid: number; size: number }> = []
    for (let i = 0; i < sorted.length; i++) {
      const a1 = sorted[i]
      const a2 = i + 1 === sorted.length ? sorted[0] + Math.PI * 2 : sorted[i + 1]
      gaps.push({ mid: (a1 + a2) / 2, size: a2 - a1 })
    }
    gaps.sort((x, y) => y.size - x.size)
    cands = [gaps[0].mid]
    if (gaps[1]) cands.push(gaps[1].mid)
  }
  let best = cands[0]
  let bestScore = -Infinity
  for (const a of cands) {
    const x = pp.x + Math.cos(a) * params.bondLength
    const y = pp.y + Math.sin(a) * params.bondLength
    let score = grid.minDist(x, y)
    if (!Number.isFinite(score)) score = 1e6
    if (score > bestScore + 1e-9) {
      bestScore = score
      best = a
    }
  }
  return { x: Math.cos(best), y: Math.sin(best) }
}

/* ---------------- 单元（环系整体 / 单个原子） ---------------- */

interface Unit {
  id: string
  atoms: number[]
  ring: RingSystem | null
  /** 简单环：可用正多边形模板 */
  simpleRing: boolean
}

function buildUnits(
  graph: MoleculeGraph,
  compSet: Set<number>,
  ringBonds: Set<number>,
): { units: Map<string, Unit>; unitOf: Map<number, string> } {
  const systems = findRingSystems(graph, compSet, ringBonds)
  const units = new Map<string, Unit>()
  const unitOf = new Map<number, string>()
  systems.forEach((sys, i) => {
    const id = `r${i}`
    units.set(id, { id, atoms: [...sys.atoms], ring: sys, simpleRing: sys.simple })
    for (const a of sys.atoms) unitOf.set(a, id)
  })
  const singles = [...compSet].filter((id) => !unitOf.has(id)).sort((a, b) => a - b)
  for (const id of singles) {
    const uid = `a${id}`
    units.set(uid, { id: uid, atoms: [id], ring: null, simpleRing: false })
    unitOf.set(id, uid)
  }
  return { units, unitOf }
}

/**
 * 简单环接入：以 targetAtom 为连接顶点，
 * 使该顶点正对锚点、环体沿远离锚点的方向展开 —— 连接键不会穿越环体。
 */
function placeSimpleRingAttached(
  graph: MoleculeGraph,
  sys: RingSystem,
  anchorId: number,
  targetAtom: number,
  adj: Map<number, Adj[]>,
  pos: Map<number, Pt>,
  grid: SpaceGrid,
  params: ArrangeParams,
): void {
  const n = sys.atoms.length
  if (n < 3) return
  const order = ringCycleOrder(graph, sys, targetAtom)
  if (!order) return
  const anchor = pos.get(anchorId)!
  const dir = pickDirection(adj, anchorId, pos, grid, params)
  const R = params.bondLength / (2 * Math.sin(Math.PI / n))
  // 顶点 0（连接顶点）位置
  const v0 = { x: anchor.x + dir.x * params.bondLength, y: anchor.y + dir.y * params.bondLength }
  // 环心沿 dir 再推 R，使顶点 0 恰好指向锚点、环体背向锚点
  const center = { x: v0.x + dir.x * R, y: v0.y + dir.y * R }
  const startAngle = Math.atan2(-dir.y, -dir.x)
  const pts = polygonPoints(center, n, R, startAngle)
  order.forEach((id, i) => {
    pos.set(id, pts[i])
    grid.add(pts[i])
  })
}

/** 复杂环系接入：局部松弛后旋转平移，使连接顶点落到锚点外侧、环体背向锚点 */
function placeRelaxedRingAttached(
  graph: MoleculeGraph,
  adj: Map<number, Adj[]>,
  sys: RingSystem,
  anchorId: number,
  targetAtom: number,
  params: ArrangeParams,
  pos: Map<number, Pt>,
  grid: SpaceGrid,
): void {
  const local = relaxRingLocal(graph, adj, sys, params)
  const targetLocal = local.get(targetAtom)
  if (!targetLocal) return
  const anchor = pos.get(anchorId)!
  const dir = pickDirection(adj, anchorId, pos, grid, params)
  const v0 = { x: anchor.x + dir.x * params.bondLength, y: anchor.y + dir.y * params.bondLength }
  // 把「顶点→质心」的局部方向旋转到与 dir 一致
  const phiLocal = Math.atan2(-targetLocal.y, -targetLocal.x)
  const phiTarget = Math.atan2(dir.y, dir.x)
  const rot = phiTarget - phiLocal
  const cos = Math.cos(rot)
  const sin = Math.sin(rot)
  for (const [id, p] of local) {
    const lx = p.x - targetLocal.x
    const ly = p.y - targetLocal.y
    const np = { x: v0.x + lx * cos - ly * sin, y: v0.y + lx * sin + ly * cos }
    pos.set(id, np)
    grid.add(np)
  }
}

/* ---------------- 单连通分量布局 ---------------- */

function layoutComponent(
  graph: MoleculeGraph,
  adj: Map<number, Adj[]>,
  compSet: Set<number>,
  ringBonds: Set<number>,
  params: ArrangeParams,
): Map<number, Pt> {
  const pos = new Map<number, Pt>()
  const grid = new SpaceGrid(Math.max(params.spacing, params.bondLength))
  const { units, unitOf } = buildUnits(graph, compSet, ringBonds)
  if (!units.size) return pos

  // 单位间邻接（跨单位的键）
  const uadj = new Map<string, Array<{ other: string; selfAtom: number; otherAtom: number }>>()
  const addEdge = (uid: string, e: { other: string; selfAtom: number; otherAtom: number }) => {
    const arr = uadj.get(uid)
    if (arr) arr.push(e)
    else uadj.set(uid, [e])
  }
  for (const b of graph.bonds) {
    if (!compSet.has(b.atom1_id) || !compSet.has(b.atom2_id)) continue
    const u1 = unitOf.get(b.atom1_id)!
    const u2 = unitOf.get(b.atom2_id)!
    if (u1 === u2) continue
    addEdge(u1, { other: u2, selfAtom: b.atom1_id, otherAtom: b.atom2_id })
    addEdge(u2, { other: u1, selfAtom: b.atom2_id, otherAtom: b.atom1_id })
  }
  const unitDeg = (uid: string) => (uadj.get(uid) ?? []).length

  // 根单位：最大环系优先，其次度数最高的原子（更加稳定、居中）
  const ordered = [...units.values()].sort((x, y) => {
    const rx = x.ring ? x.atoms.length : 0
    const ry = y.ring ? y.atoms.length : 0
    if (rx !== ry) return ry - rx
    const dx = unitDeg(x.id)
    const dy = unitDeg(y.id)
    if (dx !== dy) return dy - dx
    return x.atoms[0] - y.atoms[0]
  })
  const root = ordered[0]

  if (root.ring && root.simpleRing) {
    const order = ringCycleOrder(graph, root.ring)
    const n = root.ring.atoms.length
    if (order && n >= 3) {
      const R = params.bondLength / (2 * Math.sin(Math.PI / n))
      const pts = polygonPoints({ x: 0, y: 0 }, n, R, params.direction * DEG)
      order.forEach((id, i) => {
        pos.set(id, pts[i])
        grid.add(pts[i])
      })
    } else {
      const local = relaxRingLocal(graph, adj, root.ring, params)
      for (const [id, p] of local) {
        pos.set(id, p)
        grid.add(p)
      }
    }
  } else if (root.ring) {
    const local = relaxRingLocal(graph, adj, root.ring, params)
    for (const [id, p] of local) {
      pos.set(id, p)
      grid.add(p)
    }
  } else {
    pos.set(root.atoms[0], { x: 0, y: 0 })
    grid.add({ x: 0, y: 0 })
  }

  const placedUnits = new Set<string>([root.id])
  let queue: string[] = [root.id]
  while (queue.length) {
    const next: string[] = []
    for (const uid of queue) {
      for (const e of uadj.get(uid) ?? []) {
        if (placedUnits.has(e.other)) continue
        const unit = units.get(e.other)!
        const anchor = pos.get(e.selfAtom)
        if (!anchor) continue
        if (unit.ring && unit.simpleRing) {
          placeSimpleRingAttached(graph, unit.ring, e.selfAtom, e.otherAtom, adj, pos, grid, params)
        } else if (unit.ring) {
          placeRelaxedRingAttached(graph, adj, unit.ring, e.selfAtom, e.otherAtom, params, pos, grid)
        } else {
          const dir = pickDirection(adj, e.selfAtom, pos, grid, params)
          const np = { x: anchor.x + dir.x * params.bondLength, y: anchor.y + dir.y * params.bondLength }
          pos.set(e.otherAtom, np)
          grid.add(np)
        }
        placedUnits.add(unit.id)
        next.push(unit.id)
      }
    }
    queue = next
  }

  // 兜底：极端情况下仍有未放置原子 → 从已放置邻居按标准方向外推
  for (const id of compSet) {
    if (pos.has(id)) continue
    const e = (adj.get(id) ?? []).find((x) => pos.has(x.id))
    if (!e) continue
    const dir = pickDirection(adj, e.id, pos, grid, params)
    const ap = pos.get(e.id)!
    const np = { x: ap.x + dir.x * params.bondLength, y: ap.y + dir.y * params.bondLength }
    pos.set(id, np)
    grid.add(np)
  }
  return pos
}

/* ---------------- 对齐 / 归一化 ---------------- */

function centroid(m: Map<number, Pt>): Pt {
  let sx = 0
  let sy = 0
  for (const p of m.values()) {
    sx += p.x
    sy += p.y
  }
  const n = Math.max(1, m.size)
  return { x: sx / n, y: sy / n }
}

/** 按主惯性轴（PCA）旋转，使长轴对齐到指定方向 */
function alignTo(m: Map<number, Pt>, directionDeg: number): void {
  if (m.size < 3) return
  const c = centroid(m)
  let sxx = 0
  let syy = 0
  let sxy = 0
  for (const p of m.values()) {
    const dx = p.x - c.x
    const dy = p.y - c.y
    sxx += dx * dx
    syy += dy * dy
    sxy += dx * dy
  }
  const phi = 0.5 * Math.atan2(2 * sxy, sxx - syy)
  // 分子过于“圆”时不旋转，避免无意义翻转
  const aniso = Math.abs(sxx - syy) + 2 * Math.abs(sxy)
  if (aniso < 1e-6) return
  const rot = directionDeg * DEG - phi
  const cos = Math.cos(rot)
  const sin = Math.sin(rot)
  for (const [id, p] of m) {
    const dx = p.x - c.x
    const dy = p.y - c.y
    m.set(id, { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos })
  }
}

function mapBBox(m: Map<number, Pt>): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of m.values()) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { minX, minY, maxX, maxY }
}

/* ---------------- 入口 ---------------- */

/**
 * 自动整理布局：返回仅坐标变化的新分子图（原子/键/键级/芳香性完全不变）。
 */
export function arrangeLayout(graph: MoleculeGraph, paramsIn?: Partial<ArrangeParams>): MoleculeGraph {
  if (!graph.atoms.length) return graph
  const params: ArrangeParams = { ...DEFAULT_ARRANGE_PARAMS, ...paramsIn }
  const adj = buildAdj(graph)

  // 连通分量（按邻接表遍历，避免重复扫描键）
  const seen = new Set<number>()
  const comps: Set<number>[] = []
  for (const a of graph.atoms) {
    if (seen.has(a.atom_id)) continue
    const comp = new Set<number>()
    const q = [a.atom_id]
    seen.add(a.atom_id)
    while (q.length) {
      const cur = q.pop()!
      comp.add(cur)
      for (const e of adj.get(cur) ?? []) {
        if (!seen.has(e.id)) {
          seen.add(e.id)
          q.push(e.id)
        }
      }
    }
    comps.push(comp)
  }

  const laid: Array<Map<number, Pt>> = []
  const ringBonds = ringBondSet(graph)
  for (const comp of comps) {
    const m = layoutComponent(graph, adj, comp, ringBonds, params)
    if (m.size) {
      if (params.align) alignTo(m, params.direction)
      laid.push(m)
    }
  }
  // 大的片段排前面，视觉更稳
  laid.sort((x, y) => y.size - x.size)

  const positions = new Map<number, Pt>()
  const gap = Math.max(params.spacing, params.bondLength)
  let cursorX = 0
  for (const m of laid) {
    const b = mapBBox(m)
    const dy = -(b.minY + b.maxY) / 2
    const dx = cursorX - b.minX
    for (const [id, p] of m) positions.set(id, { x: p.x + dx, y: p.y + dy })
    cursorX += b.maxX - b.minX + gap
  }

  // 整体平移回原质心，避免视图跳变
  const oldBox = graphBBox(graph)
  const oldCx = (oldBox.minX + oldBox.maxX) / 2
  const oldCy = (oldBox.minY + oldBox.maxY) / 2
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of positions.values()) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  const ox = oldCx - (minX + maxX) / 2
  const oy = oldCy - (minY + maxY) / 2

  const round = (v: number) => Math.round(v * 10) / 10
  return {
    ...graph,
    atoms: graph.atoms.map((a) => {
      const p = positions.get(a.atom_id)
      return p ? { ...a, x: round(p.x + ox), y: round(p.y + oy), manuallyPlaced: false } : a
    }),
  }
}
