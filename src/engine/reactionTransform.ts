/**
 * 变换执行器（反应模块设计方案 §7.2）：在自有 MoleculeGraph 上应用变换算子。
 * 原子引用解析自 pattern 匹配结果；执行后统一 settle() + 超价校验。
 */
import type { MoleculeGraph } from '../types/molecule'
import type { TransformOp, BondRef, AtomRef } from '../types/rule'
import { atomById } from './graphUtils'
import { recalcImplicitH, valenceIssues } from './valence'
import { normalizeAromatics } from './ring'

export type OpsResult =
  | { ok: true; graph: MoleculeGraph }
  | { ok: false; error: string }

export interface TransformContext {
  /** pattern id → 该 pattern 第 copy 个匹配副本的 { label: atom_id } */
  matchOf(patternId: string, copy?: number): Map<string, number> | null
  /** `element: '$agent'` 的解析结果（由 reactionPredict 依命中的试剂给出） */
  agentElement?: string
}

function findBond(g: MoleculeGraph, a: number, b: number): number | null {
  const bd = g.bonds.find(
    (x) =>
      (x.atom1_id === a && x.atom2_id === b) || (x.atom1_id === b && x.atom2_id === a),
  )
  return bd ? bd.bond_id : null
}

export function applyTransforms(
  graph: MoleculeGraph,
  transforms: TransformOp[],
  ctx: TransformContext,
): OpsResult {
  const { matchOf } = ctx
  let g: MoleculeGraph = graph
  const fresh: number[] = [] // addAtom 产生的新原子 id，供 new0/new1… 引用

  /** 解析元素符号：支持 '$agent' 占位 */
  const resolveElement = (el: string): string => el === '$agent' ? (ctx.agentElement ?? 'H') : el

  const resolve = (p: string, label: string, copy: number): number | null => {
    if (label.startsWith('new')) {
      const i = Number(label.slice(3))
      return Number.isFinite(i) ? (fresh[i] ?? null) : null
    }
    const m = matchOf(p, copy)
    if (!m) return null
    return m.get(label) ?? null
  }

  /** 由 AtomRef 取原子 id */
  const at = (r: AtomRef): number | null => resolve(r.p, r.label, r.copy ?? 0)
  const bondEnds = (b: BondRef): [number, number] | null => {
    const a = at(b.a)
    const c = at(b.b)
    return a == null || c == null ? null : [a, c]
  }

  for (const op of transforms) {
    switch (op.op) {
      case 'setBondOrder': {
        const ends = bondEnds(op.bond)
        if (!ends) return { ok: false, error: '原子引用未命中' }
        const bid = findBond(g, ends[0], ends[1])
        if (bid == null) return { ok: false, error: `键 #${ends[0]}-${ends[1]} 不存在` }
        g = {
          ...g,
          bonds: g.bonds.map((x) => (x.bond_id === bid ? { ...x, order: op.order, aromatic: false } : x)),
        }
        break
      }
      case 'removeBond': {
        const ends = bondEnds(op.bond)
        if (!ends) return { ok: false, error: '原子引用未命中' }
        const bid = findBond(g, ends[0], ends[1])
        if (bid == null) return { ok: false, error: `键 #${ends[0]}-${ends[1]} 不存在` }
        g = { ...g, bonds: g.bonds.filter((x) => x.bond_id !== bid) }
        break
      }
      case 'addBond': {
        const ends = bondEnds(op.bond)
        if (!ends) return { ok: false, error: '原子引用未命中' }
        const existing = findBond(g, ends[0], ends[1])
        if (existing != null) {
          // 键已存在时改为「升级键级」：消去、成醚等规则需要把原有单键改为双键，
          // 若在此跳过，产物会停留在未成不饱和键的状态（如消去得到烷烃而非烯烃）。
          g = {
            ...g,
            bonds: g.bonds.map((x) => (x.bond_id === existing ? { ...x, order: op.order, aromatic: false } : x)),
          }
          break
        }
        g = {
          ...g,
          bonds: [...g.bonds, { bond_id: g.nextBondId, atom1_id: ends[0], atom2_id: ends[1], order: op.order, aromatic: false, stereo: '' }],
          nextBondId: g.nextBondId + 1,
        }
        break
      }
      case 'setElement': {
        const id = at(op.atom)
        if (id == null) return { ok: false, error: '原子引用未命中' }
        const el = resolveElement(op.element)
        g = { ...g, atoms: g.atoms.map((x) => (x.atom_id === id ? { ...x, element: el } : x)) }
        break
      }
      case 'setCharge': {
        const id = at(op.atom)
        if (id == null) return { ok: false, error: '原子引用未命中' }
        g = { ...g, atoms: g.atoms.map((x) => (x.atom_id === id ? { ...x, charge: op.charge } : x)) }
        break
      }
      case 'addAtom': {
        const to = at(op.to)
        if (to == null) return { ok: false, error: '原子引用未命中' }
        const anchor = atomById(g, to)
        if (!anchor) return { ok: false, error: '锚点原子缺失' }
        const atom = {
          atom_id: g.nextAtomId,
          element: resolveElement(op.element),
          charge: 0,
          radical: 0,
          implicit_h: 0,
          stereo: '',
          lone_pairs: 0,
          x: anchor.x + 44,
          y: anchor.y,
        }
        fresh.push(atom.atom_id)
        g = {
          atoms: [...g.atoms, atom],
          bonds: [...g.bonds, { bond_id: g.nextBondId, atom1_id: to, atom2_id: atom.atom_id, order: op.order, aromatic: false, stereo: '' }],
          nextAtomId: g.nextAtomId + 1,
          nextBondId: g.nextBondId + 1,
        }
        break
      }
      case 'removeAtom': {
        const id = at(op.atom)
        if (id == null) return { ok: false, error: '原子引用未命中' }
        g = {
          ...g,
          atoms: g.atoms.filter((x) => x.atom_id !== id),
          bonds: g.bonds.filter((x) => x.atom1_id !== id && x.atom2_id !== id),
        }
        break
      }
    }
  }

  // 收尾：芳香性规范化 + 隐式氢重算，再校验超价
  const settled = recalcImplicitH(normalizeAromatics(g))
  const issues = valenceIssues(settled).filter((i) => i.atomId >= 0)
  if (issues.length) return { ok: false, error: issues.map((i) => i.message).join('；') }
  return { ok: true, graph: settled }
}