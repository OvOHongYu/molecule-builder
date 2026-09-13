/**
 * 自研中文名引擎（设计文档 §9.1 中文名）：
 * 与 IUPAC 命名共用同一套结构分析（analyzeAcyclic / analyzeBenzene），
 * 覆盖 无环烷/烯/炔、醇（含多元醇）、醛、酮、羧酸（一元/二元）、酯、醚（烷氧基烷）、
 * 伯胺、卤代与烷基（含异/仲/叔）取代，以及单苯环常见取代。
 * 超出范围返回 null → PubChem 中文同义词 fallback → 手动输入。
 */
import type { MoleculeGraph } from '../types/molecule'
import { analyzeAcyclic, analyzeBenzene, type AcyclicAnalysis, type ArSub, type AlkylShape, type BenzeneInfo, type MainGroup } from './iupac'

const DIGITS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸']
/** 索引 = 数量：MULTI[2]='二' */
const MULTI = ['', '', '二', '三', '四', '五', '六']

function rootName(n: number): string | null {
  if (n >= 1 && n <= 10) return DIGITS[n - 1]
  if (n === 11) return '十一'
  if (n === 12) return '十二'
  return null
}

const HALOGEN_CN: Record<string, string> = { F: '氟', Cl: '氯', Br: '溴', I: '碘' }
const ALKYL_CN = ['甲基', '乙基', '丙基', '丁基', '戊基', '己基', '庚基', '辛基', '壬基', '癸基']

/** 异/仲/叔 前缀 */
function shapeCN(shape: AlkylShape): string {
  return shape === 'iso' ? '异' : shape === 'sec' ? '仲' : shape === 'tert' ? '叔' : ''
}

function alkylCN(size: number, shape: AlkylShape): string | null {
  const base = ALKYL_CN[size - 1]
  if (!base) return null
  return `${shapeCN(shape)}${base}`
}

function alkoxyCN(size: number, shape: AlkylShape): string | null {
  const base = ALKYL_CN[size - 1]
  if (!base) return null
  return `${shapeCN(shape)}${base.replace(/基$/, '')}氧基`
}

/* ================= 无环（开链）命名 ================= */

interface Group {
  locants: number[]
  name: string
  /** 排序次序（数值小者在前） */
  rank: number
}

function groupSubs(a: AcyclicAnalysis): Group[] | null {
  const map = new Map<string, Group>()
  for (const s of a.subs) {
    let name: string | null
    let rank: number
    if (s.kind === 'alkyl') {
      name = alkylCN(s.size, s.shape)
      rank = 10 + s.size
    } else if (s.kind === 'alkoxy') {
      name = alkoxyCN(s.size, s.shape)
      rank = 30 + s.size
    } else if (s.kind === 'halogen') {
      name = s.halo ? HALOGEN_CN[s.halo] : null
      rank = 20 + ({ F: 1, Cl: 2, Br: 3, I: 4 }[s.halo ?? ''] ?? 0)
    } else {
      name = '羟基'
      rank = 40
    }
    if (!name) return null
    const key = `${s.kind}|${s.size}|${s.shape}|${s.halo ?? ''}`
    const e = map.get(key)
    if (e) e.locants.push(s.locant)
    else map.set(key, { locants: [s.locant], name, rank })
  }
  const out = [...map.values()]
  for (const g of out) g.locants.sort((x, y) => x - y)
  out.sort((x, y) => {
    const lx = Math.min(...x.locants)
    const ly = Math.min(...y.locants)
    if (lx !== ly) return lx - ly
    return x.rank - y.rank
  })
  return out
}

function prefixStrCN(groups: Group[], omitLoc: boolean): string {
  return groups
    .map((g) => {
      const mult = g.locants.length > 1 ? MULTI[g.locants.length] ?? '' : ''
      const loc = omitLoc ? '' : `${g.locants.join(',')}-`
      return `${loc}${mult}${g.name}`
    })
    .join('-')
}

