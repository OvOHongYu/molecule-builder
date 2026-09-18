/**
 * 静态分子 SVG（反应模块 §5.2 组分卡片渲染）：
 * 复用分子构建器的键线与标签渲染器，但**不含热区与交互**，并自动按内容包围盒适配视口。
 * 与画布渲染的区别：无 pan/scale 变换、无 hitareas，用于卡片式只读展示与导出。
 */
import { useMemo } from 'react'
import type { MoleculeGraph } from '../types/molecule'
import { BondLines } from './bonds'
import { AtomLabels } from './atoms'
import { graphBBox } from '../engine/graphUtils'

interface Props {
  graph: MoleculeGraph
  /** 留白（分子坐标单位） */
  padding?: number
  /** 是否显示 C-H 氢 */
  showHydrogen?: boolean
  /** 高亮的原子编号（预测命中位点） */
  highlightAtomIds?: number[]
  /** 高亮的键编号 */
  highlightBondIds?: number[]
  /** 额外 class（用于导出选择器） */
  className?: string
}

/**
 * 计算图的 viewBox（含留白）。空图返回一个 1×1 视口避免 SVG 报错。
 */
export function graphViewBox(graph: MoleculeGraph, padding = 24): string {
  if (!graph.atoms.length) return '0 0 1 1'
  const b = graphBBox(graph)
  const w = Math.max(1, b.maxX - b.minX) + padding * 2
  const h = Math.max(1, b.maxY - b.minY) + padding * 2
  return `${b.minX - padding} ${b.minY - padding} ${w} ${h}`
}

export function StaticMoleculeSvg({
  graph,
  padding = 24,
  showHydrogen = false,
  highlightAtomIds = [],
  highlightBondIds = [],
  className,
}: Props) {
  const atomMap = useMemo(() => new Map(graph.atoms.map((a) => [a.atom_id, a])), [graph])
  const viewBox = useMemo(() => graphViewBox(graph, padding), [graph, padding])
  const hlBonds = useMemo(() => new Set(highlightBondIds), [highlightBondIds])

  return (
    <svg
      className={className ?? 'static-mol'}
      viewBox={viewBox}
      color="#1a1a1a"
      style={{ display: 'block', width: '100%', height: '100%' }}
      fontFamily='"Segoe UI", Arial, sans-serif'
    >
      {/* 命中位点高亮：先在底层画一圈高亮键，再叠加正常键线 */}
      {hlBonds.size > 0 && (
        <g className="hl-bonds" stroke="#f0a020" strokeWidth={7} strokeOpacity={0.55} fill="none" strokeLinecap="round">
          {graph.bonds
            .filter((b) => hlBonds.has(b.bond_id))
            .map((b) => {
              const a = atomMap.get(b.atom1_id)
              const c = atomMap.get(b.atom2_id)
              if (!a || !c) return null
              return <line key={`hl-${b.bond_id}`} x1={a.x} y1={a.y} x2={c.x} y2={c.y} />
            })}
        </g>
      )}
      <BondLines graph={graph} atomMap={atomMap} />
      <AtomLabels
        graph={graph}
        showHydrogen={showHydrogen}
        showAtomIds={false}
        hoverAtomId={null}
        selectedAtomId={null}
        attentionAtomIds={highlightAtomIds}
      />
    </svg>
  )
}
