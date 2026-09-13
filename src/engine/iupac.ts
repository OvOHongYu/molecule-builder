/**
 * 自研 IUPAC 命名（设计文档 §9.1 fallback 链第一级）。
 * 覆盖范围：
 *  - 无环烃：烷 / 烯 / 炔 / 二烯（同链多不饱和键） + 烷基 / 卤素取代
 *  - 醇（含多元醇）、醛、酮、一元/二元羧酸、酯、醚（烷氧基烷）、伯胺
 *  - 单苯环常见取代：苯 / 烷基苯 / 苯酚 / 苯胺 / 苯甲醛 / 苯甲酸 / 卤苯 / 硝基苯 / 二、三取代
 * 超出范围返回 null → CACTUS / PubChem → 手动输入。
 */
import type { MoleculeGraph } from '../types/molecule'
import { atomById, bondsOfAtom, neighborIds } from './graphUtils'
import { ringAtomIds, benzeneLikeRing } from './ring'

/* ================= 词根与常量 ================= */

const ROOTS = [
  'meth', 'eth', 'prop', 'but', 'pent', 'hex', 'hept', 'oct', 'non', 'dec',
  'undec', 'dodec',
]
const ALKYL_ROOT = [
  'methyl', 'ethyl', 'propyl', 'butyl', 'pentyl', 'hexyl', 'heptyl', 'octyl', 'nonyl', 'decyl',
]
const ALKOXY_ROOT = [
  'methoxy', 'ethoxy', 'propoxy', 'butoxy', 'pentyloxy', 'hexyloxy', 'heptyloxy', 'octyloxy', 'nonyloxy', 'decyloxy',
]
const HALO_EN: Record<string, string> = { F: 'fluoro', Cl: 'chloro', Br: 'bromo', I: 'iodo' }
const MULTI_EN = ['', '', 'di', 'tri', 'tetra', 'penta']

/* ================= 类型 ================= */

export type AlkylShape = 'n' | 'iso' | 'sec' | 'tert'

export interface Subst {
  kind: 'alkyl' | 'halogen' | 'alkoxy' | 'hydroxy'
  locant: number
  size: number
  shape: AlkylShape
  halo?: string
}

export interface MultiLoc {
  kind: 'ene' | 'yne'
  locant: number
}

export interface MainGroup {
  kind: 'CO2H' | 'CHO' | 'ketone' | 'OH' | 'amine' | 'ester'
  locants: number[]
  /** 仅酯：醇部分（R'-O-） */
  ester?: { size: number; shape: AlkylShape }
}

export interface AcyclicAnalysis {
  n: number
  chain: number[]
  posOf: Map<number, number>
  main: MainGroup | null
  unsat: MultiLoc[]
  subs: Subst[]
}

/* ================= 基础图工具 ================= */

function carbonAdj(graph: MoleculeGraph): Map<number, number[]> {
  const adj = new Map<number, number[]>()
  for (const a of graph.atoms) {
    if (a.element !== 'C') continue
    adj.set(a.atom_id, neighborIds(graph, a.atom_id).filter((id) => atomById(graph, id)?.element === 'C'))
  }
  return adj
}

function bfsPath(adj: Map<number, number[]>, from: number, to: number): number[] | null {
  const prev = new Map<number, number>()
  const seen = new Set<number>([from])
  const q = [from]
  while (q.length) {
    const cur = q.shift()!
    if (cur === to) break
    for (const n of adj.get(cur) ?? []) {
      if (!seen.has(n)) {
        seen.add(n)
        prev.set(n, cur)
        q.push(n)
      }
    }
  }
  if (!seen.has(to)) return null
  const path = [to]
  let cur = to
  while (cur !== from) {
    cur = prev.get(cur)!
    path.push(cur)
  }
  return path.reverse()
}

/** 从 from 出发、避开 blocked 的最长支路（树结构，无环） */
function longestBranch(adj: Map<number, number[]>, from: number, blocked: Set<number>): number[] {
  let best: number[] = [from]
  for (const n of adj.get(from) ?? []) {
    if (blocked.has(n)) continue
    const sub = longestBranch(adj, n, new Set([...blocked, from]))
    const cand = [from, ...sub]
    if (cand.length > best.length) best = cand
  }
  return best
}

