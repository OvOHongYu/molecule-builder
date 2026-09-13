/**
 * 纯函数编辑操作（设计文档 §4）：addBond / addAtom / addGroup / replace / delete。
 * 只操作图数据 + 初始坐标；不做命名/排版（由 store 编排）。
 */
import type { Atom, Bond, BondOrder, GroupKey, MoleculeGraph } from '../types/molecule'
import { atomById, bondsOfAtom, componentAfterRemoving, neighborIds, subgraphKeep } from './graphUtils'
import { recalcImplicitH, valenceIssues } from './valence'
import { cycleThroughBond, kekuleRingThroughBond, normalizeAromatics } from './ring'
import { BOND_LEN, DEG, endpointAt, pickNewDirection, type Vec } from '../layout/geometry'

export type OpsResult =
  | { ok: true; graph: MoleculeGraph; message?: string }
  | { ok: false; error: string; atomIds?: number[] }

/** 收尾：芳香性规范化 + 隐式氢重算（所有编辑路径统一走这里） */
function settle(g: MoleculeGraph): MoleculeGraph {
  return recalcImplicitH(normalizeAromatics(g))
}

/** 批量应用编辑结果的入口：重算 implicit_h + 校验 */
function finalize(g: MoleculeGraph): OpsResult {
  const graph = settle(g)
  const issues = valenceIssues(graph).filter((i) => i.atomId >= 0)
  if (issues.length) {
    return {
      ok: false,
      error: issues.map((i) => i.message).join('；'),
      atomIds: issues.map((i) => i.atomId),
    }
  }
  return { ok: true, graph }
}

function mkAtom(g: MoleculeGraph, element: string, x: number, y: number): { graph: MoleculeGraph; atom: Atom } {
  const atom: Atom = {
    atom_id: g.nextAtomId,
    element,
    charge: 0,
    radical: 0,
    implicit_h: 0,
    stereo: '',
    lone_pairs: 0,
    x,
    y,
  }
  return {
    graph: { ...g, atoms: [...g.atoms, atom], nextAtomId: g.nextAtomId + 1 },
    atom,
  }
}

function mkBond(
  g: MoleculeGraph,
  a: number,
  b: number,
  order: BondOrder = 1,
  aromatic = false,
): MoleculeGraph {
  const bond: Bond = {
    bond_id: g.nextBondId,
    atom1_id: a,
    atom2_id: b,
    order,
    aromatic,
    stereo: '',
  }
  return { ...g, bonds: [...g.bonds, bond], nextBondId: g.nextBondId + 1 }
}

/** 默认乙烷：一条线、两个隐形碳端点（设计文档 §3.1） */
export function resetEthane(): MoleculeGraph {
  let g: MoleculeGraph = { atoms: [], bonds: [], nextAtomId: 1, nextBondId: 1 }
  const a = mkAtom(g, 'C', 120, 150)
  g = a.graph
  const b = mkAtom(g, 'C', 164, 150)
  g = b.graph
  g = mkBond(g, a.atom.atom_id, b.atom.atom_id, 1)
  g = recalcImplicitH(g)
  return g
}

/** 4.1.1 增加键：对面生成默认隐形碳端点 */
export function addBond(graph: MoleculeGraph, atomId: number, order: BondOrder, aromatic = false): OpsResult {
  const atom = atomById(graph, atomId)
  if (!atom) return { ok: false, error: '原子不存在' }
  const existing = neighborIds(graph, atomId).length
  if (existing >= 4) return { ok: false, error: '该原子已连接 4 个键' }
  if (aromatic) {
    // §12：芳香键添加到非环结构 → 提示并降为单键
    return { ok: false, error: '芳香键需在环中使用，请使用单键' }
  }
  const dir = pickNewDirection(graph, atomId, order)
  if (!dir) return { ok: false, error: '该原子已无可用方向' }
  const pos = endpointAt(atom, dir)
  const n = mkAtom(graph, 'C', pos.x, pos.y)
  const g = mkBond(n.graph, atomId, n.atom.atom_id, order, false)
  return finalize(g)
}

/** 4.1.2 增加原子：默认单键连接 */
export function addAtom(graph: MoleculeGraph, atomId: number, element: string): OpsResult {
  if (!['H', 'O', 'N', 'S', 'P', 'F', 'Cl', 'Br', 'I'].includes(element)) {
    return { ok: false, error: '不支持的原子' }
  }
  const atom = atomById(graph, atomId)
  if (!atom) return { ok: false, error: '原子不存在' }
  if (neighborIds(graph, atomId).length >= 4) return { ok: false, error: '该原子已连接 4 个键' }
  const dir = pickNewDirection(graph, atomId)
  if (!dir) return { ok: false, error: '该原子已无可用方向' }
  const pos = endpointAt(atom, dir)
  const n = mkAtom(graph, element, pos.x, pos.y)
  const g = mkBond(n.graph, atomId, n.atom.atom_id, 1, false)
  return finalize(g)
}

