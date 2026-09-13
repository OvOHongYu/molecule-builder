/**
 * 几何常量与向量工具（设计文档 §7.2 几何规范）。
 * 键长 1.5 单位 × 30px/单位 ≈ 45px；统一以 px 存储坐标。
 */
import type { Atom, MoleculeGraph } from '../types/molecule'
import { atomById, neighborIds } from '../engine/graphUtils'

export const BOND_LEN = 44
/** 双键平行线间距 = 键长/5 */
export const OFF_DOUBLE = BOND_LEN / 5
export const OFF_TRIPLE = OFF_DOUBLE * 0.75
/** 原子热区半径 ≈ 0.6 倍键长 */
export const ATOM_HIT_R = BOND_LEN * 0.6
/** 键热区宽度 ≈ 0.4 倍键长 */
export const BOND_HIT_W = BOND_LEN * 0.4

export const DEG = Math.PI / 180
export const ANGLE_SP3 = 109.5 * DEG
export const ANGLE_SP2 = 120 * DEG
export const ANGLE_SP = 180 * DEG
export const TAU = Math.PI * 2

export interface Vec {
  x: number
  y: number
}

export function deg2rad(d: number): number {
  return d * DEG
}

export function vecLength(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay)
}

export function unit(vx: number, vy: number): Vec {
  const len = Math.hypot(vx, vy) || 1
  return { x: vx / len, y: vy / len }
}

export function perp(v: Vec): Vec {
  return { x: -v.y, y: v.x }
}

/** 归一化角度到 [0, 2π) */
export function normAngle(a: number): number {
  a = a % TAU
  if (a < 0) a += TAU
  return a
}

export function angleOf(dx: number, dy: number): number {
  return normAngle(Math.atan2(dy, dx))
}

export interface Positioned {
  x: number
  y: number
}

/**
 * 新增端点方向选择（设计文档 §7.3）：
 * - 已有 1 键：新键与现有键成 109.5°（sp3）或 120°（sp2，加双键时）
 * - 已有 2 键：沿锯齿方向（远离质心一侧的角平分线反向）
 * - 已有 3 键：选空隙
 * - 已有 4 键：无合适方向（返回 null，由调用方阻止）
 */
export function pickNewDirection(
  graph: MoleculeGraph,
  atomId: number,
  bondOrder: 1 | 2 | 3 = 1,
  preferFrom?: number,
): Vec | null {
  const atom = atomById(graph, atomId)
  if (!atom) return null
  const nbs = neighborIds(graph, atomId)
  const nbPos = nbs
    .map((id) => atomById(graph, id))
    .filter((a): a is Atom => !!a)
  const nbAngles = nbPos.map((p) => angleOf(p.x - atom.x, p.y - atom.y))

  // 质心朝向（用于"远离"判定）
  const atoms = graph.atoms
  const cx =
    atoms.reduce((s, a) => s + a.x, 0) / Math.max(1, atoms.length)
  const cy =
    atoms.reduce((s, a) => s + a.y, 0) / Math.max(1, atoms.length)
  const towardCentroid = angleOf(cx - atom.x, cy - atom.y)

  if (nbs.length === 0 && preferFrom) {
    // 孤立点且指定参考方向（撤销/加载还原用不到；默认水平）
    return { x: 1, y: 0 }
  }
  if (nbs.length === 0) return { x: 1, y: 0 }

  const first = nbAngles[0]
  const angle = bondOrder === 2 ? ANGLE_SP2 : ANGLE_SP3
  if (nbAngles.length === 1) {
    const cands = [first + angle, first - angle].map(normAngle)
    // 取离质心方向最远者（避免折回已有结构）
    const chosen = cands.sort((a, b) => angularDistance(b, towardCentroid) - angularDistance(a, towardCentroid))[0]
    return polar(chosen)
  }
  if (nbAngles.length === 2) {
    // 锯齿：两邻居夹角平分线反向 + 远离质心
    const mid = bisector(nbAngles[0], nbAngles[1])
    const cands = [mid, normAngle(mid + Math.PI)]
    const chosen = cands.sort((a, b) => angularDistance(b, towardCentroid) - angularDistance(a, towardCentroid))[0]
    return polar(chosen)
  }
  if (nbAngles.length === 3) {
    // 空隙：四个理想方向（±109.5 锯齿）中不在已有方向的
    const ideal = [0, ANGLE_SP2, 2 * ANGLE_SP2, 3 * ANGLE_SP2, 4 * ANGLE_SP2, 5 * ANGLE_SP2].map(normAngle)
    const free = ideal.filter(
      (a) => !nbAngles.some((nb) => angularDistance(a, nb) < 30 * DEG),
    )
    if (!free.length) return null
    const chosen = free.sort((a, b) => angularDistance(b, towardCentroid) - angularDistance(a, towardCentroid))[0]
    return polar(chosen)
  }
  return null
}

function polar(a: number): Vec {
  return { x: Math.cos(a), y: Math.sin(a) }
}

/** 两角的最小环向距离 */
export function angularDistance(a: number, b: number): number {
  const d = Math.abs(normAngle(a) - normAngle(b))
  return Math.min(d, TAU - d)
}

/** 夹角平分线（取 0/π 两解中"较短弧"的一侧） */
function bisector(a: number, b: number): number {
  const diff = normAngle(b - a)
  return diff < Math.PI ? normAngle(a + diff / 2) : normAngle(b + (TAU - diff) / 2)
}

/** 新端点坐标 */
export function endpointAt(
  atom: Positioned,
  dir: Vec,
  len: number = BOND_LEN,
): { x: number; y: number } {
  return { x: atom.x + dir.x * len, y: atom.y + dir.y * len }
}