/** 找到包含 mustInclude 的最长简单路径（返回碳原子序列） */
export function findLongestPath(
  adj: Map<number, number[]>,
  mustInclude?: number,
): number[] | null {
  if (mustInclude === undefined) {
    let best: number[] | null = null
    for (const s of adj.keys()) {
      const stack: Array<{ path: number[]; visited: Set<number> }> = [
        { path: [s], visited: new Set([s]) },
      ]
      while (stack.length) {
        const { path, visited } = stack.pop()!
        const last = path[path.length - 1]
        const cands = (adj.get(last) ?? []).filter((n) => !visited.has(n))
        if (!cands.length) {
          if (path.length > (best?.length ?? 0)) best = path
        } else {
          for (const c of cands) {
            stack.push({ path: [...path, c], visited: new Set([...visited, c]) })
          }
        }
      }
    }
    return best
  }
  if (!adj.has(mustInclude)) return [mustInclude]
  // 从 mustInclude 出发的每条分支，取最长两条拼接（经过该原子的最长链）
  const branches: number[][] = []
  for (const n of adj.get(mustInclude) ?? []) {
    branches.push([mustInclude, ...longestBranch(adj, n, new Set([mustInclude]))])
  }
  if (!branches.length) return [mustInclude]
  branches.sort((x, y) => y.length - x.length)
  if (branches.length === 1) return branches[0]
  const first = branches[0]
  const second = branches[1]
  return [...[...first].reverse(), ...second.slice(1)]
}

/** 找到覆盖全部 required 原子的最长主链；若 required 呈分叉（无法落在一条链上）返回 null */
function chainThroughRequired(adj: Map<number, number[]>, required: number[]): number[] | null {
  const root = required[0]
  if (!adj.has(root)) return null
  const steiner = new Set<number>([root])
  for (const r of required) {
    const p = bfsPath(adj, root, r)
    if (!p) return null
    for (const x of p) steiner.add(x)
  }
  const degIn = (id: number) => (adj.get(id) ?? []).filter((n) => steiner.has(n)).length
  for (const nd of steiner) {
    if (degIn(nd) > 2) return null // 分叉 → 不能作开链主链
  }
  const ends = [...steiner].filter((nd) => degIn(nd) <= 1)
  if (ends.length === 1) return findLongestPath(adj, ends[0])
  if (ends.length !== 2) return null
  const [e1, e2] = ends
  const mid = bfsPath(adj, e1, e2)
  if (!mid) return null
  const left = longestBranch(adj, e1, steiner).reverse() // [leaf ... e1]
  const right = longestBranch(adj, e2, steiner).slice(1) // [ ... leaf]
  return [...left, ...mid.slice(1), ...right]
}

/* ================= 支链（烷基/烷氧基）解析 ================= */

interface BranchInfo {
  size: number
  shape: AlkylShape
  atoms: Set<number>
}

function branchAtoms(graph: MoleculeGraph, root: number, exclude: Set<number>): Set<number> {
  const seen = new Set<number>([root])
  const q = [root]
  while (q.length) {
    const c = q.pop()!
    for (const n of neighborIds(graph, c)) {
      if (atomById(graph, n)?.element === 'C' && !exclude.has(n) && !seen.has(n)) {
        seen.add(n)
        q.push(n)
      }
    }
  }
  return seen
}

/**
 * 分类碳支链：直链（n-）/ 异（iso）/ 仲（sec）/ 叔（tert）。
 * 含不饱和键或超范围的支链返回 null。
 */
function classifyAlkyl(graph: MoleculeGraph, root: number, exclude: Set<number>): BranchInfo | null {
  const atoms = branchAtoms(graph, root, exclude)
  const size = atoms.size
  for (const b of graph.bonds) {
    if (atoms.has(b.atom1_id) && atoms.has(b.atom2_id) && (b.order !== 1 || b.aromatic)) return null
  }
  const degIn = (id: number) => neighborIds(graph, id).filter((n) => atoms.has(n)).length
  const rootDeg = degIn(root)
  const isPath = [...atoms].every((a) => degIn(a) <= 2)
  if (isPath && rootDeg <= 1) return { size, shape: 'n', atoms }
  if (size === 3 && rootDeg === 2) return { size, shape: 'iso', atoms }
  if (size === 4 && rootDeg === 3) return { size, shape: 'tert', atoms }
  if (size === 4 && rootDeg === 2) {
    const branches = neighborIds(graph, root).filter((n) => atoms.has(n))
    const sizes = branches
      .map((s) => branchAtoms(graph, s, new Set([...exclude, root])).size)
      .sort((a, b) => a - b)
    if (sizes.length === 2 && sizes[0] === 1 && sizes[1] === 2) return { size, shape: 'sec', atoms }
    return null
  }
  if (size === 4 && rootDeg === 1) {
    const next = neighborIds(graph, root).find((n) => atoms.has(n))
    if (next !== undefined && degIn(next) === 3) return { size, shape: 'iso', atoms }
    return null
  }
  return null
}