/** 4.1.3 增加基团：基团整体接入，内部按标准结构式排版 */
export function addGroup(graph: MoleculeGraph, atomId: number, group: GroupKey): OpsResult {
  const atom = atomById(graph, atomId)
  if (!atom) return { ok: false, error: '原子不存在' }
  if (neighborIds(graph, atomId).length >= 4) return { ok: false, error: '该原子已连接 4 个键' }
  const dir = pickNewDirection(graph, atomId)
  if (!dir) return { ok: false, error: '该原子已无可用方向' }
  return buildFragment(graph, atomId, group, atom, dir)
}

function buildFragment(
  graph: MoleculeGraph,
  attachId: number,
  group: GroupKey,
  anchor: Atom,
  dir: Vec,
): OpsResult {
  const L = BOND_LEN
  const ang = Math.atan2(dir.y, dir.x)
  const pt = (base: { x: number; y: number }, aDeg: number, dist: number) => {
    const a = (ang + aDeg * DEG) as number
    return { x: base.x + Math.cos(a) * dist, y: base.y + Math.sin(a) * dist }
  }

  let g: MoleculeGraph = { ...graph }

  const add = (el: string, x: number, y: number) => {
    const r = mkAtom(g, el, x, y)
    g = r.graph
    return r.atom
  }
  const link = (a: number, b: number, order: BondOrder = 1, aromatic = false) => {
    g = mkBond(g, a, b, order, aromatic)
  }

  const p1 = pt(anchor, 0, L) // 连接点位置

  switch (group) {
    case 'OH': {
      const o = add('O', p1.x, p1.y)
      link(attachId, o.atom_id, 1)
      break
    }
    case 'NH2': {
      const n = add('N', p1.x, p1.y)
      link(attachId, n.atom_id, 1)
      break
    }
    case 'CH3': {
      const c = add('C', p1.x, p1.y)
      link(attachId, c.atom_id, 1)
      break
    }
    case 'COOH': {
      const ca = add('C', p1.x, p1.y)
      const o1 = add('O', pt(ca, 60, L).x, pt(ca, 60, L).y)
      const o2 = add('O', pt(ca, -60, L).x, pt(ca, -60, L).y)
      link(attachId, ca.atom_id, 1)
      link(ca.atom_id, o1.atom_id, 2)
      link(ca.atom_id, o2.atom_id, 1)
      break
    }
    case 'CHO': {
      const ca = add('C', p1.x, p1.y)
      const o1 = add('O', pt(ca, 40, L).x, pt(ca, 40, L).y)
      link(attachId, ca.atom_id, 1)
      link(ca.atom_id, o1.atom_id, 2)
      break
    }
    case 'NO2': {
      const n = add('N', p1.x, p1.y)
      const o1 = add('O', pt(n, 55, L).x, pt(n, 55, L).y)
      const o2 = add('O', pt(n, -55, L).x, pt(n, -55, L).y)
      link(attachId, n.atom_id, 1)
      link(n.atom_id, o1.atom_id, 2)
      link(n.atom_id, o2.atom_id, 1)
      break
    }
    case 'SO3H': {
      const s = add('S', p1.x, p1.y)
      const o1 = add('O', pt(s, 50, L).x, pt(s, 50, L).y)
      const o2 = add('O', pt(s, 170, L).x, pt(s, 170, L).y)
      const o3 = add('O', pt(s, 290, L).x, pt(s, 290, L).y)
      link(attachId, s.atom_id, 1)
      link(s.atom_id, o1.atom_id, 2)
      link(s.atom_id, o2.atom_id, 2)
      link(s.atom_id, o3.atom_id, 1)
      break
    }
    case 'Ph': {
      // 正六边形苯环：中心在连接点沿 dir 方向一个键长处
      const center = pt(anchor, 0, 2 * L)
      const R = L // 边长 = 键长 → R = L
      const startAngle = ang + 180 * DEG // 顶点 0 指向锚点方向
      const ring: Atom[] = []
      for (let k = 0; k < 6; k++) {
        const a = startAngle + (k * 60 * DEG)
        ring.push(add('C', center.x + Math.cos(a) * R, center.y + Math.sin(a) * R))
      }
      link(attachId, ring[0].atom_id, 1)
      for (let k = 0; k < 6; k++) {
        link(ring[k].atom_id, ring[(k + 1) % 6].atom_id, 1, true)
      }
      // 标记环成员
      for (const r of ring) {
        const idx = g.atoms.findIndex((x) => x.atom_id === r.atom_id)
        if (idx >= 0) g.atoms[idx] = { ...g.atoms[idx], in_ring: true }
      }
      break
    }
  }
  return finalize(g)
}

