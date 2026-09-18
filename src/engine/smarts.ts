/**
 * RDKit SMARTS 桥接（反应模块设计方案 §7.3）。
 *
 * 原子索引约定（已实测确认，并由 scripts/verify.ts 的断言固定）：
 *   `graphToMolblock()` 按 `graph.atoms` / `graph.bonds` 数组顺序写出，
 *   RDKit 读入后 **0 基索引 i 对应 graph.atoms[i].atom_id**（键同理对应 graph.bonds[i].bond_id）。
 *   实测依据：丙烷（原子序 1:C,2:C,3:C）用 `[CH3]` 查询返回 `[{atoms:[1]},{atoms:[2]}]`，
 *   恰好是 graph.atoms[1]、graph.atoms[2] 两个端碳；苯基的芳香键匹配返回 `bonds:[2..7]`，
 *   恰好是 graph.bonds[2..7] 的 6 根芳香键。
 *
 * `get_substruct_matches()` 返回的 `atoms` 数组**按 SMARTS 查询原子顺序排列**，
 * 因此可用位置下标把匹配结果映射回规则的命名占位符（labels）。
 */
import type { MoleculeGraph } from '../types/molecule'
import { graphToMolblock, toFallbackSmiles, molblockToGraph } from './serialize'
import { initRdkit } from './rdkitLoader'
import { recalcImplicitH } from './valence'
import { normalizeAromatics } from './ring'

/** 一次模式匹配的结果 */
export interface PatternMatch {
  /** 匹配到的自有原子编号（按 SMARTS 原子顺序） */
  atomIds: number[]
  /** 匹配到的自有键编号 */
  bondIds: number[]
  /** 占位名 → 自有原子编号（由 labels 位置映射得到） */
  labels: Record<string, number>
}

interface RawMatch {
  atoms?: number[]
  bonds?: number[]
}

/** 尝试构建 RDKit 分子对象；失败返回 null。调用方负责 delete() */
export function createMol(mod: unknown, graph: MoleculeGraph): unknown | null {
  const m = mod as { get_mol(input: string): { delete(): void } | null }
  const inputs = [graphToMolblock(graph), toFallbackSmiles(graph)]
  for (const input of inputs) {
    if (!input) continue
    try {
      const mol = m.get_mol(input)
      if (mol) return mol
    } catch {
      /* 尝试下一种输入 */
    }
  }
  return null
}

/** SMARTS 解析结果：原子（候选元素集 + 芳香性）与键（含键级） */
interface SPattern {
  n: number
  atoms: Array<{ els: string[]; aromatic: boolean }>
  bonds: Array<{ a: number; b: number; order: number }>
}

const Z2EL: Record<number, string> = {
  1: 'H', 6: 'C', 7: 'N', 8: 'O', 9: 'F', 15: 'P', 16: 'S', 17: 'Cl', 35: 'Br', 53: 'I',
}

/** 从方括号内容提取候选元素（支持 `[F,Cl,Br,I]` 与 `[#6]`） */
function elementsOf(content: string): { els: string[]; aromatic: boolean } {
  const els: string[] = []
  let aromatic = false
  for (const part of content.split(',')) {
    const t = part.trim()
    if (!t) continue
    if (t.startsWith('#')) {
      const m = /^#(\d+)/.exec(t)
      if (m) {
        const el = Z2EL[Number(m[1])]
        if (el) els.push(el)
      }
      continue
    }
    const m = /^([A-Z][a-z]?|[a-z])/.exec(t)
    if (!m) continue
    let el = m[1]
    if (el.length === 1 && el === el.toLowerCase()) {
      aromatic = true
      el = el.toUpperCase()
    }
    els.push(el)
  }
  return { els, aromatic }
}

/**
 * 解析规则库使用的 SMARTS 子集：
 * 方括号原子、裸原子、分支括号 `( )`、键符号 `- = # :`、环闭合数字、断开符 `.`。
 *
 * **必须正确处理分支括号**：`[CX3](=O)[OX2H1]` 中两个 O 都连在同一个 C 上，
 * 若按线性链解析会得到 C—O—O，导致占位符映射到错误的原子。
 */