/** 不饱和段（含词根），如 2-丁烯 / 1,3-丁二烯 / 丙烯（noLoc 时省略位次） */
function unsatPartCN(a: AcyclicAnalysis, root: string, noLoc: boolean): string {
  const ene = a.unsat.filter((u) => u.kind === 'ene').map((u) => u.locant).sort((x, y) => x - y)
  const yne = a.unsat.filter((u) => u.kind === 'yne').map((u) => u.locant).sort((x, y) => x - y)
  const mult = (n: number) => (n > 1 ? MULTI[n] ?? '' : '')
  const loc = (ls: number[]) => (noLoc ? '' : `${ls.join(',')}-`)
  let s = ''
  if (ene.length) s += `${loc(ene)}${root}${mult(ene.length)}烯`
  if (yne.length) s += ene.length ? `${loc(yne)}${mult(yne.length)}炔` : `${loc(yne)}${root}${mult(yne.length)}炔`
  return s
}

/** 主官能团后缀（无支链词根时使用，如 2-丁醇 / 丁酸） */
function mainSuffixCN(main: MainGroup, root: string, n: number): string {
  switch (main.kind) {
    case 'CO2H':
      return main.locants.length === 2 ? `${root}二酸` : `${root}酸`
    case 'CHO':
      return `${root}醛`
    case 'ketone':
      return `${main.locants[0]}-${root}酮`
    case 'OH':
      if (main.locants.length === 1) return main.locants[0] === 1 ? `${root}醇` : `${main.locants[0]}-${root}醇`
      // 全链羟基化（乙二醇）省略位次
      if (n === main.locants.length && main.locants.every((l, i) => l === i + 1)) return `${root}二醇`
      return `${main.locants.join(',')}-${root}二醇`
    case 'amine':
      return main.locants[0] === 1 ? `${root}胺` : `${main.locants[0]}-${root}胺`
    default:
      return ''
  }
}

/** 主官能团后缀（已经输出词根+不饱和段后，如 2-丁烯-1-醇） */
function mainTailCN(main: MainGroup): string {
  switch (main.kind) {
    case 'CO2H':
      return main.locants.length === 2 ? '二酸' : '酸'
    case 'CHO':
      return '醛'
    case 'ketone':
      return `-${main.locants[0]}-酮`
    case 'OH':
      return main.locants.length === 1 ? `-${main.locants[0]}-醇` : `-${main.locants.join(',')}-二醇`
    case 'amine':
      return `-${main.locants[0]}-胺`
    default:
      return ''
  }
}

function renderAcyclicCN(a: AcyclicAnalysis): string | null {
  const root = rootName(a.n)
  if (!root) return null
  const groups = groupSubs(a)
  if (groups === null) return null
  // 甲/单取代乙烷（无主官能团）位次唯一 → 省略前缀位次
  const omitLoc = a.n === 1 || (a.n === 2 && !a.main && groups.length === 1)
  const prefix = prefixStrCN(groups, omitLoc)
  const hasUnsat = a.unsat.length > 0
  const noUnsatLoc = !a.main && a.n <= 3 && a.unsat.length === 1

  // 酯：乙酸乙酯（酸名 + 醇部分）
  if (a.main?.kind === 'ester') {
    const e = a.main.ester!
    const alcStem = ALKYL_CN[e.size - 1]
    if (!alcStem) return null
    const acidName = hasUnsat ? `${unsatPartCN(a, root, false)}酸` : `${root}酸`
    const alcName = `${shapeCN(e.shape)}${alcStem.replace(/基$/, '')}酯`
    return `${prefix}${acidName}${alcName}`
  }

  if (hasUnsat) {
    let name = `${prefix}${unsatPartCN(a, root, noUnsatLoc)}`
    if (a.main) name += mainTailCN(a.main)
    return name
  }
  if (a.main) return `${prefix}${mainSuffixCN(a.main, root, a.n)}`
  return `${prefix}${root}烷`
}

/* ================= 苯环（单环） ================= */

const HALO_MAIN_CN: Record<string, string> = { F: '氟苯', Cl: '氯苯', Br: '溴苯', I: '碘苯' }
const POS_WORDS = ['', '邻', '间', '对'] // 相对位次差 1→邻 2→间 3→对

/** 芳环取代基优先级：COOH > CHO > OH > NH2 > 烷基 > 卤素 > 硝基 */
const AR_RANK_CN: Record<ArSub['kind'], number> = { COOH: 6, CHO: 5, OH: 4, NH2: 3, alkyl: 2, halogen: 1, NO2: 0 }

