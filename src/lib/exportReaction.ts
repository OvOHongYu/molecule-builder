/**
 * 反应式导出（反应模块设计方案 §10.4、§10.1、§10.2）：
 *  - 反应式 SVG / PNG：从画布 DOM 采集各组分内联 SVG 与箭头几何，重组成独立 SVG
 *  - RXN V2000 / 反应 SMILES
 *  - 化学方程式三变体（Unicode 下标 / LaTeX mhchem / 纯 ASCII）
 *  - PDF：浏览器原生打印（零依赖、矢量保真、中文可选中）
 */
import type { MoleculeGraph } from '../types/molecule'
import type { ReactionScheme } from '../types/reaction'
import { toRxn, toReactionSmiles } from '../engine/reactionSerialize'
import { molecularFormula } from '../engine/descriptors'
import { toEquationText, type EquationStyle } from './formulaText'
import { balanceGraphs } from '../engine/balance'
import { toFallbackSmiles } from '../engine/serialize'
import { canonicalSmilesWith } from '../engine/smarts'
import { initRdkit } from '../engine/rdkitLoader'

function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 500)
}

const NS = 'http://www.w3.org/2000/svg'
const PAD = 24

/**
 * 由画布 DOM 重组反应式 SVG。
 * 说明：组分卡片内的分子是内联 SVG，浏览器允许 SVG 嵌套并用 x/y/width/height 定位，
 * 因此直接克隆并定位即可保留矢量特性，无需重写渲染逻辑。
 */
export function buildSchemeSvg(root: HTMLElement): SVGSVGElement | null {
  const body = root.querySelector('.scheme-body') as HTMLElement | null
  if (!body) return null
  const bodyRect = body.getBoundingClientRect()
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('xmlns', NS)

  const cloneInto = (el: SVGGraphicsElement, x: number, y: number, w: number, h: number): void => {
    const clone = el.cloneNode(true) as SVGGraphicsElement
    clone.setAttribute('x', String(x))
    clone.setAttribute('y', String(y))
    clone.setAttribute('width', String(w))
    clone.setAttribute('height', String(h))
    svg.appendChild(clone)
  }

  let any = false
  // 组分分子
  root.querySelectorAll<SVGGraphicsElement>('.scheme-comp .static-mol').forEach((el) => {
    const r = el.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) return
    cloneInto(el, r.left - bodyRect.left, r.top - bodyRect.top, r.width, r.height)
    any = true
  })
  if (!any) return null

  // 系数与加号、箭头、条件文字：以 <text> 重新绘制，避免克隆 HTML 节点
  const texts: Array<{ x: number; y: number; s: string; size: number; anchor: string }> = []
  root.querySelectorAll<HTMLElement>('.scheme-comp').forEach((card) => {
    const r = card.getBoundingClientRect()
    const coeffEl = card.querySelector<HTMLElement>('.comp-coeff')
    const coeff = coeffEl?.textContent?.trim() ?? '1'
    if (coeff && coeff !== '1') {
      texts.push({
        x: r.left - bodyRect.left - 2,
        y: r.top - bodyRect.top + 12,
        s: coeff,
        size: 12,
        anchor: 'end',
      })
    }
  })
  root.querySelectorAll<HTMLElement>('.scheme-plus').forEach((el) => {
    const r = el.getBoundingClientRect()
    texts.push({
      x: r.left - bodyRect.left + r.width / 2,
      y: r.top - bodyRect.top + r.height / 2,
      s: '+',
      size: 16,
      anchor: 'middle',
    })
  })
  // 箭头与条件
  const arrowAbove = root.querySelector<HTMLElement>('.arrow-above')
  const arrowBelow = root.querySelector<HTMLElement>('.arrow-below')
  const arrowLine = root.querySelector<SVGGraphicsElement>('.arrow-line svg')
  if (arrowLine) {
    const r = arrowLine.getBoundingClientRect()
    const x0 = r.left - bodyRect.left
    const yMid = r.top - bodyRect.top + r.height / 2
    const x1 = x0 + r.width
    const line = document.createElementNS(NS, 'line')
    line.setAttribute('x1', String(x0))
    line.setAttribute('y1', String(yMid))
    line.setAttribute('x2', String(x1 - 6))
    line.setAttribute('y2', String(yMid))
    line.setAttribute('stroke', '#1a1a1a')
    line.setAttribute('stroke-width', '1.8')
    svg.appendChild(line)
    // 箭头头部
    const head = document.createElementNS(NS, 'path')
    head.setAttribute('d', `M${x1 - 8},${yMid - 4} L${x1},${yMid} L${x1 - 8},${yMid + 4} Z`)
    head.setAttribute('fill', '#1a1a1a')
    svg.appendChild(head)
  }
  for (const [el, dy] of [
    [arrowAbove, -6],
    [arrowBelow, 16],
  ] as const) {
    if (!el) continue
    const t = el.textContent?.trim()
    if (!t) continue
    const r = el.getBoundingClientRect()
    texts.push({
      x: r.left - bodyRect.left + r.width / 2,
      y: r.top - bodyRect.top + r.height / 2 + dy,
      s: t,
      size: 12,
      anchor: 'middle',
    })
  }
  for (const t of texts) {
    const node = document.createElementNS(NS, 'text')
    node.setAttribute('x', String(t.x))
    node.setAttribute('y', String(t.y))
    node.setAttribute('font-size', String(t.size))
    node.setAttribute('font-family', '"Segoe UI", "Microsoft YaHei", Arial, sans-serif')
    node.setAttribute('fill', '#1a1a1a')
    node.setAttribute('text-anchor', t.anchor)
    node.setAttribute('dominant-baseline', 'middle')
    node.textContent = t.s
    svg.appendChild(node)
  }

  // 统一平移留白并设置 viewBox
  const bodyRect2 = body.getBoundingClientRect()
  const w = Math.ceil(bodyRect2.width) + PAD * 2
  const h = Math.ceil(bodyRect2.height) + PAD * 2
  svg.setAttribute('width', String(w))
  svg.setAttribute('height', String(h))
  svg.setAttribute('viewBox', `${-PAD} ${-PAD} ${w} ${h}`)
  svg.setAttribute('xmlns', NS)
  const bg = document.createElementNS(NS, 'rect')
  bg.setAttribute('x', String(-PAD))
  bg.setAttribute('y', String(-PAD))
  bg.setAttribute('width', String(w))
  bg.setAttribute('height', String(h))
  bg.setAttribute('fill', '#ffffff')
  svg.insertBefore(bg, svg.firstChild)
  return svg
}

