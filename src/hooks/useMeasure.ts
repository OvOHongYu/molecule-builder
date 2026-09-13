/**
 * 实时命名管线（设计文档 §9.1）：分子图变化 → 300ms 防抖 → 描述符计算。
 */
import { useEffect, useRef } from 'react'
import type { MoleculeGraph } from '../types/molecule'
import { useMoleculeStore } from '../store/moleculeStore'
import { computeMeasure } from '../engine/naming'
import { initRdkit } from '../engine/rdkitLoader'

/** 图签名（坐标变化不影响命名，避免拖动时重复计算） */
export function graphSignature(graph: MoleculeGraph): string {
  return (
    graph.atoms
      .map((a) => `${a.atom_id}:${a.element}:${a.charge}:${a.implicit_h}`)
      .join(',') +
    '|' +
    graph.bonds
      .map((b) => `${b.bond_id}:${b.atom1_id}-${b.atom2_id}:${b.order}${b.aromatic ? 'a' : ''}`)
      .join(',')
  )
}

export function useMeasure(): void {
  const graph = useMoleculeStore((s) => s.graph)
  const setMeasure = useMoleculeStore((s) => s.setMeasure)
  const graphRef = useRef(graph)
  graphRef.current = graph

  const key = graphSignature(graph)

  useEffect(() => {
    // 预加载 RDKit wasm（异步，不阻塞交互）
    initRdkit()
  }, [])

  useEffect(() => {
    let cancelled = false
    const t = setTimeout(async () => {
      const m = await computeMeasure(graphRef.current)
      if (!cancelled) setMeasure(m)
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [key, setMeasure])
}