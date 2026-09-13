/**
 * 左侧工具面板（设计文档 §10）：全局操作 + 布局 + 导出。
 */
import { useState } from 'react'
import { useMoleculeStore } from '../store/moleculeStore'
import { ToggleSwitch } from './ToggleSwitch'
import { exportSvg, exportPng, exportMol, exportSmiles } from '../lib/exportFile'
import { DIRECTION_PRESETS } from '../layout/arrange'

interface Props {
  onOpenLibrary(): void
}

export function LeftPanel({ onOpenLibrary }: Props) {
  const undo = useMoleculeStore((s) => s.undo)
  const redo = useMoleculeStore((s) => s.redo)
  const reset = useMoleculeStore((s) => s.reset)
  const requestArrange = useMoleculeStore((s) => s.requestArrange)
  const arrangeParams = useMoleculeStore((s) => s.arrangeParams)
  const setArrangeParams = useMoleculeStore((s) => s.setArrangeParams)
  const resetArrangeParams = useMoleculeStore((s) => s.resetArrangeParams)
  const showHydrogen = useMoleculeStore((s) => s.showHydrogen)
  const toggleHydrogen = useMoleculeStore((s) => s.toggleHydrogen)
  const showAtomIds = useMoleculeStore((s) => s.showAtomIds)
  const toggleAtomIds = useMoleculeStore((s) => s.toggleAtomIds)
  const graph = useMoleculeStore((s) => s.graph)
  const measure = useMoleculeStore((s) => s.measure)
  const [showParams, setShowParams] = useState(false)

  return (
    <aside className="left-panel">
      <div className="panel-title">工具</div>
      <div className="btn-col">
        <div className="btn-row">
          <button onClick={undo} title="撤销 (Ctrl+Z)">↶ 撤销</button>
          <button onClick={redo} title="重做 (Ctrl+Y)">↷ 重做</button>
        </div>
        <div className="btn-row">
          <button onClick={reset} className="danger">重置乙烷</button>
          <button onClick={onOpenLibrary}>分子库</button>
        </div>
      </div>

      <div className="panel-section">
        <div className="panel-title">布局</div>
        <button
          className="primary arrange-btn"
          onClick={requestArrange}
          title="按化学规范重新排布：环取正多边形、链按标准键角、键长归一、间距优化、多片段水平分布"
        >
          自动整理布局
        </button>
        <button className="ghost" onClick={() => setShowParams((v) => !v)}>
          {showParams ? '收起布局参数 ▲' : '布局参数 ▼'}
        </button>
        {showParams && (
          <div className="layout-params">
            <label className="lp-row">
              <span>键长</span>
              <input
                type="range"
                min={30}
                max={70}
                step={1}
                value={arrangeParams.bondLength}
                onChange={(e) => setArrangeParams({ bondLength: Number(e.target.value) })}
              />
              <em>{arrangeParams.bondLength}</em>
            </label>
            <label className="lp-row">
              <span>原子间距</span>
              <input
                type="range"
                min={40}
                max={120}
                step={2}
                value={arrangeParams.spacing}
                onChange={(e) => setArrangeParams({ spacing: Number(e.target.value) })}
              />
              <em>{arrangeParams.spacing}</em>
            </label>
            <label className="lp-row">
              <span>主链方向</span>
              <select
                value={arrangeParams.direction}
                onChange={(e) => setArrangeParams({ direction: Number(e.target.value) })}
              >
                {DIRECTION_PRESETS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <ToggleSwitch
              checked={arrangeParams.align}
              onChange={() => setArrangeParams({ align: !arrangeParams.align })}
              label="按主轴自动对齐"
            />
            <button className="ghost" onClick={resetArrangeParams}>恢复默认参数</button>
            <div className="small-note">整理仅重排坐标，不改动原子、键与键级</div>
          </div>
        )}
      </div>

      <div className="panel-section">
        <div className="panel-title">视图</div>
        <ToggleSwitch checked={showHydrogen} onChange={toggleHydrogen} label="显示 C-H 氢" />
        <ToggleSwitch checked={showAtomIds} onChange={toggleAtomIds} label="显示原子编号" />
        <div className="small-note">官能团氢（-OH、-NH₂、-SH、-CHO、端炔 -C≡C-H）不受该开关影响，始终显示</div>
      </div>

      <div className="panel-section">
        <div className="panel-title">导出</div>
        <div className="btn-row">
          <button onClick={exportSvg} title="导出矢量图（可直接用于论文）">SVG</button>
          <button onClick={exportPng}>PNG</button>
          <button onClick={() => exportMol(graph)}>MOL</button>
          <button onClick={() => exportSmiles(measure)}>SMILES</button>
        </div>
      </div>
    </aside>
  )
}