function parseSmarts(smarts: string): SPattern {
  const atoms: SPattern['atoms'] = []
  const bonds: SPattern['bonds'] = []
  const ringOpen = new Map<string, { idx: number; order: number }>()
  const stack: number[] = []
  let prev = -1
  let pendingOrder = 1
  let i = 0

  const link = (a: number, b: number, order: number): void => {
    if (a < 0 || b < 0 || a === b) return
    bonds.push({ a, b, order })
  }
  const newAtom = (els: string[], aromatic: boolean): void => {
    const idx = atoms.length
    atoms.push({ els, aromatic })
    if (prev >= 0) {
      // 两个芳香原子之间未显式标注键时，默认按芳香键处理（如 c1ccccc1 的环键）
      const order = pendingOrder === 1 && aromatic && atoms[prev]?.aromatic ? 0 : pendingOrder
      link(prev, idx, order)
    }
    pendingOrder = 1
    prev = idx
  }

  while (i < smarts.length) {
    const ch = smarts[i]
    if (ch === '(') {
      stack.push(prev)
      i++
      continue
    }
    if (ch === ')') {
      prev = stack.pop() ?? prev
      i++
      continue
    }
    if (ch === '.') {
      prev = -1
      i++
      continue
    }
    if (ch === '-' || ch === '=' || ch === '#' || ch === ':') {
      pendingOrder = ch === '=' ? 2 : ch === '#' ? 3 : ch === ':' ? 0 : 1
      i++
      continue
    }
    if (ch === '~') {
      pendingOrder = 0
      i++
      continue
    }
    if (ch === '[') {
      const end = smarts.indexOf(']', i)
      const content = end < 0 ? smarts.slice(i + 1) : smarts.slice(i + 1, end)
      const { els, aromatic } = elementsOf(content)
      newAtom(els.length ? els : ['C'], aromatic)
      i = end < 0 ? smarts.length : end + 1
      continue
    }
    if (/\d/.test(ch)) {
      const key = ch
      const open = ringOpen.get(key)
      if (open) {
        // 闭合键同样需要「两芳香原子默认为芳香键」的推断
        const order =
          open.order === 1 && atoms[open.idx]?.aromatic && atoms[prev]?.aromatic ? 0 : open.order
        link(open.idx, prev, order)
        ringOpen.delete(key)
      } else {
        ringOpen.set(key, { idx: prev, order: pendingOrder })
      }
      i++
      continue
    }
    if (ch === '%') {
      i++
      continue
    }
    if (/[A-Za-z]/.test(ch)) {
      let el = ch
      let aromatic = false
      if (ch.length === 1 && ch === ch.toLowerCase()) {
        aromatic = true
        el = ch.toUpperCase()
      } else if (
        i + 1 < smarts.length &&
        /[a-z]/.test(smarts[i + 1]) &&
        ch === 'C' &&
        smarts[i + 1] === 'l'
      ) {
        el += smarts[i + 1]
        i++
      }
      newAtom([el], aromatic)
      i++
      continue
    }
    i++
  }
  return { n: atoms.length, atoms, bonds }
}

/**
 * 把 RDKit 返回的匹配原子集合重排为 **SMARTS 原子顺序**。
 *
 * 为什么需要：实测 `get_substruct_matches()` 返回的 `atoms` 数组顺序**不保证**等于查询中的原子顺序
 * （苯酚 `c1ccccc1[OX2H1]` 的匹配中，下标 5 并非与 O 成键的环碳），
 * 若按下标直接映射规则占位符，会把变换作用到错误的原子上。
 *
 * 改用「按模式子图做同构搜索」：同时校验元素与键级，由化学环境唯一确定映射。
 * 规模很小（n ≤ 8），回溯开销可忽略。
 */
function reorderToPatternOrder(
  smarts: string,
  atomIds: number[],
  graph: MoleculeGraph,
): number[] | null {
  const pat = parseSmarts(smarts)
  if (pat.n !== atomIds.length || pat.n === 0) return null

  const atomsById = new Map(graph.atoms.map((a) => [a.atom_id, a]))
  const bondOf = (a: number, b: number) =>
    graph.bonds.find(
      (x) => (x.atom1_id === a && x.atom2_id === b) || (x.atom1_id === b && x.atom2_id === a),
    )

  const used = new Array<boolean>(pat.n).fill(false)
  const map = new Array<number>(pat.n).fill(-1)

  /** 已映射部分是否与新候选一致（元素 + 键级） */
  const consistent = (pi: number, gi: number): boolean => {
    const pa = pat.atoms[pi]
    const ga = atomsById.get(gi)
    if (!ga) return false
    if (pa.els.length && !pa.els.includes(ga.element)) return false
    for (let pj = 0; pj < pat.n; pj++) {
      if (map[pj] < 0 || pj === pi) continue
      const pb = pat.bonds.find(
        (x) => (x.a === pi && x.b === pj) || (x.a === pj && x.b === pi),
      )
      const gb = bondOf(gi, map[pj])
      if (!pb) {
        if (gb) return false // 模式中不相连、图中却相连
        continue
      }
      if (!gb) return false
      if (pb.order === 0) {
        if (!gb.aromatic) return false // 芳香键必须显式标记
      } else if (gb.aromatic || gb.order !== pb.order) {
        return false // 显式单/双/三键不匹配芳香键
      }
    }
    return true
  }

  const bt = (pi: number): boolean => {
    if (pi === pat.n) return true
    for (let k = 0; k < pat.n; k++) {
      if (used[k]) continue
      const gi = atomIds[k]
      if (!consistent(pi, gi)) continue
      map[pi] = gi
      used[k] = true
      if (bt(pi + 1)) return true
      map[pi] = -1
      used[k] = false
    }
    return false
  }
  return bt(0) ? map : null
}

