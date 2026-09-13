/**
 * 渲染工具：文本测量、圆周-直线求交（键线在杂原子圆周处截断，设计文档 §6.2）。
 */
export interface Pt {
  x: number
  y: number
}

let ctx: CanvasRenderingContext2D | null = null

export function labelFont(size = 14): string {
  return `${size}px "Segoe UI", Arial, sans-serif`
}

/** 测量元素标签尺寸（缓存 canvas 2d） */
export function measureText(text: string, size = 14): { w: number; h: number } {
  if (!ctx) {
    ctx = document.createElement('canvas').getContext('2d')
  }
  ctx!.font = labelFont(size)
  const w = ctx!.measureText(text).width
  return { w, h: size * 1.2 }
}

/** 杂原子端点圆形背景半径：标签外接矩形半宽/半高 + 2px（设计文档 §6.2） */
export function labelRadius(text: string, size = 14): number {
  const { w, h } = measureText(text, size)
  return Math.max(w, h) / 2 + 2
}

/**
 * 圆与直线求交：直线 P + t·v（v 为单位向量），返回圆内部参数区间；
 * 不相交返回 null。
 */
export function circleLineIntersect(
  C: Pt,
  R: number,
  P: Pt,
  v: Pt,
): [number, number] | null {
  const dx = C.x - P.x
  const dy = C.y - P.y
  const t = dx * v.x + dy * v.y
  const d2 = dx * dx + dy * dy - t * t
  if (d2 > R * R) return null
  const s = Math.sqrt(R * R - d2)
  return [t - s, t + s]
}

interface Line {
  p: Pt
  v: Pt
}

/**
 * 计算一根键线在两个端点圆周之间的可见线段。
 * @param a 端点 A 中心，ra A 的圆周半径（碳端点为 0）
 * @param b 端点 B 中心，rb B 的圆半径
 * @param off 平行线偏移向量（单键为 (0,0)）
 */
export function clipBondSegment(
  a: Pt,
  ra: number,
  b: Pt,
  rb: number,
  off: Pt,
): Line {
  const u = unitVec(b.x - a.x, b.y - a.y)
  const p: Pt = { x: a.x + off.x, y: a.y + off.y }
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
  let tStart = 0
  let tEnd = len
  if (ra > 0) {
    const hit = circleLineIntersect(a, ra, p, u)
    if (hit) tStart = hit[1]
  }
  if (rb > 0) {
    const hit = circleLineIntersect(b, rb, p, u)
    if (hit) tEnd = hit[0]
  }
  tStart = Math.max(0, Math.min(tStart, len))
  tEnd = Math.min(len, Math.max(tStart, tEnd))
  return { p: { x: p.x + u.x * tStart, y: p.y + u.y * tStart }, v: { x: u.x * (tEnd - tStart), y: u.y * (tEnd - tStart) } }
}

export function unitVec(dx: number, dy: number): Pt {
  const len = Math.hypot(dx, dy) || 1
  return { x: dx / len, y: dy / len }
}

/** 精确文本中心（垂直方向用 dominant-baseline 居中） */
export function textAnchorOffset(): number {
  return 0
}