/* ================= 官能团扫描 ================= */

interface ScanInfo {
  acidCs: number[]
  acidO: Map<number, number>
  esterCs: number[]
  esterO: Map<number, number>
  aldehydeCs: number[]
  aldehydeO: Map<number, number>
  ketoneCs: number[]
  ketoneO: Map<number, number>
  ohCs: number[]
  ohO: Map<number, number>
  amineCs: number[]
  amineN: Map<number, number>
  etherOs: number[]
  multi: Array<{ kind: 'ene' | 'yne'; a: number; b: number }>
}

function scanGroups(graph: MoleculeGraph): ScanInfo | null {
  const info: ScanInfo = {
    acidCs: [], acidO: new Map(),
    esterCs: [], esterO: new Map(),
    aldehydeCs: [], aldehydeO: new Map(),
    ketoneCs: [], ketoneO: new Map(),
    ohCs: [], ohO: new Map(),
    amineCs: [], amineN: new Map(),
    etherOs: [], multi: [],
  }
  const other = (b: { atom1_id: number; atom2_id: number }, id: number) =>
    b.atom1_id === id ? b.atom2_id : b.atom1_id

  for (const a of graph.atoms) {
    if (a.element === 'S' || a.element === 'P') return null
    if (a.element === 'N') {
      const bs = bondsOfAtom(graph, a.atom_id)
      if (bs.length !== 1) return null // 仅支持伯胺
      const c = other(bs[0], a.atom_id)
      if (atomById(graph, c)?.element !== 'C') return null
      info.amineCs.push(c)
      info.amineN.set(c, a.atom_id)
    }
  }

  for (const c of graph.atoms) {
    if (c.element !== 'C') continue
    const bs = bondsOfAtom(graph, c.atom_id)
    const dblO = bs.find(
      (b) => b.order === 2 && !b.aromatic && atomById(graph, other(b, c.atom_id))?.element === 'O',
    )
    if (dblO) {
      const oId = other(dblO, c.atom_id)
      const singleOs = bs
        .filter((b) => b.order === 1)
        .map((b) => other(b, c.atom_id))
        .filter((id) => atomById(graph, id)?.element === 'O')
      const acidO = singleOs.find((oid) => bondsOfAtom(graph, oid).length === 1)
      const esterO = singleOs.find((oid) => bondsOfAtom(graph, oid).length === 2)
      const cNbrs = neighborIds(graph, c.atom_id).filter((id) => atomById(graph, id)?.element === 'C')
      if (acidO !== undefined) {
        info.acidCs.push(c.atom_id)
        info.acidO.set(c.atom_id, oId)
      } else if (esterO !== undefined) {
        info.esterCs.push(c.atom_id)
        info.esterO.set(c.atom_id, esterO)
      } else if (cNbrs.length <= 1) {
        info.aldehydeCs.push(c.atom_id)
        info.aldehydeO.set(c.atom_id, oId)
      } else if (cNbrs.length === 2) {
        info.ketoneCs.push(c.atom_id)
        info.ketoneO.set(c.atom_id, oId)
      } else {
        return null
      }
    } else {
      for (const oid of bs
        .filter((b) => b.order === 1)
        .map((b) => other(b, c.atom_id))
        .filter((id) => atomById(graph, id)?.element === 'O')) {
        if (bondsOfAtom(graph, oid).length === 1) {
          info.ohCs.push(c.atom_id)
          info.ohO.set(c.atom_id, oid)
        }
      }
    }
  }

  for (const b of graph.bonds) {
    if (b.aromatic) return null
    const a1 = atomById(graph, b.atom1_id)
    const a2 = atomById(graph, b.atom2_id)
    if (b.order === 2) {
      if (a1?.element === 'C' && a2?.element === 'C') info.multi.push({ kind: 'ene', a: b.atom1_id, b: b.atom2_id })
    } else if (b.order === 3) {
      if (a1?.element === 'C' && a2?.element === 'C') info.multi.push({ kind: 'yne', a: b.atom1_id, b: b.atom2_id })
      else return null
    }
  }
  // 醚氧：度 2 的 O（且两邻居均为 C）
  for (const a of graph.atoms) {
    if (a.element !== 'O') continue
    const bs = bondsOfAtom(graph, a.atom_id)
    const cs = bs.map((b) => other(b, a.atom_id)).filter((id) => atomById(graph, id)?.element === 'C')
    if (cs.length === 2) info.etherOs.push(a.atom_id)
    else if (cs.length !== 1) return null
  }
  return info
}

