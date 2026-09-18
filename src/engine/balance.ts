/**
 * 计量配平（反应模块设计方案 §6）。
 *
 * 化学问题：设反应物系数 x_i、产物系数 y_j，对每个元素 e 要求原子守恒
 *   Σ_i a_ie·x_i − Σ_j b_je·y_j = 0
 * 即齐次线性方程组 A·z = 0，求**最小正整数解**。
 *
 * 数值策略：全程使用精确分数（整数比）做行变换，避免浮点误差导致系数解错；
 * 先求整数零空间基，再在基的整数组合中搜索「全为正且系数和最小」者，最后约去公因数。
 */
import type { MoleculeGraph } from '../types/molecule'
import type { BalanceResult, ElementBalance } from '../types/reaction'
import { elementCounts } from './descriptors'

/* ---------------- 精确分数 ---------------- */

interface Frac {
  n: number
  d: number
}

function gcd(a: number, b: number): number {
  a = Math.abs(a)
  b = Math.abs(b)
  while (b) {
    const t = a % b
    a = b
    b = t
  }
  return a || 1
}

function frac(n: number, d = 1): Frac {
  if (d === 0) throw new Error('分数分母为零')
  if (d < 0) {
    n = -n
    d = -d
  }
  const g = gcd(n, d)
  return { n: n / g, d: d / g }
}

const fIsZero = (a: Frac): boolean => a.n === 0
const fSub = (a: Frac, b: Frac): Frac => frac(a.n * b.d - b.n * a.d, a.d * b.d)
const fMul = (a: Frac, b: Frac): Frac => frac(a.n * b.n, a.d * b.d)
const fDiv = (a: Frac, b: Frac): Frac => frac(a.n * b.d, a.d * b.n)

/** 行简化阶梯形（RREF），返回化简矩阵与主元列号 */
function rref(rows: Frac[][]): { mat: Frac[][]; pivots: number[] } {
  const mat = rows.map((r) => r.slice())
  const m = mat.length
  const n = m ? mat[0].length : 0
  const pivots: number[] = []
  let r = 0
  for (let c = 0; c < n && r < m; c++) {
    let piv = -1
    for (let i = r; i < m; i++) {
      if (!fIsZero(mat[i][c])) {
        piv = i
        break
      }
    }
    if (piv < 0) continue
    const tmp = mat[r]
    mat[r] = mat[piv]
    mat[piv] = tmp
    // 主元归一
    const p = mat[r][c]
    for (let j = c; j < n; j++) mat[r][j] = fDiv(mat[r][j], p)
    // 其余行消元
    for (let i = 0; i < m; i++) {
      if (i === r || fIsZero(mat[i][c])) continue
      const f = mat[i][c]
      for (let j = c; j < n; j++) mat[i][j] = fSub(mat[i][j], fMul(f, mat[r][j]))
    }
    pivots.push(c)
    r++
  }
  return { mat, pivots }
}

/** 整数零空间基（每个基向量已约去公因数） */
function nullSpaceInt(A: number[][]): number[][] {
  const m = A.length
  const n = m ? A[0].length : 0
  if (!n) return []
  const { mat, pivots } = rref(A.map((row) => row.map((v) => frac(v))))
  const pivotSet = new Set(pivots)
  const free: number[] = []
  for (let c = 0; c < n; c++) {
    if (!pivotSet.has(c)) free.push(c)
  }
  const basis: number[][] = []
  for (const f of free) {
    const v: Frac[] = Array.from({ length: n }, () => frac(0))
    v[f] = frac(1)
    pivots.forEach((pc, ri) => {
      v[pc] = fSub(frac(0), mat[ri][f])
    })
    // 分数 → 整数：乘各分母的最小公倍数
    let lcm = 1
    for (const x of v) lcm = (lcm * x.d) / gcd(lcm, x.d)
    let ints = v.map((x) => (x.n * lcm) / x.d)
    let g = 0
    for (const k of ints) g = gcd(g, k)
    if (g > 1) ints = ints.map((k) => k / g)
    basis.push(ints)
  }
  return basis
}

