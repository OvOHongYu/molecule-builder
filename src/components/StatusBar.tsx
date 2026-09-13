import { useEffect, useState } from 'react'
import { useViewStore } from '../store/viewStore'
import { useMoleculeStore } from '../store/moleculeStore'
import { getRdkitStatus, onRdkitStatus, type RdkitStatus } from '../engine/rdkitLoader'

interface Props {
  mouse: { x: number; y: number } | null
}

const ENGINE_LABEL: Record<RdkitStatus, string> = {
  idle: '引擎: 待启动',
  loading: '引擎: RDKit 加载中…',
  ready: '引擎: RDKit ✓',
  failed: '引擎: 自研兜底',
}

export function StatusBar({ mouse }: Props) {
  const scale = useViewStore((s) => s.scale)
  const measure = useMoleculeStore((s) => s.measure)
  const [engine, setEngine] = useState<RdkitStatus>(getRdkitStatus())
  useEffect(() => onRdkitStatus(setEngine), [])
  const inchikey = measure.inChIKey ? `InChIKey: ${measure.inChIKey}` : 'InChIKey: -'
  return (
    <div className="statusbar">
      <span>缩放 {(scale * 100).toFixed(0)}%</span>
      <span>
        坐标 {mouse ? `(${mouse.x.toFixed(0)}, ${mouse.y.toFixed(0)})` : '(-, -)'}
      </span>
      <span title="渲染与命名引擎状态">{ENGINE_LABEL[engine]}</span>
      <span>悬停原子/键触发编辑 · 空白拖动画布 · 滚轮缩放</span>
      <span className="status-inchi">{inchikey}</span>
    </div>
  )
}