/** 导出反应式 SVG */
export function exportReactionSvg(root: HTMLElement): boolean {
  const svg = buildSchemeSvg(root)
  if (!svg) return false
  const str = new XMLSerializer().serializeToString(svg)
  download('反应式.svg', '<?xml version="1.0" encoding="UTF-8"?>\n' + str, 'image/svg+xml')
  return true
}

/** 导出反应式 PNG（3 倍分辨率、白底） */
export function exportReactionPng(root: HTMLElement): boolean {
  const svg = buildSchemeSvg(root)
  if (!svg) return false
  const str = new XMLSerializer().serializeToString(svg)
  const w = Number(svg.getAttribute('width')) || 600
  const h = Number(svg.getAttribute('height')) || 300
  const img = new Image()
  img.onload = () => {
    const scale = 3
    const canvas = document.createElement('canvas')
    canvas.width = w * scale
    canvas.height = h * scale
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = '反应式.png'
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 500)
    }, 'image/png')
  }
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(str)
  return true
}

/** 导出 RXN V2000 */
export function exportRxn(scheme: ReactionScheme): boolean {
  if (!scheme.reactants.length || !scheme.products.length) return false
  download('反应式.rxn', toRxn(scheme), 'chemical/x-mdl-rxnfile')
  return true
}

/**
 * 导出反应 SMILES。
 * canonical SMILES 依赖 RDKit，故为异步；失败时回退自研 SMILES。
 */
export async function exportReactionSmiles(scheme: ReactionScheme): Promise<boolean> {
  if (!scheme.reactants.length || !scheme.products.length) return false
  const mod = await initRdkit()
  const cache = new Map<MoleculeGraph, string>()
  const smilesOf = (g: MoleculeGraph): string => {
    const hit = cache.get(g)
    if (hit) return hit
    let s = mod ? (canonicalSmilesWith(mod, g) ?? '') : ''
    if (!s) s = toFallbackSmiles(g)
    cache.set(g, s)
    return s
  }
  const text = toReactionSmiles(scheme, smilesOf)
  // SMILES 语义无法表达计量系数，导出时明确提示
  const hasCoeff = [...scheme.reactants, ...scheme.products].some((c) => c.coefficient > 1)
  const note = hasCoeff
    ? '# 注意：反应 SMILES 无法表达计量系数，系数 >1 的组分在此处仅出现一次\n'
    : ''
  download('反应式.smi', note + text + '\n', 'text/plain')
  return true
}

/** 由反应式生成化学方程式文本（三变体） */
export function buildEquation(scheme: ReactionScheme, style: EquationStyle): string {
  const rGraphs = scheme.reactants.map((c) => c.molecule)
  const pGraphs = scheme.products.map((c) => c.molecule)
  const bal = balanceGraphs(rGraphs, pGraphs)
  const mk = (gs: MoleculeGraph[], coeffs: number[]) =>
    gs.map((g, i) => ({ formula: molecularFormula(g), coefficient: coeffs[i] ?? 1 }))
  return toEquationText(
    {
      reactants: mk(rGraphs, bal.reactantCoeffs),
      products: mk(pGraphs, bal.productCoeffs),
      arrow: scheme.arrow.kind,
      aboveText: scheme.aboveText,
      belowText: scheme.belowText,
      balanced: bal.ok,
    },
    style,
  )
}

/** 导出化学方程式（文本文件） */
export function exportEquation(scheme: ReactionScheme, style: EquationStyle): boolean {
  const text = buildEquation(scheme, style)
  if (!text) return false
  const name = style === 'latex' ? '反应方程式.tex' : '反应方程式.txt'
  const header =
    '# 以分子式表达，会丢失结构信息（同分异构体无法区分）。正式交付建议使用 SVG / PDF。\n'
  download(name, header + text + '\n', 'text/plain')
  return true
}

/**
 * 导出 PDF：走浏览器原生打印。
 * 打印样式表（.print-reaction）会隐藏 UI，只保留反应式内容。
 * 代价是用户需在打印对话框中选择「另存为 PDF」，换来零依赖与中文可选中。
 */
/** 导出反应式 PDF：走浏览器原生打印，详见实现内说明 */
export function exportReactionPdf(): void {
  document.body.classList.add('printing-reaction')
  const cleanup = (): void => {
    document.body.classList.remove('printing-reaction')
    window.removeEventListener('afterprint', cleanup)
  }
  window.addEventListener('afterprint', cleanup)
  window.print()
  // 兜底：部分浏览器不触发 afterprint
  setTimeout(cleanup, 2000)
}