/** 4.4 修改键级：选中键在单/双/三键间切换。
 *  芳香键 / 显式凯库勒环上的键 → 所在环整体按凯库勒交替重排（选中键取目标键级）；
 *  其余键（含环被打断后残留的芳香键）→ 去芳香化并直接改键级。 */
export function setBondOrder(graph: MoleculeGraph, bondId: number, order: BondOrder): OpsResult {
  const idx = graph.bonds.findIndex((b) => b.bond_id === bondId)
  if (idx < 0) return { ok: false, error: '键不存在' }
  const bond = graph.bonds[idx]
  // 定位所在环：芳香键走芳香环，普通键走「显式凯库勒交替环」
  const ringBondIds = bond.aromatic
    ? (cycleThroughBond(graph, bondId, (b) => b.aromatic)?.bondIds ?? null)
    : kekuleRingThroughBond(graph, bondId)
  if (ringBondIds && ringBondIds.length >= 3) {
    // 以选中键为起点，沿环交替赋值（选中键取目标键级，其余交替）
    const ci = ringBondIds.indexOf(bondId)
    const ordered = [...ringBondIds.slice(ci), ...ringBondIds.slice(0, ci)]
    const ringSet = new Set(ringBondIds)
    const alt: BondOrder = order === 1 ? 2 : 1
    let changed = false
    const bonds = graph.bonds.map((b) => {
      if (!ringSet.has(b.bond_id)) return b
      const o = ordered.indexOf(b.bond_id) % 2 === 0 ? order : alt
      if (b.aromatic || b.order !== o) {
        changed = true
        return { ...b, aromatic: false, order: o }
      }
      return b
    })
    if (!changed) return { ok: true, graph }
    return finalize({ ...graph, bonds })
  }
  if (!bond.aromatic && bond.order === order) return { ok: true, graph }
  const bonds = graph.bonds.map((b) =>
    b.bond_id === bondId ? { ...b, aromatic: false, order } : b,
  )
  return finalize({ ...graph, bonds })
}

/**
 * 4.5 用键连接两个已存在的原子（不新增端点、不改动坐标）。
 * 用于指定任意两原子直接成键。
 */
export function connectAtoms(graph: MoleculeGraph, aId: number, bId: number, order: BondOrder): OpsResult {
  if (aId === bId) return { ok: false, error: '不能连接同一个原子' }
  if (!atomById(graph, aId) || !atomById(graph, bId)) return { ok: false, error: '原子不存在' }
  const exists = graph.bonds.some(
    (b) =>
      (b.atom1_id === aId && b.atom2_id === bId) ||
      (b.atom1_id === bId && b.atom2_id === aId),
  )
  if (exists) return { ok: false, error: '这两个原子之间已有键' }
  if (neighborIds(graph, aId).length >= 4) return { ok: false, error: `原子 #${aId} 已连接 4 个键` }
  if (neighborIds(graph, bId).length >= 4) return { ok: false, error: `原子 #${bId} 已连接 4 个键` }
  return finalize(mkBond(graph, aId, bId, order, false))
}

/** 4.2 替换为原子：保留原有连接键 */
export function replaceAtomElement(graph: MoleculeGraph, atomId: number, element: string): OpsResult {
  const idx = graph.atoms.findIndex((a) => a.atom_id === atomId)
  if (idx < 0) return { ok: false, error: '原子不存在' }
  const prev = graph.atoms[idx]
  if (prev.element === element) return { ok: true, graph }
  // H 替换需要检查目标原子价
  const next: Atom = { ...prev, element }
  if (element === 'H') {
    const bonds = bondsOfAtom(graph, atomId)
    if (bonds.length > 1) return { ok: false, error: 'H 只能连接 1 个键' }
  }
  const atoms = [...graph.atoms]
  atoms[idx] = next
  return finalize({ ...graph, atoms })
}

