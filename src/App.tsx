/**
 * 应用外壳（设计文档 §10 布局）：顶栏 / 左面板 / 中央画布 / 右面板 / 状态栏。
 * 顶栏提供顶层视图切换：分子构建器 / 反应（反应模块设计方案 §5.1）。
 */
import { useEffect, useState } from 'react'
import { LeftPanel } from './components/LeftPanel'
import { Canvas } from './components/Canvas'
import { RightPanel } from './components/RightPanel'
import { StatusBar } from './components/StatusBar'
import { Toast } from './components/Toast'
import { LibraryView } from './components/LibraryView'
import { ReactionView } from './components/ReactionView'
import { useMoleculeStore } from './store/moleculeStore'
import { useViewStore } from './store/viewStore'
import { useReactionStore } from './store/reactionStore'
import { useMeasure } from './hooks/useMeasure'
import { graphBBox } from './engine/graphUtils'
import { resetEthane } from './engine/moleculeOps'

export default function App() {
  useMeasure()
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const mode = useViewStore((s) => s.mode)
  const setMode = useViewStore((s) => s.setMode)
  const showAtomIds = useMoleculeStore((s) => s.showAtomIds)
  const toggleAtomIds = useMoleculeStore((s) => s.toggleAtomIds)
  const showHydrogen = useMoleculeStore((s) => s.showHydrogen)
  const toggleHydrogen = useMoleculeStore((s) => s.toggleHydrogen)
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

  // 全局键盘：撤销/重做（设计文档 §2.2 撤销策略）；按当前视图分派到对应 store
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const k = e.key.toLowerCase()
      if (k === 'z' || k === 'y') {
        e.preventDefault()
        const reaction = useViewStore.getState().mode === 'reaction'
        if (k === 'y' || e.shiftKey) {
          if (reaction) useReactionStore.getState().redo()
          else redo()
        } else if (reaction) {
          useReactionStore.getState().undo()
        } else {
          undo()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  return (
    <div className={`app mode-${mode}`}>
      <header className="topbar">
        <div className="brand">有机化学反应工作台</div>
        <nav className="mode-switch" role="tablist" aria-label="顶层视图">
          <button
            role="tab"
            aria-selected={mode === 'molecule'}
            className={mode === 'molecule' ? 'active' : ''}
            onClick={() => setMode('molecule')}
          >
            分子构建器
          </button>
          <button
            role="tab"
            aria-selected={mode === 'reaction'}
            className={mode === 'reaction' ? 'active' : ''}
            onClick={() => setMode('reaction')}
          >
            反应
          </button>
        </nav>
        <div className="topbar-right">
          {mode === 'molecule' && (
            <>
              <button className="ghost" onClick={toggleHydrogen} title="切换 C-H 氢显示">
                {showHydrogen ? '隐藏 C-H' : '显示 C-H'}
              </button>
              <button className="ghost" onClick={toggleAtomIds} title="切换原子编号显示">
                {showAtomIds ? '隐藏编号' : '显示编号'}
              </button>
              <button className="ghost" onClick={reset}>
                重置
              </button>
            </>
          )}
          <button className="ghost" onClick={() => setLibraryOpen(true)}>
            分子库
          </button>
        </div>
      </header>

      {mode === 'molecule' ? (
        <div className="main">
          <LeftPanel onOpenLibrary={() => setLibraryOpen(true)} />
          <main className="center">
            <Canvas onMouseMove={(x, y) => setMouse({ x, y })} />
          </main>
          <RightPanel />
        </div>
      ) : (
        <ReactionView />
      )}

      <StatusBar mouse={mouse} />
      <Toast />
      {libraryOpen && <LibraryView onClose={() => setLibraryOpen(false)} />}
    </div>
  )
}