/* ================= 主分析 ================= */

function lexLess(a: number[], b: number[]): boolean {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const va = a[i] ?? 99
    const vb = b[i] ?? 99
    if (va !== vb) return va < vb
  }
  return false
}

interface Candidate {
  analysis: AcyclicAnalysis
  score: number[]
}

function buildCandidate(
  graph: MoleculeGraph,
  order: number[],
  info: ScanInfo,
  mainKind: MainGroup['kind'] | null,
): Candidate | null {
  const n = order.length
  if (n < 1 || n > ROOTS.length) return null
  const posOf = new Map<number, number>()
  order.forEach((id, i) => posOf.set(id, i + 1))
  const chainSet = new Set(order)
  const used = new Set<number>(order)

  // 主官能团
  let main: MainGroup | null = null
  const locs = (ids: number[]) => ids.map((id) => posOf.get(id)!).sort((a, b) => a - b)
  if (mainKind === 'CO2H') {
    main = { kind: 'CO2H', locants: locs(info.acidCs) }
  } else if (mainKind === 'ester') {
    const cId = info.esterCs[0]
    const oId = info.esterO.get(cId)!
    const rC = neighborIds(graph, oId).find((x) => x !== cId)!
    const bi = classifyAlkyl(graph, rC, chainSet)
    if (!bi || bi.size < 1 || bi.size > ROOTS.length) return null
    for (const x of bi.atoms) used.add(x)
    used.add(oId)
    main = { kind: 'ester', locants: locs(info.esterCs), ester: { size: bi.size, shape: bi.shape } }
  } else if (mainKind === 'CHO') {
    main = { kind: 'CHO', locants: locs(info.aldehydeCs) }
  } else if (mainKind === 'ketone') {
    main = { kind: 'ketone', locants: locs(info.ketoneCs) }
  } else if (mainKind === 'OH') {
    main = { kind: 'OH', locants: locs(info.ohCs) }
  } else if (mainKind === 'amine') {
    main = { kind: 'amine', locants: locs(info.amineCs) }
  }

  // 不饱和键定位（必须落在主链上，否则视为支链含双键 → 不支持）
  const unsat: MultiLoc[] = []
  for (const m of info.multi) {
    if (!posOf.has(m.a) || !posOf.has(m.b)) return null
    unsat.push({ kind: m.kind, locant: Math.min(posOf.get(m.a)!, posOf.get(m.b)!) })
  }
  unsat.sort((a, b) => a.locant - b.locant)

  // 主官能团所在碳上的氧（羰基氧 / 羧基氧 / 羟基氧）均不得再当作取代基
  const mainO = new Set<number>()
  const mainCarbons: number[] =
    mainKind === 'CO2H' ? info.acidCs
    : mainKind === 'ester' ? info.esterCs
    : mainKind === 'CHO' ? info.aldehydeCs
    : mainKind === 'ketone' ? info.ketoneCs
    : mainKind === 'OH' ? info.ohCs
    : []
  for (const c of mainCarbons) {
    for (const nb of neighborIds(graph, c)) {
      if (atomById(graph, nb)?.element === 'O') mainO.add(nb)
    }
  }

  // 取代基
  const subs: Subst[] = []
  const esterOId = mainKind === 'ester' ? info.esterO.get(info.esterCs[0]) : undefined
  for (const c of order) {
    const loc = posOf.get(c)!
    for (const nb of neighborIds(graph, c)) {
      if (chainSet.has(nb)) continue
      const na = atomById(graph, nb)
      if (!na || na.element === 'H') continue
      if (na.element === 'C') {
        const bi = classifyAlkyl(graph, nb, chainSet)
        if (!bi) return null
        for (const x of bi.atoms) used.add(x)
        subs.push({ kind: 'alkyl', locant: loc, size: bi.size, shape: bi.shape })
      } else if (HALO_EN[na.element]) {
        used.add(nb)
        subs.push({ kind: 'halogen', locant: loc, size: 0, shape: 'n', halo: na.element })
      } else if (na.element === 'O') {
        if (nb === esterOId || mainO.has(nb)) {
          used.add(nb)
          continue
        }
        const obs = bondsOfAtom(graph, nb)
        if (obs.length === 1) {
          used.add(nb)
          subs.push({ kind: 'hydroxy', locant: loc, size: 0, shape: 'n' })
        } else if (obs.length === 2) {
          const otherC = obs
            .map((b) => (b.atom1_id === nb ? b.atom2_id : b.atom1_id))
            .find((id) => id !== c)!
          if (atomById(graph, otherC)?.element !== 'C') return null
          const bi = classifyAlkyl(graph, otherC, new Set([...chainSet, nb]))
          if (!bi) return null
          for (const x of bi.atoms) used.add(x)
          used.add(nb)
          subs.push({ kind: 'alkoxy', locant: loc, size: bi.size, shape: bi.shape })
        } else return null
      } else if (na.element === 'N') {
        if (mainKind === 'amine') used.add(nb)
        else return null
      } else return null
    }
  }

  // 官能团杂原子计入已覆盖
  for (const o of [info.acidO, info.esterO, info.aldehydeO, info.ketoneO, info.ohO]) {
    for (const oid of o.values()) used.add(oid)
  }
  for (const nid of info.amineN.values()) used.add(nid)

  // 覆盖校验：不允许遗漏重原子
  for (const a of graph.atoms) {
    if (a.element === 'H') continue
    if (!used.has(a.atom_id)) return null
  }

  const analysis: AcyclicAnalysis = { n, chain: order, posOf, main, unsat, subs }
  // 编号评分：主官能团 locants > 不饱和 locants > 取代基 locants
  const score = [
    ...(main ? main.locants : []),
    ...unsat.map((u) => u.locant),
    ...subs.map((s) => s.locant).sort((a, b) => a - b),
  ]
  return { analysis, score }
}

