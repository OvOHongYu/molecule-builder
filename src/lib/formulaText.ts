/**
 * 化学式与方程式文本渲染（反应模块设计方案 §10.4）。
 *
 * 三种变体：
 *  - unicode：Unicode 下标，直接粘贴到 Word / 课件 / 试卷
 *  - latex  ：mhchem 语法，用于论文排版
 *  - ascii  ：纯 ASCII，用于程序处理
 *
 * 局限：方程式以**分子式**表达，丢失结构信息（同分异构体无法区分，
 * 如乙醇与二甲醚同为 C₂H₆O）。正式交付建议使用 SVG / PDF。
 */
import type { MoleculeGraph } from '../types/molecule'
import type { ArrowKind } from '../types/reaction'
import { molecularFormula } from '../engine/descriptors'

const SUB: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
  '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
}

const SUP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻',
}

/**
 * 分子式 → Unicode 下标形式。
 * 输入形如 `C2H6O`、`SO4^2-`；输出 `C₂H₆O`、`SO₄²⁻`。
 */
export function toSubscript(formula: string): string {
  const [main, charge] = formula.split('^')
  const body = main.replace(/\d+/g, (d) =>
    [...d].map((c) => SUB[c] ?? c).join(''),
  )
  if (!charge) return body
  const sup = [...charge].map((c) => SUP[c] ?? c).join('')
  return `${body}${sup}`
}

/** 分子图 → Unicode 下标分子式（UI 显示用） */
export function toFormulaLine(graph: MoleculeGraph): string {
  return toSubscript(molecularFormula(graph))
}

export type EquationStyle = 'unicode' | 'latex' | 'ascii'

export interface EquationSide {
  /** 已带下标的分子式（unicode 变体）或纯分子式 */
  formula: string
  coefficient: number
}

export interface EquationInput {
  reactants: EquationSide[]
  products: EquationSide[]
  arrow: ArrowKind
  aboveText: string
  belowText: string
  /** 是否已配平；未配平时系数以 ? 呈现 */
  balanced: boolean
}

const ARROW: Record<EquationStyle, Record<ArrowKind, string>> = {
  unicode: { forward: '→', equilibrium: '⇌', resonance: '↔' },
  latex: {
    forward: '\\rightarrow',
    equilibrium: '\\rightleftharpoons',
    resonance: '\\leftrightarrow',
  },
  ascii: { forward: '->', equilibrium: '<->', resonance: '<->' },
}

/** 系数前缀：1 省略，未配平显示 ? */
function coeffPrefix(n: number, balanced: boolean): string {
  if (!balanced) return '?'
  return n > 1 ? String(n) : ''
}

function sideText(
  sides: EquationSide[],
  style: EquationStyle,
  balanced: boolean,
): string {
  return sides
    .map((s) => {
      const f = style === 'unicode' ? toSubscript(s.formula) : s.formula
      return `${coeffPrefix(s.coefficient, balanced)}${f}`
    })
    .join(' + ')
}

/**
 * 生成化学方程式文本。
 *
 * @example
 * toEquationText({...}, 'unicode')
 * // 'CH₃CH₂OH + CH₃COOH --[浓H₂SO₄, Δ]--> CH₃COOCH₂CH₃ + H₂O'
 */
export function toEquationText(input: EquationInput, style: EquationStyle = 'unicode'): string {
  const lhs = sideText(input.reactants, style, input.balanced)
  const rhs = sideText(input.products, style, input.balanced)
  const arrow = ARROW[style][input.arrow]
  const above = input.aboveText.trim()
  const below = input.belowText.trim()

  if (style === 'latex') {
    const opt = above ? `[${above}]` : ''
    const opt2 = below ? `[${below}]` : ''
    return `\\ce{${stripSubscripts(lhs)} ${arrow}${opt}${opt2} ${stripSubscripts(rhs)}}`
  }
  if (style === 'ascii') {
    const cond = [above, below].filter(Boolean).join(', ')
    const mid = cond ? `${arrow}[${cond}]` : arrow
    return `${lhs} ${mid} ${rhs}`
  }
  const cond = [above, below].filter(Boolean).join(', ')
  const mid = cond ? `--[${cond}]-->` : arrow
  return `${lhs} ${mid} ${rhs}`
}

/** LaTeX 的 \ce{} 不接受 Unicode 下标，需回退为普通数字 */
function stripSubscripts(s: string): string {
  const rev: Record<string, string> = {}
  for (const [k, v] of Object.entries(SUB)) rev[v] = k
  for (const [k, v] of Object.entries(SUP)) rev[v] = k
  return [...s].map((c) => rev[c] ?? c).join('')
}

/** 由分子图数组构造方程式一侧 */
export function sidesFromGraphs(
  graphs: MoleculeGraph[],
  coefficients: number[],
): EquationSide[] {
  return graphs.map((g, i) => ({
    formula: molecularFormula(g),
    coefficient: coefficients[i] ?? 1,
  }))
}