/** 4.2 替换为基团：原原子被移除，其连接键改连到基团连接点 */
export function replaceWithGroup(graph: MoleculeGraph, atomId: number, group: GroupKey): OpsResult {
  const atom = atomById(graph, atomId)
  if (!atom) return { ok: false, error: '原子不存在' }
  const incident = bondsOfAtom(graph, atomId).map((b) => ({
    b,
    other: b.atom1_id === atomId ? b.atom2_id : b.atom1_id,
  }))
  // 构建基团（以 atom 为锚点）
  const built = buildFragment(graph, atomId, group, atom, { x: 1, y: 0 })
  if (!built.ok) return built
  let g = built.graph
  // 移除原原子；将原连接键改连到基团连接点
  // 基团连接点 = 唯一与 atomId 有键的碎片原子
  const fragAtom = g.atoms.find(
    (a) => a.atom_id !== atomId && a.element === 'C' && bondsOfAtom(g, a.atom_id).some((b) => {
      const other = b.atom1_id === a.atom_id ? b.atom2_id : b.atom1_id
      return other === atomId
    }),
  )
  if (fragAtom) {
    const bonds = g.bonds.map((b) => {
      if (b.atom1_id === atomId) return { ...b, atom1_id: fragAtom.atom_id }
      if (b.atom2_id === atomId) return { ...b, atom2_id: fragAtom.atom_id }
      return b
    })
    g = { ...g, bonds }
  }
  // 清理曾经的连接键（碎片内部键自动保留）
  g = { ...g, atoms: g.atoms.filter((a) => a.atom_id !== atomId) }
  g = { ...g, bonds: g.bonds.filter((b) => b.atom1_id !== atomId && b.atom2_id !== atomId) }
  // 调整碎片连接点坐标回原位，避免整体漂移
  if (fragAtom) {
    g = { ...g, atoms: g.atoms.map((a) => (a.atom_id === fragAtom.atom_id ? { ...a, x: atom.x, y: atom.y } : a)) }
  }
  void incident
  return finalize(g)
}

/* ---------------- 删除（设计文档 §4.3） ---------------- */

export interface BranchChoice {
  branchAtomId: number
  comp: number[]
  side: 'left' | 'right' | 'up' | 'down' | 'up-left' | 'up-right' | 'down-left' | 'down-right'
  label: string
}

export type DeleteOutcome =
  | { kind: 'done'; graph: MoleculeGraph }
  | { kind: 'ask-branch'; branches: BranchChoice[]; targetId: number }
  | { kind: 'empty' }

export const BRANCH_LABELS: Record<BranchChoice['side'], string> = {
  left: '保留左侧',
  right: '保留右侧',
  up: '保留上方',
  down: '保留下方',
  'up-left': '保留左上方',
  'up-right': '保留右上方',
  'down-left': '保留左下方',
  'down-right': '保留右下方',
}

/** 求分支方位标签：按直接相邻原子相对中心的方向划分为 8 扇区（避免同侧重复标签） */
function sideLabel(center: { x: number; y: number }, target: { x: number; y: number } | undefined): BranchChoice['side'] {
  if (!target) return 'left'
  const dx = target.x - center.x
  const dy = target.y - center.y
  const a = (Math.atan2(dy, dx) * 180) / Math.PI
  const an = (a + 360) % 360
  if (an >= 337.5 || an < 22.5) return 'right'
  if (an < 67.5) return 'up-right'
  if (an < 112.5) return 'up'
  if (an < 157.5) return 'up-left'
  if (an < 202.5) return 'left'
  if (an < 247.5) return 'down-left'
  if (an < 292.5) return 'down'
  return 'down-right'
}

/** 4.3.1 删除原子：非碳 → 视为替换为碳；碳按分支规则处理 */
export function deleteAtom(graph: MoleculeGraph, atomId: number): DeleteOutcome {
  const atom = atomById(graph, atomId)
  if (!atom) return { kind: 'done', graph }

  if (atom.element !== 'C') {
    // §4.3.1：非碳原子删除 → 视为替换为碳（保留原连接键）
    const replaced = replaceAtomElement(graph, atomId, 'C')
    return { kind: 'done', graph: replaced.ok ? replaced.graph : graph }
  }

  const neighbors = neighborIds(graph, atomId)
  if (neighbors.length === 0) {
    // 孤立碳：直接删除
    const g = { ...graph, atoms: graph.atoms.filter((a) => a.atom_id !== atomId) }
    if (!g.atoms.length) return { kind: 'empty' }
    return { kind: 'done', graph: settle(g) }
  }
  if (neighbors.length === 1) {
    // 单键：删该原子与该键，对侧成为新端点
    const g = {
      ...graph,
      atoms: graph.atoms.filter((a) => a.atom_id !== atomId),
      bonds: graph.bonds.filter((b) => b.atom1_id !== atomId && b.atom2_id !== atomId),
    }
    if (!g.atoms.length) return { kind: 'empty' }
    return { kind: 'done', graph: settle(g) }
  }
  // ≥2 键：分支选择
  const branches: BranchChoice[] = neighbors.map((nid) => {
    const comp = [...componentAfterRemoving(graph, -1, nid)].filter((id) => id !== atomId)
    const nbAtom = atomById(graph, nid)
    const side = sideLabel(atom, nbAtom)
    return { branchAtomId: nid, comp, side, label: BRANCH_LABELS[side] }
  })
  return { kind: 'ask-branch', branches, targetId: atomId }
}