/** 解析无环分子为结构化命名信息（供 IUPAC / 中文命名共用） */
export function analyzeAcyclic(graph: MoleculeGraph): AcyclicAnalysis | null {
  if (!graph.atoms.length) return null
  if (ringAtomIds(graph).size > 0) return null
  const info = scanGroups(graph)
  if (!info) return null

  const acids = info.acidCs
  const esters = info.esterCs
  const aldehydes = info.aldehydeCs
  const ketones = info.ketoneCs
  const ohs = info.ohCs
  const amines = info.amineCs

  if (acids.length > 2) return null
  if (esters.length > 1) return null
  if (aldehydes.length > 1) return null
  if (ketones.length > 1) return null
  if (amines.length > 1) return null
  // 羧酸/酯/醛/酮 四类互为不同的主官能团，不得并存
  const majors = [acids.length > 0, esters.length > 0, aldehydes.length > 0, ketones.length > 0].filter(Boolean).length
  if (majors > 1) return null

  let mainKind: MainGroup['kind'] | null = null
  if (acids.length) mainKind = 'CO2H'
  else if (esters.length) mainKind = 'ester'
  else if (aldehydes.length) mainKind = 'CHO'
  else if (ketones.length) mainKind = 'ketone'
  else if (ohs.length) mainKind = 'OH'
  else if (amines.length) mainKind = 'amine'

  const required = new Set<number>()
  for (const c of [...acids, ...esters, ...aldehydes, ...ketones, ...ohs, ...amines]) required.add(c)
  for (const m of info.multi) {
    required.add(m.a)
    required.add(m.b)
  }

  const adj = carbonAdj(graph)
  const req = [...required]
  let chain: number[] | null
  if (req.length === 0) chain = findLongestPath(adj)
  else if (req.length === 1) chain = findLongestPath(adj, req[0])
  else chain = chainThroughRequired(adj, req)
  if (!chain) return null

  const a = buildCandidate(graph, chain, info, mainKind)
  const b = buildCandidate(graph, [...chain].reverse(), info, mainKind)
  if (!a) return b ? b.analysis : null
  if (!b) return a.analysis
  return lexLess(b.score, a.score) ? b.analysis : a.analysis
}

/* ================= 英文名合成 ================= */

interface SubstGroup {
  kind: Subst['kind']
  size: number
  shape: AlkylShape
  halo?: string
  locants: number[]
}

function mergeSubs(subs: Subst[]): SubstGroup[] {
  const map = new Map<string, SubstGroup>()
  for (const s of subs) {
    const key = `${s.kind}|${s.size}|${s.shape}|${s.halo ?? ''}`
    const g = map.get(key)
    if (g) g.locants.push(s.locant)
    else map.set(key, { kind: s.kind, size: s.size, shape: s.shape, halo: s.halo, locants: [s.locant] })
  }
  for (const g of map.values()) g.locants.sort((a, b) => a - b)
  return [...map.values()]
}

function alkylNameEN(size: number, shape: AlkylShape): string | null {
  const base = ALKYL_ROOT[size - 1]
  if (!base) return null
  if (shape === 'n') return base
  if (shape === 'iso') return `iso${base}`
  if (shape === 'sec') return `sec-${base}`
  return `tert-${base}`
}