function arMainCN(s: ArSub): string | null {
  switch (s.kind) {
    case 'COOH':
      return '苯甲酸'
    case 'CHO':
      return '苯甲醛'
    case 'OH':
      return '苯酚'
    case 'NH2':
      return '苯胺'
    case 'NO2':
      return '硝基苯'
    case 'halogen':
      return s.halo ? HALO_MAIN_CN[s.halo] : null
    case 'alkyl': {
      const stem = ALKYL_CN[s.size - 1]?.replace(/基$/, '')
      return stem ? `${shapeCN(s.shape)}${stem}苯` : null
    }
    default:
      return null
  }
}

function arPrefixCN(s: ArSub): string | null {
  switch (s.kind) {
    case 'OH':
      return '羟基'
    case 'NH2':
      return '氨基'
    case 'COOH':
      return '羧基'
    case 'CHO':
      return '甲酰基'
    case 'NO2':
      return '硝基'
    case 'halogen':
      return s.halo ? HALOGEN_CN[s.halo] : null
    case 'alkyl': {
      const stem = ALKYL_CN[s.size - 1]
      return stem ? `${shapeCN(s.shape)}${stem}` : null
    }
    default:
      return null
  }
}

function relativePos(i1: number, i2: number): string {
  const d = (((i2 - i1) % 6) + 6) % 6
  return POS_WORDS[Math.min(d, 6 - d)] ?? ''
}

function renderBenzeneCN(info: BenzeneInfo): string | null {
  const { subs } = info
  if (!subs.length) return '苯'
  if (subs.length > 3) return null

  if (subs.length === 1) return arMainCN(subs[0])

  // 三取代：仅支持三个完全相同的烷基/卤素（数字位次）
  if (subs.length === 3) {
    const same =
      subs.every((s) => s.kind === 'alkyl' && s.size === subs[0].size && s.shape === subs[0].shape) ||
      subs.every((s) => s.kind === 'halogen' && s.halo === subs[0].halo)
    if (!same) return null
    let best: number[] | null = null
    for (let start = 0; start < 6; start++) {
      for (const dir of [1, -1]) {
        const ls = subs
          .map((x) => (((dir * (x.ringIdx - start)) % 6) + 6) % 6)
          .sort((a, b) => a - b)
        if (!best || ls.join(',') < best.join(',')) best = ls
      }
    }
    if (!best || best[0] !== 0) return null
    const s0 = subs[0]
    const base =
      s0.kind === 'alkyl'
        ? `${shapeCN(s0.shape)}${ALKYL_CN[s0.size - 1]?.replace(/基$/, '') ?? ''}`
        : s0.halo
          ? HALOGEN_CN[s0.halo]
          : ''
    if (!base) return null
    return `${best.map((l) => l + 1).join(',')}-三${base}苯`
  }

  // 二取代
  const [s1, s2] = subs
  const sameGroup =
    s1.kind === s2.kind &&
    (s1.kind !== 'alkyl' || (s1.size === s2.size && s1.shape === s2.shape)) &&
    (s1.kind !== 'halogen' || s1.halo === s2.halo)

  if (sameGroup) {
    const pos = relativePos(s1.ringIdx, s2.ringIdx)
    if (!pos) return null
    switch (s1.kind) {
      case 'alkyl': {
        const stem = ALKYL_CN[s1.size - 1]?.replace(/基$/, '')
        return stem ? `${pos}二${shapeCN(s1.shape)}${stem}苯` : null
      }
      case 'halogen':
        return s1.halo ? `${pos}二${HALOGEN_CN[s1.halo]}苯` : null
      case 'NO2':
        return `${pos}二硝基苯`
      case 'OH':
        return `${pos}苯二酚`
      case 'COOH':
        return `${pos}苯二甲酸`
      case 'NH2':
        return `${pos}苯二胺`
      default:
        return null
    }
  }

  // 不同取代基：优先级高者为母体
  const main = AR_RANK_CN[s1.kind] >= AR_RANK_CN[s2.kind] ? s1 : s2
  const other = main === s1 ? s2 : s1
  const mainName = arMainCN(main)
  const prefix = arPrefixCN(other)
  if (!mainName || !prefix) return null
  const pos = relativePos(main.ringIdx, other.ringIdx)
  if (!pos) return null
  return `${pos}${prefix}${mainName}`
}

/* ================= 入口 ================= */

export function chineseName(graph: MoleculeGraph): string | null {
  if (!graph.atoms.length) return null
  const ben = analyzeBenzene(graph)
  if (ben) return renderBenzeneCN(ben)
  const a = analyzeAcyclic(graph)
  return a ? renderAcyclicCN(a) : null
}
