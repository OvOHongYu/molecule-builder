/**
 * 导出工具：SVG / PNG / SMILES / MOL（设计文档 §13 导出）。
 */
import type { MoleculeGraph, Measure } from '../types/molecule'
import { graphToMolblock } from '../engine/serialize'

function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 500)
}

/** 从画布 DOM 采集当前 SVG 并转换为独立文件（去除热区与 view 变换） */
function captureSvg(): SVGSVGElement | null {
  const el = document.querySelector('.canvas svg') as SVGSVGElement | null
  if (!el) return null
  // 取内容分组（含 pan/scale 变换）
  const group = el.querySelector('g[transform]') as SVGGraphicsElement | null
  if (!group) return null
  // 先基于文档中的原始元素计算包围盒（getBBox 仅在挂载节点上有效）
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  group.querySelectorAll<SVGGraphicsElement>('line,circle,text,path,polygon').forEach((n) => {
    if (n.closest('.hitareas')) return
    const bbox = n.getBBox()
    if (bbox.width === 0 && bbox.height === 0) return
    if (bbox.x < minX) minX = bbox.x
    if (bbox.y < minY) minY = bbox.y
    if (bbox.x + bbox.width > maxX) maxX = bbox.x + bbox.width
    if (bbox.y + bbox.height > maxY) maxY = bbox.y + bbox.height
  })
  if (!isFinite(minX)) return null
  // 克隆内容分组，去掉视变换与热区，组装独立 SVG
  const clone = group.cloneNode(true) as SVGGraphicsElement
  clone.removeAttribute('transform')
  clone.querySelectorAll('.hitareas').forEach((n) => n.remove())
  const pad = 16
  const w = Math.ceil(maxX - minX + pad * 2)
  const h = Math.ceil(maxY - minY + pad * 2)
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('width', String(w))
  svg.setAttribute('height', String(h))
  svg.setAttribute('viewBox', `${minX - pad} ${minY - pad} ${w} ${h}`)
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  svg.style.backgroundColor = 'white'
  svg.appendChild(clone)
  return svg
}

export function exportSvg(): void {
  const svg = captureSvg()
  if (!svg) return
  const str = new XMLSerializer().serializeToString(svg)
  download('分子结构.svg', '<?xml version="1.0" encoding="UTF-8"?>\n' + str, 'image/svg+xml')
}

export function exportPng(): void {
  const svg = captureSvg()
  if (!svg) return
  const str = new XMLSerializer().serializeToString(svg)
  const img = new Image()
  img.onload = () => {
    const scale = 3
    const canvas = document.createElement('canvas')
    canvas.width = img.width * scale
    canvas.height = img.height * scale
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = '分子结构.png'
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 500)
    }, 'image/png')
  }
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(str)
}

export function exportMol(graph: MoleculeGraph): void {
  download('分子结构.mol', graphToMolblock(graph), 'chemical/x-mdl-molfile')
}

export function exportSmiles(measure: Measure): void {
  const smiles = measure.canonicalSmiles || ''
  download('分子.smi', `${smiles}\n${measure.iupacName || measure.formula}`, 'text/plain')
}