function alkoxyNameEN(size: number, shape: AlkylShape): string | null {
  const base = ALKOXY_ROOT[size - 1]
  if (!base) return null
  if (shape === 'n') return base
  if (shape === 'iso') return `iso${base}`
  if (shape === 'sec') return `sec-${base}`
  return `tert-${base}`
}

function substNameEN(g: SubstGroup): string | null {
  if (g.kind === 'alkyl') return alkylNameEN(g.size, g.shape)
  if (g.kind === 'alkoxy') return alkoxyNameEN(g.size, g.shape)
  if (g.kind === 'halogen') return g.halo ? HALO_EN[g.halo] : null
  return 'hydroxy'
}

/** 不饱和段（无主官能团结尾时带 e，有后续后缀时省略 e）；noLoc 时不写位次（乙烯/丙烯） */
function unsatSegEN(ene: number[], yne: number[], terminal: boolean, noLoc: boolean): string {
  const total = ene.length + yne.length
  const head = total > 1 ? 'a' : ''
  const e = terminal ? 'e' : ''
  const parts: string[] = []
  if (ene.length) parts.push(`${noLoc ? '' : ene.join(',') + '-'}en${e}`)
  if (yne.length) parts.push(`${noLoc ? '' : yne.join(',') + '-'}yn${e}`)
  if (!parts.length) return ''
  return noLoc ? `${head}${parts.join('-')}` : `${head}-${parts.join('-')}`
}

function mainSuffixEN(a: AcyclicAnalysis, hasUnsat: boolean): string {
  const m = a.main!
  const lstr = m.locants.join(',')
  switch (m.kind) {
    case 'CO2H':
      return m.locants.length === 2 ? (hasUnsat ? '-dioic acid' : 'anedioic acid') : hasUnsat ? '-oic acid' : 'anoic acid'
    case 'CHO':
      return hasUnsat ? '-al' : 'anal'
    case 'ketone':
      return hasUnsat ? `-${lstr}-one` : `an-${lstr}-one`
    case 'OH':
      if (m.locants.length === 1) return hasUnsat ? `-${lstr}-ol` : `an-${lstr}-ol`
      return hasUnsat ? `-${lstr}-diol` : `ane-${lstr}-diol`
    case 'amine':
      return hasUnsat ? `-${lstr}-amine` : `an-${lstr}-amine`
    default:
      return ''
  }
}

function renderAcyclicEN(a: AcyclicAnalysis): string | null {
  const root = ROOTS[a.n - 1]
  if (!root) return null
  const ene = a.unsat.filter((u) => u.kind === 'ene').map((u) => u.locant).sort((x, y) => x - y)
  const yne = a.unsat.filter((u) => u.kind === 'yne').map((u) => u.locant).sort((x, y) => x - y)
  const hasUnsat = a.unsat.length > 0
  // 乙烯/丙烯等单一不饱和键且无主官能团时位次唯一 → 省略位次
  const noUnsatLoc = !a.main && a.n <= 3 && a.unsat.length === 1

  // 酯：独立成词（乙酸乙酯 → ethyl ethanoate）
  if (a.main?.kind === 'ester') {
    const e = a.main.ester!
    const alk = alkylNameEN(e.size, e.shape)
    if (!alk) return null
    const subs = mergedPrefixEN(a.subs, omitLoc(a))
    if (subs === null) return null
    const core = hasUnsat ? `${root}${unsatSegEN(ene, yne, false, false)}oate` : `${root}anoate`
    return `${alk} ${subs}${core}`
  }

  const prefix = mergedPrefixEN(a.subs, omitLoc(a))
  if (prefix === null) return null
  const seg = hasUnsat ? unsatSegEN(ene, yne, !a.main, noUnsatLoc) : ''
  let name = `${prefix}${root}${seg}`
  if (a.main) name += mainSuffixEN(a, hasUnsat)
  else if (!hasUnsat) name += 'ane'
  return name
}

/** 甲烷/单取代乙烷（无主官能团）位次唯一 → 省略前缀位次 */
function omitLoc(a: AcyclicAnalysis): boolean {
  if (a.n === 1) return true
  if (a.n !== 2 || a.main) return false
  const keys = new Set(a.subs.map((s) => `${s.kind}|${s.size}|${s.shape}|${s.halo ?? ''}`))
  return keys.size === 1
}