/** 分支选择确认：保留 branchAtomId 所在分量，删除目标原子与其余全部分量 */
export function finishDeleteAtom(graph: MoleculeGraph, atomId: number, keepBranchAtomId: number): DeleteOutcome {
  const without = {
    ...graph,
    bonds: graph.bonds.filter((b) => b.atom1_id !== atomId && b.atom2_id !== atomId),
  }
  const kept = componentAfterRemoving(without, -1, keepBranchAtomId)
  const g = subgraphKeep(without, kept)
  if (!g.atoms.length) return { kind: 'empty' }
  return { kind: 'done', graph: settle(g) }
}

/** 4.3.2 删除键：环键开环；非环键保留一侧 */
export function deleteBond(graph: MoleculeGraph, bondId: number): DeleteOutcome {
  const bond = graph.bonds.find((b) => b.bond_id === bondId)
  if (!bond) return { kind: 'done', graph }

  // 环内键：仅断开该键，不删除原子（§4.3.2 末条）
  const compA = componentAfterRemoving(graph, bondId, bond.atom1_id)
  if (compA.has(bond.atom2_id)) {
    const g = { ...graph, bonds: graph.bonds.filter((b) => b.bond_id !== bondId) }
    return { kind: 'done', graph: settle(g) }
  }

  const sideA = [...componentAfterRemoving(graph, bondId, bond.atom1_id)]
  const sideB = [...componentAfterRemoving(graph, bondId, bond.atom2_id)]
  const atomA = atomById(graph, bond.atom1_id)!
  const atomB = atomById(graph, bond.atom2_id)!

  // 判断两侧是否有"独立结构"（各自除了自身是否还有原子）
  const aHas = sideA.some((id) => id !== bond.atom1_id)
  const bHas = sideB.some((id) => id !== bond.atom2_id)
  if (aHas && bHas) {
    // 分支方位：以键中点两侧端点为参照互指
    const sideA2 = sideLabel(atomA, atomB)
    const sideB2 = sideLabel(atomB, atomA)
    const branches: BranchChoice[] = [
      {
        branchAtomId: bond.atom1_id,
        comp: sideA,
        side: sideA2,
        label: BRANCH_LABELS[sideA2],
      },
      {
        branchAtomId: bond.atom2_id,
        comp: sideB,
        side: sideB2,
        label: BRANCH_LABELS[sideB2],
      },
    ]
    return { kind: 'ask-branch', branches, targetId: bond.atom1_id }
  }

  // 有一侧无结构：删除该侧端点 + 键（§4.3.2 清理孤立端点）
  const keepSide = aHas ? sideA : sideB
  const g = subgraphKeep(graph, new Set(keepSide))
  if (!g.atoms.length) return { kind: 'empty' }
  // 需要重新过滤键（只保留两端都在 keepSide 内的键）
  const keptSet = new Set(keepSide)
  return {
    kind: 'done',
    graph: settle({ ...g, bonds: graph.bonds.filter((b) => keptSet.has(b.atom1_id) && keptSet.has(b.atom2_id)) }),
  }
}

/** 删除键的确认：保留 keepAtomId 所在分量 */
export function finishDeleteBond(graph: MoleculeGraph, bondId: number, keepAtomId: number): DeleteOutcome {
  const kept = componentAfterRemoving(graph, bondId, keepAtomId)
  const g = subgraphKeep(graph, kept)
  if (!g.atoms.length) return { kind: 'empty' }
  return { kind: 'done', graph: settle(g) }
}

/** 供 UI 显示的原子/基团候选 */
export function atomElementName(el: string): string {
  const names: Record<string, string> = {
    H: '氢 H', O: '氧 O', N: '氮 N', S: '硫 S', P: '磷 P',
    F: '氟 F', Cl: '氯 Cl', Br: '溴 Br', I: '碘 I',
  }
  return names[el] ?? el
}

/** 检查删除是否会清空分子（供 UI 预判） */
export function isEmptyResult(g: MoleculeGraph | null): boolean {
  return !!g && g.atoms.length === 0 && g.bonds.length === 0
}