/**
 * 用已加载的 RDKit 模块执行一次 SMARTS 匹配（同步、无副作用）。
 * 供浏览器路径与 Node 验证脚本共用。
 */
export function matchPatternsWith(
  mod: unknown,
  graph: MoleculeGraph,
  smarts: string,
  labels?: Record<number, string>,
): PatternMatch[] {
  if (!graph.atoms.length || !smarts.trim()) return []
  const m = mod as {
    get_qmol(input: string): { delete(): void } | null
  }
  const mol = createMol(mod, graph) as {
    get_substruct_matches(q: unknown): string
    delete(): void
  } | null
  if (!mol) return []

  let q: { delete(): void } | null = null
  try {
    q = m.get_qmol(smarts)
    if (!q) return []
    const raw = mol.get_substruct_matches(q)
    const parsed = JSON.parse(raw) as RawMatch[] | RawMatch
    const list: RawMatch[] = Array.isArray(parsed) ? parsed : [parsed]

    const out: PatternMatch[] = []
    for (const item of list) {
      const rawIdx = item.atoms ?? []
      if (!rawIdx.length) continue
      // RDKit 0 基索引 → 自有原子编号
      const unordered = rawIdx
        .map((i) => graph.atoms[i]?.atom_id)
        .filter((v): v is number => v !== undefined)
      if (unordered.length !== rawIdx.length) continue // 越界，视为无效匹配

      // 重排为 SMARTS 顺序（连通性唯一确定）
      const atomIds = reorderToPatternOrder(smarts, unordered, graph)
      if (!atomIds) continue

      const bondIds = (item.bonds ?? [])
        .map((i) => graph.bonds[i]?.bond_id)
        .filter((v): v is number => v !== undefined)

      const labelMap: Record<string, number> = {}
      if (labels) {
        for (const [posStr, name] of Object.entries(labels)) {
          const pos = Number(posStr)
          const id = atomIds[pos]
          if (id !== undefined) labelMap[name] = id
        }
      }
      out.push({ atomIds, bondIds, labels: labelMap })
    }
    return out
  } catch (e) {
    console.warn(`SMARTS 匹配失败 [${smarts}]:`, e)
    return []
  } finally {
    try {
      q?.delete()
    } catch {
      /* ignore */
    }
    try {
      mol.delete()
    } catch {
      /* ignore */
    }
  }
}

/** 由 SMILES 构建自有分子图；RDKit 不可用或解析失败时返回 null */
export function smilesToGraphWith(mod: unknown, smiles: string): MoleculeGraph | null {
  if (!smiles.trim()) return null
  const m = mod as { get_mol(input: string): { get_molblock(): string; delete(): void } | null }
  try {
    const mol = m.get_mol(smiles)
    if (!mol) return null
    try {
      const mb = mol.get_molblock()
      const g = molblockToGraph(mb)
      return g ? recalcImplicitH(normalizeAromatics(g)) : null
    } finally {
      try {
        mol.delete()
      } catch {
        /* ignore */
      }
    }
  } catch {
    return null
  }
}

/** 浏览器路径：加载 RDKit 后由 SMILES 构建分子图 */
export async function smilesToGraph(smiles: string): Promise<MoleculeGraph | null> {
  const mod = await initRdkit()
  if (!mod) return null
  return smilesToGraphWith(mod, smiles)
}

/** 浏览器路径：自动加载 RDKit 后执行匹配 */
export async function matchPatterns(
  graph: MoleculeGraph,
  smarts: string,
  labels?: Record<number, string>,
): Promise<PatternMatch[]> {
  const mod = await initRdkit()
  if (!mod) return []
  return matchPatternsWith(mod, graph, smarts, labels)
}

/** 由 SMILES 校验结构合法性（RDKit 不可用时返回 null 表示「无法判定」） */
export function isValidSmilesWith(mod: unknown, smiles: string): boolean | null {
  if (!smiles) return null
  const m = mod as { get_mol(input: string): { delete(): void } | null }
  try {
    const mol = m.get_mol(smiles)
    if (!mol) return false
    try {
      return true
    } finally {
      mol.delete()
    }
  } catch {
    return false
  }
}

/** 由分子图取 canonical SMILES；失败返回 null */
export function canonicalSmilesWith(mod: unknown, graph: MoleculeGraph): string | null {
  const mol = createMol(mod, graph) as { get_smiles(): string; delete(): void } | null
  if (!mol) return null
  try {
    const s = mol.get_smiles()
    return s && s.trim() ? s : null
  } catch {
    return null
  } finally {
    try {
      mol.delete()
    } catch {
      /* ignore */
    }
  }
}