/** 前缀串（含末尾连字符）；返回 null 表示存在无法命名的取代基 */
function mergedPrefixEN(subs: Subst[], omit: boolean): string | null {
  const groups = mergeSubs(subs)
  const parts: Array<{ name: string; locants: number[] }> = []
  for (const g of groups) {
    const name = substNameEN(g)
    if (!name) return null
    parts.push({ name, locants: g.locants })
  }
  parts.sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0))
  if (!parts.length) return ''
  const body = parts
    .map((p) => {
      const loc = omit ? '' : `${p.locants.join(',')}-`
      return `${loc}${p.locants.length > 1 ? MULTI_EN[p.locants.length] ?? '' : ''}${p.name}`
    })
    .join('-')
  return omit ? body : body + '-'
}

/* ================= 苯环（单环） ================= */

export type ArSubKind = 'alkyl' | 'halogen' | 'OH' | 'NH2' | 'COOH' | 'CHO' | 'NO2'

export interface ArSub {
  kind: ArSubKind
  size: number
  shape: AlkylShape
  halo?: string
  ringIdx: number
}

export interface BenzeneInfo {
  ringOrder: number[]
  subs: ArSub[]
}

function identifyArSub(
  graph: MoleculeGraph,
  attach: number,
  ringSet: Set<number>,
  ringIdx: number,
): ArSub | null {
  const a = atomById(graph, attach)
  if (!a) return null
  if (a.element === 'O') {
    return bondsOfAtom(graph, attach).length === 1
      ? { kind: 'OH', size: 0, shape: 'n', ringIdx }
      : null
  }
  if (a.element === 'N') {
    const os = neighborIds(graph, attach).filter((id) => atomById(graph, id)?.element === 'O')
    if (bondsOfAtom(graph, attach).length === 1) return { kind: 'NH2', size: 0, shape: 'n', ringIdx }
    if (os.length === 2) return { kind: 'NO2', size: 0, shape: 'n', ringIdx }
    return null
  }
  if (HALO_EN[a.element]) return { kind: 'halogen', size: 0, shape: 'n', halo: a.element, ringIdx }
  if (a.element === 'S' || a.element === 'P') return null
  if (a.element === 'C') {
    const others = neighborIds(graph, attach).filter((id) => !ringSet.has(id))
    const otherAtoms = others.map((id) => atomById(graph, id)!).filter(Boolean)
    const hasDoubleO = graph.bonds.some(
      (b) => (b.atom1_id === attach || b.atom2_id === attach) && b.order === 2 && !b.aromatic,
    )
    if (hasDoubleO) {
      const oxy = otherAtoms.filter((x) => x.element === 'O')
      const singleTerminalO = oxy.some((o) => bondsOfAtom(graph, o.atom_id).length === 1)
      if (singleTerminalO) return { kind: 'COOH', size: 0, shape: 'n', ringIdx }
      if (oxy.length === 1 && a.implicit_h >= 1 && otherAtoms.length === 1) {
        return { kind: 'CHO', size: 0, shape: 'n', ringIdx }
      }
      return null
    }
    if (otherAtoms.some((x) => x.element !== 'C' && x.element !== 'H')) return null
    const bi = classifyAlkyl(graph, attach, ringSet)
    if (!bi || bi.size < 1 || bi.size > 5) return null
    return { kind: 'alkyl', size: bi.size, shape: bi.shape, ringIdx }
  }
  return null
}

/** 解析单苯环 + 取代基（供中英文命名共用） */
export function analyzeBenzene(graph: MoleculeGraph): BenzeneInfo | null {
  const ring = benzeneLikeRing(graph)
  if (!ring) return null
  const ringOrder = ring.atomIds
  const ringSet = new Set(ringOrder)
  const subs: ArSub[] = []
  for (let idx = 0; idx < ringOrder.length; idx++) {
    for (const nid of neighborIds(graph, ringOrder[idx])) {
      if (ringSet.has(nid)) continue
      const na = atomById(graph, nid)
      if (!na || na.element === 'H') continue
      const s = identifyArSub(graph, nid, ringSet, idx)
      if (!s) return null
      subs.push(s)
    }
  }
  // 覆盖校验：除环与取代基外不允许有游离重原子
  const used = new Set<number>(ringOrder)
  for (const s of subs) {
    const attach = ringOrder[s.ringIdx]
    const nid = neighborIds(graph, attach).find(
      (x) => !ringSet.has(x) && atomById(graph, x)?.element !== 'H' && !used.has(x),
    )
    if (nid === undefined) continue
    if (atomById(graph, nid)?.element === 'C') {
      for (const x of branchAtoms(graph, nid, ringSet)) {
        used.add(x)
        for (const nb of neighborIds(graph, x)) {
          if (atomById(graph, nb)?.element !== 'H') used.add(nb)
        }
      }
    } else {
      used.add(nid)
      for (const nn of neighborIds(graph, nid)) {
        if (!ringSet.has(nn)) used.add(nn)
      }
    }
  }
  for (const a of graph.atoms) {
    if (a.element === 'H') continue
    if (!used.has(a.atom_id)) return null
  }
  return { ringOrder, subs }
}

