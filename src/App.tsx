/**
 * 应用外壳（设计文档 §10 布局）：顶栏 / 左面板 / 中央画布 / 右面板 / 状态栏。
 */
import { useEffect, useState } from 'react'
import { LeftPanel } from './components/LeftPanel'
import { Canvas } from './components/Canvas'
import { RightPanel } from './components/RightPanel'
import { StatusBar } from './components/StatusBar'
import { Toast } from './components/Toast'
import { LibraryView } from './components/LibraryView'
import { useMoleculeStore } from './store/moleculeStore'
import { useViewStore } from './store/viewStore'
import { useMeasure } from './hooks/useMeasure'
import { graphBBox } from './engine/graphUtils'
import { resetEthane } from './engine/moleculeOps'

export default function App() {
  useMeasure()
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const undo = useMoleculeStore((s) => s.undo)
  const redo = useMoleculeStore((s) => s.redo)
  const reset = useMoleculeStore((s) => s.reset)

  // 首次进入自动适配视口显示默认乙烷
  useEffect(() => {
    const t = setTimeout(() => {
      const b = graphBBox(resetEthane())
      const el = document.querySelector('.canvas')
      if (el) {
        const r = el.getBoundingClientRect()
        useViewStore.getState().fit(b, r.width, r.height)
      }
    }, 60)
    return () => clearTimeout(t)
  }, [])

  // 全局键盘：撤销/重做（设计文档 §2.2 撤销策略）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">有机化学反应工作台</div>
        <div className="crumb">分子构建器</div>
        <div className="topbar-right">
          <button className="ghost" onClick={reset}>重置</button>
          <button className="ghost" onClick={() => setLibraryOpen(true)}>分子库</button>
        </div>
      </header>
      <div className="main">
        <LeftPanel onOpenLibrary={() => setLibraryOpen(true)} />
        <main className="center">
          <Canvas onMouseMove={(x, y) => setMouse({ x, y })} />
        </main>
        <RightPanel />
      </div>
      <StatusBar mouse={mouse} />
      <Toast />
      {libraryOpen && <LibraryView onClose={() => setLibraryOpen(false)} />}
    </div>
  )
}