/**
 * 分子 SVG 组合：键线 → 标签 → 热区（设计文档 §10 中央画布）。
 */
import type { MoleculeGraph } from '../types/molecule'
import { BondLines } from './bonds'
import { AtomLabels } from './atoms'
import { HitAreas } from './hitareas'
import type { Pt } from './renderUtils'

interface Props {
  graph: MoleculeGraph
  showHydrogen: boolean
  showAtomIds: boolean
  hoverAtomId: number | null
  hoverBondId: number | null
  selectedAtomId: number | null
  selectedBondId: number | null
  connectFromId: number | null
  attentionAtomIds: number[]
  pendingDeleteId: number | null
  panX: number
  panY: number
  scale: number
  onAtomHover(id: number | null): void
  onBondHover(id: number | null): void
  onAtomDown(e: React.PointerEvent, id: number): void
  onAtomMove(e: React.PointerEvent, id: number): void
  onAtomUp(e: React.PointerEvent, id: number): void
  onAtomClick(id: number): void
  onBondClick(id: number): void
  toCanvas(clientX: number, clientY: number): Pt
}

export function MoleculeSvg({
  graph,
  showHydrogen,
  showAtomIds,
  hoverAtomId,
  hoverBondId,
  selectedAtomId,
  selectedBondId,
  connectFromId,
  attentionAtomIds,
  pendingDeleteId,
  panX,
  panY,
  scale,
  onAtomHover,
  onBondHover,
  onAtomDown,
  onAtomMove,
  onAtomUp,
  onAtomClick,
  onBondClick,
  toCanvas,
}: Props) {
  const atomMap = new Map(graph.atoms.map((a) => [a.atom_id, a]))
  return (
    <svg
      width="100%"
      height="100%"
      color="#1a1a1a"
      style={{ display: 'block', fontFamily: '"Segoe UI", Arial, sans-serif' }}
    >
      <g transform={`translate(${panX} ${panY}) scale(${scale})`}>
        <BondLines graph={graph} atomMap={atomMap} />
        <AtomLabels
          graph={graph}
          showHydrogen={showHydrogen}
          showAtomIds={showAtomIds}
          hoverAtomId={hoverAtomId}
          selectedAtomId={selectedAtomId}
          attentionAtomIds={attentionAtomIds}
        />
        <HitAreas
          graph={graph}
          hoverAtomId={hoverAtomId}
          hoverBondId={hoverBondId}
          selectedAtomId={selectedAtomId}
          selectedBondId={selectedBondId}
          connectFromId={connectFromId}
          pendingDeleteId={pendingDeleteId}
          onAtomHover={onAtomHover}
          onBondHover={onBondHover}
          onAtomDown={onAtomDown}
          onAtomMove={onAtomMove}
          onAtomUp={onAtomUp}
          onAtomClick={onAtomClick}
          onBondClick={onBondClick}
          toCanvas={toCanvas}
        />
      </g>
    </svg>
  )
}