const AR_RANK: Record<ArSubKind, number> = { COOH: 5, CHO: 4, OH: 3, NH2: 2, alkyl: 1, halogen: 0, NO2: -1 }
const AR_RETAINED_EN: Partial<Record<ArSubKind, string>> = {
  COOH: 'benzoic acid',
  CHO: 'benzaldehyde',
  OH: 'phenol',
  NH2: 'aniline',
}
const AR_PREFIX_EN: Partial<Record<ArSubKind, string>> = {
  OH: 'hydroxy',
  NH2: 'amino',
  COOH: 'carboxy',
  CHO: 'formyl',
  NO2: 'nitro',
}

function arSubNameEN(s: ArSub): string | null {
  if (s.kind === 'alkyl') return alkylNameEN(s.size, s.shape)
  if (s.kind === 'halogen') return s.halo ? HALO_EN[s.halo] : null
  return AR_PREFIX_EN[s.kind] ?? null
}

/** 最优环编号：找到使取代位次集合字典序最小的旋转 + 方向 */
function bestRingNumbering(subs: ArSub[]): { locants: number[]; assign: number[] } {
  let best: number[] | null = null
  let bestAssign: number[] = []
  for (let start = 0; start < 6; start++) {
    for (const dir of [1, -1]) {
      const assign = subs.map((s) => ((dir * (s.ringIdx - start)) % 6 + 6) % 6 + 1)
      const sorted = [...assign].sort((a, b) => a - b)
      if (!best || lexLess(sorted, best)) {
        best = sorted
        bestAssign = assign
      }
    }
  }
  return { locants: best!, assign: bestAssign }
}

function renderBenzeneEN(info: BenzeneInfo): string | null {
  const { subs } = info
  if (!subs.length) return 'benzene'
  // 母体（保留名）优先
  let mainIdx = -1
  for (let i = 0; i < subs.length; i++) {
    if (AR_RETAINED_EN[subs[i].kind]) {
      if (mainIdx < 0 || AR_RANK[subs[i].kind] > AR_RANK[subs[mainIdx].kind]) mainIdx = i
    }
  }
  if (mainIdx >= 0) {
    const main = subs[mainIdx]
    const parent = AR_RETAINED_EN[main.kind]!
    const others = subs.filter((_, i) => i !== mainIdx)
    if (!others.length) return parent
    // 母体固定 1 位，取使其余取代基位次集合最小的方向
    const items: Array<{ name: string; loc: number }> = []
    for (const s of others) {
      const nm = arSubNameEN(s)
      if (!nm) return null
      const d = ((s.ringIdx - main.ringIdx) % 6 + 6) % 6
      items.push({ name: nm, loc: Math.min(d, 6 - d) + 1 })
    }
    items.sort((x, y) => x.loc - y.loc)
    return `${items.map((it) => `${it.loc}-${it.name}`).join('-')}${parent}`
  }
  // 无保留母体：以苯为母体，全部作前缀，相同取代基合并
  const { assign } = bestRingNumbering(subs)
  const groups = new Map<string, number[]>()
  for (let i = 0; i < subs.length; i++) {
    const nm = arSubNameEN(subs[i])
    if (!nm) return null
    groups.set(nm, [...(groups.get(nm) ?? []), assign[i]])
  }
  const parts: string[] = []
  const single = subs.length === 1
  for (const [nm, ls] of groups) {
    const l = ls.sort((a, b) => a - b)
    parts.push(single ? nm : `${l.join(',')}-${l.length > 1 ? MULTI_EN[l.length] ?? '' : ''}${nm}`)
  }
  parts.sort()
  return `${parts.join('-')}benzene`
}

/* ================= 入口 ================= */

export function iupacName(graph: MoleculeGraph): string | null {
  if (!graph.atoms.length) return null
  if (ringAtomIds(graph).size > 0) {
    const ben = analyzeBenzene(graph)
    return ben ? renderBenzeneEN(ben) : null
  }
  const a = analyzeAcyclic(graph)
  return a ? renderAcyclicEN(a) : null
}