/** 在零空间基的整数组合中搜索「全为正且系数和最小」的解 */
function minimalPositive(basis: number[][], maxCoeff = 6): number[] | null {
  if (!basis.length) return null
  const len = basis[0].length

  if (basis.length === 1) {
    const b = basis[0]
    if (b.every((v) => v > 0)) return b
    if (b.every((v) => v < 0)) return b.map((v) => -v)
    return null
  }

  const k = basis.length
  const limit = k > 3 ? 3 : maxCoeff
  // 收集全部正整数解，最后取系数和最小者（避免闭包赋值导致的类型收窄问题）
  const found: Array<{ v: number[]; sum: number }> = []
  const coeffs = new Array<number>(k).fill(0)

  const walk = (i: number): void => {
    if (i === k) {
      if (coeffs.every((c) => c === 0)) return
      const v = new Array<number>(len).fill(0)
      for (let j = 0; j < k; j++) {
        for (let t = 0; t < len; t++) v[t] += coeffs[j] * basis[j][t]
      }
      if (!v.every((x) => x > 0)) return
      found.push({ v: v.slice(), sum: v.reduce((s, x) => s + x, 0) })
      return
    }
    for (let c = -limit; c <= limit; c++) {
      coeffs[i] = c
      walk(i + 1)
    }
  }
  walk(0)

  if (!found.length) return null
  found.sort((a, b) => a.sum - b.sum)
  const best = found[0].v
  let g = 0
  for (const x of best) g = gcd(g, x)
  return g > 1 ? best.map((x) => x / g) : best
}

/* ---------------- 对外接口 ---------------- */

function detailOf(
  elements: string[],
  reactantCounts: Record<string, number>[],
  productCounts: Record<string, number>[],
): ElementBalance[] {
  return elements.map((el) => ({
    element: el,
    left: reactantCounts.reduce((s, c) => s + (c[el] ?? 0), 0),
    right: productCounts.reduce((s, c) => s + (c[el] ?? 0), 0),
  }))
}

/**
 * 配平一组组分（按元素计数表）。
 * 返回最小正整数系数；不守恒时给出逐元素差异明细。
 */
export function balanceComponents(
  reactantCounts: Record<string, number>[],
  productCounts: Record<string, number>[],
): BalanceResult {
  const nR = reactantCounts.length
  const nP = productCounts.length
  const elements = [
    ...new Set([
      ...reactantCounts.flatMap((c) => Object.keys(c)),
      ...productCounts.flatMap((c) => Object.keys(c)),
    ]),
  ].sort()

  const elementsDetail = detailOf(elements, reactantCounts, productCounts)
  const fallback: BalanceResult = {
    ok: true,
    reactantCoeffs: new Array<number>(nR).fill(1),
    productCoeffs: new Array<number>(nP).fill(1),
    elements: elementsDetail,
    multiple: false,
    message: '',
  }

  if (!nR || !nP) {
    return { ...fallback, ok: false, message: '反应物或产物为空，无法配平' }
  }
  if (!elements.length) {
    return { ...fallback, ok: false, message: '组分为空，无法配平' }
  }

  // 行 = 元素，列 = [反应物(正) … 产物(负) …]
  const A = elements.map((el) => [
    ...reactantCounts.map((c) => c[el] ?? 0),
    ...productCounts.map((c) => -(c[el] ?? 0)),
  ])

  const basis = nullSpaceInt(A)
  const solution = minimalPositive(basis)

  if (!solution) {
    const bad = elementsDetail.filter((e) => e.left !== e.right)
    const desc = bad.length
      ? bad.map((e) => `${e.element} 左 ${e.left} / 右 ${e.right}`).join('，')
      : '未找到正整数解'
    return {
      ...fallback,
      ok: false,
      message: `原子不守恒，无正整数配平方案（${desc}）`,
    }
  }

  const multiple = basis.length > 1
  return {
    ok: true,
    reactantCoeffs: solution.slice(0, nR),
    productCoeffs: solution.slice(nR),
    elements: elementsDetail,
    multiple,
    message: multiple
      ? '存在多组配平方案，此处为系数和最小的一组，可手动调整'
      : '已配平',
  }
}

/** 按分子图配平 */
export function balanceGraphs(
  reactants: MoleculeGraph[],
  products: MoleculeGraph[],
): BalanceResult {
  return balanceComponents(reactants.map(elementCounts), products.map(elementCounts))
}

/** 是否全部元素守恒（不要求系数，仅比较总量） */
export function isElementConserved(
  reactants: MoleculeGraph[],
  products: MoleculeGraph[],
): boolean {
  const sum = (gs: MoleculeGraph[]): Record<string, number> => {
    const out: Record<string, number> = {}
    for (const g of gs) {
      for (const [el, n] of Object.entries(elementCounts(g))) {
        out[el] = (out[el] ?? 0) + n
      }
    }
    return out
  }
  const l = sum(reactants)
  const r = sum(products)
  const keys = new Set([...Object.keys(l), ...Object.keys(r)])
  for (const k of keys) {
    if ((l[k] ?? 0) !== (r[k] ?? 0)) return false
  }
  return true
}
