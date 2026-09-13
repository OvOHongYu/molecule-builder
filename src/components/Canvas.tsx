/**
 * 中央画布（设计文档 §10）：SVG 渲染 + 缩放平移 + 点选工具条 + 菜单 + 删除确认。
 * 交互模型：悬停仅高亮；点选原子/键后出现工具条。
 * 拖动：指针移动超过阈值才真正开始（纯点击零位移、不入撤销栈）；保持抓取偏移；
 *       pointerup 在容器与 window 双级收尾，避免 capture 丢失导致拖动态卡死。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useMoleculeStore } from '../store/moleculeStore'
import { useViewStore } from '../store/viewStore'
import { MoleculeSvg } from '../render/MoleculeSvg'
import { atomById, bondById } from '../engine/graphUtils'
import { isAromaticLikeBond } from '../engine/ring'
import { AtomToolbar } from './AtomToolbar'
import { AtomMenus, type MenuKind } from './AtomMenus'
import { BondToolbar } from './BondToolbar'
import { BranchDialog } from './BranchDialog'
import type { GroupKey, BondOrder } from '../types/molecule'
import type { Pt } from '../render/renderUtils'

interface MenuState {
  kind: MenuKind
  atomId: number
}

interface Props {
  onMouseMove(x: number, y: number): void
}

const TOOLBAR_W = 276
const BOND_TOOLBAR_W = 264
const DRAG_THRESHOLD = 3 // px（画布坐标）

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(v, hi))
}

export function Canvas({ onMouseMove }: Props) {
  const graph = useMoleculeStore((s) => s.graph)
  const hoverAtomId = useMoleculeStore((s) => s.hoverAtomId)
  const hoverBondId = useMoleculeStore((s) => s.hoverBondId)
  const selectedAtomId = useMoleculeStore((s) => s.selectedAtomId)
  const selectedBondId = useMoleculeStore((s) => s.selectedBondId)
  const connectFrom = useMoleculeStore((s) => s.connectFrom)
  const attentionAtomIds = useMoleculeStore((s) => s.attentionAtomIds)
  const showHydrogen = useMoleculeStore((s) => s.showHydrogen)
  const showAtomIds = useMoleculeStore((s) => s.showAtomIds)
  const setHoverAtom = useMoleculeStore((s) => s.setHoverAtom)
  const setHoverBond = useMoleculeStore((s) => s.setHoverBond)
  const setSelectedAtom = useMoleculeStore((s) => s.setSelectedAtom)
  const setSelectedBond = useMoleculeStore((s) => s.setSelectedBond)
  const pendingDelete = useMoleculeStore((s) => s.pendingDelete)

  const panX = useViewStore((s) => s.panX)
  const panY = useViewStore((s) => s.panY)
  const scale = useViewStore((s) => s.scale)
  const setPan = useViewStore((s) => s.setPan)
  const zoomAt = useViewStore((s) => s.zoomAt)

  const [menu, setMenu] = useState<MenuState | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // 拖动状态：pending 记录按下信息，dragStarted 表示已真正进入拖动（超过阈值）
  const pendingDrag = useRef<{ id: number; startCanvas: Pt; offset: Pt } | null>(null)
  const dragStarted = useRef(false)
  const panning = useRef(false)
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 })

  const toCanvas = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current!.getBoundingClientRect()
      return {
        x: panX + (clientX - rect.left) / scale,
        y: panY + (clientY - rect.top) / scale,
      }
    },
    [panX, panY, scale],
  )

  const toScreen = useCallback(
    (x: number, y: number) => {
      // 返回画布容器相对坐标（HTML 浮层以 .canvas 为定位父级）
      return { x: (x - panX) * scale, y: (y - panY) * scale }
    },
    [panX, panY, scale],
  )

  // 滚轮缩放（原生 listener，非 passive）
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      zoomAt(cx, cy, Math.exp(-e.deltaY * 0.0012))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  // 拖动收尾：无论 pointerup 落在哪里（容器冒泡 / window 兜底）都能结束拖动态
  const finishDrag = useCallback(() => {
    if (dragStarted.current) {
      useMoleculeStore.getState().endDrag()
    }
    pendingDrag.current = null
    dragStarted.current = false
  }, [])

  useEffect(() => {
    const up = () => finishDrag()
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [finishDrag])

  const closeAll = useCallback(() => {
    setMenu(null)
    setSelectedAtom(null)
    setSelectedBond(null)
    setHoverAtom(null)
    setHoverBond(null)
    useMoleculeStore.getState().cancelConnect()
  }, [setSelectedAtom, setSelectedBond, setHoverAtom, setHoverBond])

  // Esc 取消选中/关闭菜单
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAll()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeAll])

  const onAtomDown = (e: React.PointerEvent, id: number) => {
    e.stopPropagation()
    setSelectedAtom(id)
    setMenu(null)
    setHoverAtom(id)
    if (e.button === 0) {
      // 只记录待拖动信息；移动超阈值才真正开始拖动（纯点击零位移）
      const p = toCanvas(e.clientX, e.clientY)
      const atom = useMoleculeStore.getState().graph.atoms.find((x) => x.atom_id === id)
      pendingDrag.current = atom
        ? { id, startCanvas: p, offset: { x: p.x - atom.x, y: p.y - atom.y } }
        : null
      dragStarted.current = false
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    }
  }

  const onAtomMove = (e: React.PointerEvent, id: number) => {
    const pd = pendingDrag.current
    if (!pd || pd.id !== id) return
    const p = toCanvas(e.clientX, e.clientY)
    if (!dragStarted.current) {
      if (Math.hypot(p.x - pd.startCanvas.x, p.y - pd.startCanvas.y) < DRAG_THRESHOLD) return
      dragStarted.current = true
      useMoleculeStore.getState().startDragAtom(id)
    }
    // 保持抓取偏移：原子跟随指针但不跳变到指针位置
    useMoleculeStore.getState().moveAtom(id, p.x - pd.offset.x, p.y - pd.offset.y)
  }

  const onAtomUp = () => {
    finishDrag()
  }

  const onBackgroundDown = (e: React.PointerEvent) => {
    if (e.button === 2) {
      closeAll()
      return
    }
    closeAll()
    panning.current = true
    panStart.current = { x: e.clientX, y: e.clientY, panX, panY }
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  }

  const onBackgroundMove = (e: React.PointerEvent) => {
    onMouseMove(toCanvas(e.clientX, e.clientY).x, toCanvas(e.clientX, e.clientY).y)
    if (panning.current) {
      const dx = e.clientX - panStart.current.x
      const dy = e.clientY - panStart.current.y
      setPan(panStart.current.panX + dx / scale, panStart.current.panY + dy / scale)
    }
  }

  const onBackgroundUp = () => {
    panning.current = false
    finishDrag()
  }

  // 选中原子工具条（点选后出现，位置钳制在画布内）
  let toolbar: React.ReactNode = null
  let toolbarFlip = false
  let toolbarLeft = 0
  let toolbarTop = 0
  if (selectedAtomId !== null && !menu && !dragStarted.current && !pendingDelete && connectFrom === null) {
    const atom = atomById(graph, selectedAtomId)
    if (atom) {
      const sp = toScreen(atom.x, atom.y)
      const rect = containerRef.current?.getBoundingClientRect()
      const w = rect ? rect.width : 800
      const h = rect ? rect.height : 600
      toolbarFlip = sp.x + TOOLBAR_W > w
      toolbarLeft = clamp(toolbarFlip ? sp.x - TOOLBAR_W - 8 : sp.x + 8, 8, Math.max(8, w - TOOLBAR_W - 8))
      toolbarTop = clamp(sp.y - 36, 8, Math.max(8, h - 48))
      toolbar = (
        <AtomToolbar
          left={toolbarLeft}
          top={toolbarTop}
          atomId={atom.atom_id}
          onAdd={(id) => setMenu({ kind: 'add', atomId: id })}
          onReplace={(id) => setMenu({ kind: 'replace', atomId: id })}
          onConnect={(id) => useMoleculeStore.getState().startConnect(id)}
          onDelete={(id) => useMoleculeStore.getState().applyDeleteAtom(id)}
        />
      )
    }
  }

  // 选中键工具条：单/双/三键切换 + 删除（位置钳制在画布内）
  let bondToolbar: React.ReactNode = null
  if (selectedBondId !== null && !menu && !pendingDelete) {
    const b = bondById(graph, selectedBondId)
    if (b) {
      const a1 = atomById(graph, b.atom1_id)
      const a2 = atomById(graph, b.atom2_id)
      if (a1 && a2) {
        const sp = toScreen((a1.x + a2.x) / 2, (a1.y + a2.y) / 2)
        const rect = containerRef.current?.getBoundingClientRect()
        const w = rect ? rect.width : 800
        const h = rect ? rect.height : 600
        const left = clamp(sp.x - BOND_TOOLBAR_W / 2, 8, Math.max(8, w - BOND_TOOLBAR_W - 8))
        const top = clamp(sp.y - 40, 8, Math.max(8, h - 48))
        bondToolbar = (
          <BondToolbar
            left={left}
            top={top}
            order={b.order}
            aromatic={isAromaticLikeBond(graph, b.bond_id)}
            onSetOrder={(o) => useMoleculeStore.getState().applySetBondOrder(b.bond_id, o)}
            onDelete={() => useMoleculeStore.getState().applyDeleteBond(b.bond_id)}
          />
        )
      }
    }
  }

  // 菜单位置
  let menuNode: React.ReactNode = null
  if (menu) {
    const atom = atomById(graph, menu.atomId)
    if (atom) {
      const sp = toScreen(atom.x, atom.y)
      const rect = containerRef.current?.getBoundingClientRect()
      const w = rect ? rect.width : 800
      const h = rect ? rect.height : 600
      const MENU_H = 320
      const my = clamp(sp.y + 24 > h - MENU_H ? Math.max(8, sp.y - MENU_H) : sp.y + 24, 8, Math.max(8, h - 60))
      const mx = clamp(toolbarFlip ? sp.x - TOOLBAR_W : sp.x + 8, 8, Math.max(8, w - 230))
      menuNode = (
        <AtomMenus
          kind={menu.kind}
          x={mx}
          y={my}
          onPickBond={(k) => {
            const order: BondOrder = k === 'single' ? 1 : k === 'double' ? 2 : 3
            if (menu.kind === 'connect') {
              // 连接模式：起点（connectFrom）与目标（menu.atomId）成键
              if (connectFrom !== null) {
                useMoleculeStore.getState().applyConnect(connectFrom, menu.atomId, order)
              }
              setMenu(null)
              return
            }
            useMoleculeStore.getState().applyAddBond(menu.atomId, order)
            setMenu(null)
          }}
          onPickAtom={(el) => {
            if (menu.kind === 'add') useMoleculeStore.getState().applyAddAtom(menu.atomId, el)
            else useMoleculeStore.getState().applyReplaceAtom(menu.atomId, el)
            setMenu(null)
          }}
          onPickGroup={(g: GroupKey) => {
            if (menu.kind === 'add') useMoleculeStore.getState().applyAddGroup(menu.atomId, g)
            else useMoleculeStore.getState().applyReplaceGroup(menu.atomId, g)
            setMenu(null)
          }}
          onClose={() => setMenu(null)}
        />
      )
    }
  }

  return (
    <div className="canvas-wrap">
      <div
        ref={containerRef}
        className="canvas"
        onPointerDown={onBackgroundDown}
        onPointerMove={onBackgroundMove}
        onPointerUp={onBackgroundUp}
        onPointerCancel={onBackgroundUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        <MoleculeSvg
          graph={graph}
          showHydrogen={showHydrogen}
          showAtomIds={showAtomIds}
          hoverAtomId={hoverAtomId}
          hoverBondId={hoverBondId}
          selectedAtomId={selectedAtomId}
          selectedBondId={selectedBondId}
          connectFromId={connectFrom}
          attentionAtomIds={attentionAtomIds}
          pendingDeleteId={pendingDelete?.id ?? null}
          panX={panX}
          panY={panY}
          scale={scale}
          onAtomHover={setHoverAtom}
          onBondHover={setHoverBond}
          onAtomDown={onAtomDown}
          onAtomMove={onAtomMove}
          onAtomUp={onAtomUp}
          onAtomClick={(id) => {
            if (connectFrom !== null) {
              // 连接模式：点自己=取消；点其他原子=弹出键级菜单
              if (id === connectFrom) useMoleculeStore.getState().cancelConnect()
              else setMenu({ kind: 'connect', atomId: id })
              return
            }
            setSelectedAtom(id)
          }}
          onBondClick={(id) => {
            setSelectedBond(id)
          }}
          toCanvas={toCanvas}
        />
        {toolbar}
        {menuNode}
        {bondToolbar}
      </div>
      <BranchDialog />
    </div>
  )
}