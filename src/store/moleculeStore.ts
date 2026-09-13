/**
 * 核心 store：分子图 + 悬停/选中 + 撤销重做 + 编辑操作编排（设计文档 §8.4、§11）。
 * 命名由 App 层的 useMeasure 钩子防抖触发，排版在 commit 中做局部松弛。
 */
import { create } from 'zustand'
import type { BondOrder, GroupKey, Measure, MoleculeGraph } from '../types/molecule'
import { cloneGraph } from '../engine/graphUtils'
import {
  addAtom as opAddAtom,
  addBond as opAddBond,
  addGroup as opAddGroup,
  connectAtoms as opConnectAtoms,
  deleteAtom as opDeleteAtom,
  deleteBond as opDeleteBond,
  finishDeleteAtom,
  finishDeleteBond,
  replaceAtomElement,
  replaceWithGroup,
  resetEthane,
  setBondOrder as opSetBondOrder,
  type BranchChoice,
  type DeleteOutcome,
} from '../engine/moleculeOps'
import { localRelax } from '../layout/relayout'
import { arrangeLayout, DEFAULT_ARRANGE_PARAMS, type ArrangeParams } from '../layout/arrange'
import { quickFormula } from '../engine/naming'
import { useLibraryStore, type SaveResult } from './libraryStore'
import type { LibraryEntry } from '../types/molecule'

const HISTORY_LIMIT = 50

export interface Toast {
  type: 'info' | 'error'
  message: string
}

interface PendingDelete {
  kind: 'atom' | 'bond'
  id: number
  branches: BranchChoice[]
}

interface MoleculeState {
  graph: MoleculeGraph
  measure: Measure
  past: MoleculeGraph[]
  future: MoleculeGraph[]
  hoverAtomId: number | null
  hoverBondId: number | null
  selectedAtomId: number | null
  selectedBondId: number | null
  /** 连键起点原子（“连接”工具：先选起点，再点终点） */
  connectFrom: number | null
  showHydrogen: boolean
  showAtomIds: boolean
  attentionAtomIds: number[]
  pendingDelete: PendingDelete | null
  toast: Toast | null
  dragSnapshot: MoleculeGraph | null
  /** 自动整理布局参数（键长 / 间距 / 方向 / 是否对齐） */
  arrangeParams: ArrangeParams

  setHoverAtom(id: number | null): void
  setHoverBond(id: number | null): void
  setSelectedAtom(id: number | null): void
  setSelectedBond(id: number | null): void
  startConnect(id: number): void
  cancelConnect(): void
  toggleHydrogen(): void
  toggleAtomIds(): void
  setMeasure(m: Measure): void
  setAttention(ids: number[]): void
  showToast(type: Toast['type'], message: string): void
  dismissToast(): void

  commit(graph: MoleculeGraph, opts?: { noRelax?: boolean }): void
  undo(): void
  redo(): void
  reset(): void

  applyAddBond(atomId: number, order: BondOrder): void
  applyAddAtom(atomId: number, element: string): void
  applyAddGroup(atomId: number, group: GroupKey): void
  applyReplaceAtom(atomId: number, element: string): void
  applyReplaceGroup(atomId: number, group: GroupKey): void
  applySetBondOrder(bondId: number, order: BondOrder): void
  applyConnect(aId: number, bId: number, order: BondOrder): void
  applyDeleteAtom(atomId: number): void
  applyDeleteBond(bondId: number): void
  confirmDelete(branchAtomId: number): void
  cancelDelete(): void

  startDragAtom(id: number): void
  moveAtom(id: number, x: number, y: number): void
  endDrag(): void
  cancelDrag(): void

  /** 一键按化学规范整理布局（同步、可撤销） */
  requestArrange(): void
  setArrangeParams(patch: Partial<ArrangeParams>): void
  resetArrangeParams(): void
  save(): SaveResult
}

export const useMoleculeStore = create<MoleculeState>((set, get) => {
  const initial: MoleculeGraph = resetEthane()
  const initialMeasure: Measure = {
    formula: quickFormula(initial),
    heavyCount: 2,
    canonicalSmiles: '',
    inChI: '',
    inChIKey: '',
    iupacName: '',
    chineseName: '乙烷',
    status: 'idle',
  }

  const pushHistory = (s: MoleculeState) => {
    const past = [...s.past, cloneGraph(s.graph)]
    if (past.length > HISTORY_LIMIT) past.shift()
    return { past, future: [] as MoleculeGraph[] }
  }

  const applyResult = (outcome: { ok: true; graph: MoleculeGraph; message?: string } | { ok: false; error: string; atomIds?: number[] }): void => {
    if (outcome.ok) {
      get().commit(outcome.graph)
      if (outcome.message) get().showToast('info', outcome.message)
    } else {
      get().showToast('error', outcome.error)
      if ('atomIds' in outcome && outcome.atomIds?.length) {
        set({ attentionAtomIds: outcome.atomIds })
      }
    }
  }

  const settleDelete = (outcome: DeleteOutcome, kind: 'atom' | 'bond'): void => {
    if (outcome.kind === 'done') {
      if (outcome.graph.atoms.length === 0) {
        set({
          graph: resetEthane(),
          past: [],
          future: [],
          pendingDelete: null,
          selectedAtomId: null,
          selectedBondId: null,
          connectFrom: null,
          toast: { type: 'info', message: '分子为空，已重置为默认乙烷' },
        })
      } else {
        const rel = localRelax(outcome.graph)
        set({
          ...pushHistory(get()),
          graph: rel,
          pendingDelete: null,
          selectedAtomId: null,
          selectedBondId: null,
          connectFrom: null,
          attentionAtomIds: [],
          toast: { type: 'info', message: kind === 'atom' ? '已删除原子' : '已断开键' },
        })
      }
      return
    }
    if (outcome.kind === 'ask-branch') {
      set({ pendingDelete: { kind, id: outcome.targetId, branches: outcome.branches } })
      return
    }
    set({
      graph: resetEthane(),
      past: [],
      future: [],
      pendingDelete: null,
      selectedAtomId: null,
      selectedBondId: null,
      connectFrom: null,
      toast: { type: 'info', message: '分子为空，已重置为默认乙烷' },
    })
  }

  return {
    graph: initial,
    measure: initialMeasure,
    past: [],
    future: [],
    hoverAtomId: null,
    hoverBondId: null,
    selectedAtomId: null,
    selectedBondId: null,
    connectFrom: null,
    showHydrogen: false,
    showAtomIds: false,
    attentionAtomIds: [],
    pendingDelete: null,
    toast: null,
    dragSnapshot: null,
    arrangeParams: { ...DEFAULT_ARRANGE_PARAMS },

    setHoverAtom: (id) => set({ hoverAtomId: id }),
    setHoverBond: (id) => set({ hoverBondId: id }),
    setSelectedAtom: (id) => set({ selectedAtomId: id, selectedBondId: null }),
    setSelectedBond: (id) => set({ selectedBondId: id, selectedAtomId: null }),
    startConnect: (id) => {
      set({ connectFrom: id, selectedAtomId: id, selectedBondId: null })
      get().showToast('info', `已选起点原子 #${id}，请点击目标原子（Esc 取消）`)
    },
    cancelConnect: () => set({ connectFrom: null }),
    toggleHydrogen: () => set((s) => ({ showHydrogen: !s.showHydrogen })),
    toggleAtomIds: () => set((s) => ({ showAtomIds: !s.showAtomIds })),
    setMeasure: (m) => set({ measure: m }),
    setAttention: (ids) => set({ attentionAtomIds: ids }),
    showToast: (type, message) => {
      set({ toast: { type, message } })
      setTimeout(() => {
        if (get().toast?.message === message) set({ toast: null })
      }, 3200)
    },
    dismissToast: () => set({ toast: null }),

    commit: (graph, opts) => {
      const rel = opts?.noRelax ? graph : localRelax(graph)
      set({
        ...pushHistory(get()),
        graph: rel,
        attentionAtomIds: [],
      })
    },

    undo: () => {
      const { past, future, graph } = get()
      if (!past.length) return
      const prev = past[past.length - 1]
      set({
        graph: prev,
        past: past.slice(0, -1),
        future: [graph, ...future].slice(0, HISTORY_LIMIT),
        pendingDelete: null,
        connectFrom: null,
        attentionAtomIds: [],
      })
    },

    redo: () => {
      const { future, past, graph } = get()
      if (!future.length) return
      const next = future[0]
      set({
        graph: next,
        future: future.slice(1),
        past: [...past, graph].slice(-HISTORY_LIMIT),
        pendingDelete: null,
        connectFrom: null,
        attentionAtomIds: [],
      })
    },

    reset: () => {
      set({
        graph: resetEthane(),
        past: [],
        future: [],
        pendingDelete: null,
        toast: { type: 'info', message: '已重置为默认乙烷' },
      })
    },

    applyAddBond: (atomId, order) => applyResult(opAddBond(get().graph, atomId, order)),
    applyAddAtom: (atomId, element) => applyResult(opAddAtom(get().graph, atomId, element)),
    applyAddGroup: (atomId, group) => applyResult(opAddGroup(get().graph, atomId, group)),
    applyReplaceAtom: (atomId, element) => applyResult(replaceAtomElement(get().graph, atomId, element)),
    applyReplaceGroup: (atomId, group) => applyResult(replaceWithGroup(get().graph, atomId, group)),

    applySetBondOrder: (bondId, order) => {
      const outcome = opSetBondOrder(get().graph, bondId, order)
      // 键级未变化（同一图引用）→ 不产生撤销记录
      if (outcome.ok && outcome.graph === get().graph) return
      applyResult(outcome)
    },

    applyConnect: (aId, bId, order) => {
      const outcome = opConnectAtoms(get().graph, aId, bId, order)
      if (outcome.ok) {
        get().commit(outcome.graph)
        get().showToast('info', `已连接 #${aId} — #${bId}`)
      } else {
        get().showToast('error', outcome.error)
      }
      set({ connectFrom: null })
    },

    applyDeleteAtom: (atomId) => settleDelete(opDeleteAtom(get().graph, atomId), 'atom'),
    applyDeleteBond: (bondId) => settleDelete(opDeleteBond(get().graph, bondId), 'bond'),

    confirmDelete: (branchAtomId) => {
      const pd = get().pendingDelete
      if (!pd) return
      const outcome =
        pd.kind === 'atom'
          ? finishDeleteAtom(get().graph, pd.id, branchAtomId)
          : finishDeleteBond(get().graph, pd.id, branchAtomId)
      settleDelete(outcome, pd.kind)
    },
    cancelDelete: () => set({ pendingDelete: null }),

    startDragAtom: (id) => {
      const g = get().graph
      set({
        dragSnapshot: cloneGraph(g),
        graph: {
          ...g,
          atoms: g.atoms.map((a) =>
            a.atom_id === id ? { ...a, manuallyPlaced: true } : a,
          ),
        },
      })
    },
    moveAtom: (id, x, y) => {
      const { graph } = get()
      set({
        graph: {
          ...graph,
          atoms: graph.atoms.map((a) => (a.atom_id === id ? { ...a, x, y } : a)),
        },
      })
    },
    endDrag: () => {
      const { dragSnapshot } = get()
      if (!dragSnapshot) return
      set({
        past: [...get().past, dragSnapshot].slice(-HISTORY_LIMIT),
        future: [],
        dragSnapshot: null,
      })
    },
    cancelDrag: () => {
      const { dragSnapshot } = get()
      if (!dragSnapshot) return
      set({ graph: dragSnapshot, dragSnapshot: null })
    },

    requestArrange: () => {
      const { graph } = get()
      if (!graph.atoms.length) return
      const next = arrangeLayout(graph, get().arrangeParams)
      set({
        ...pushHistory(get()),
        graph: next,
        attentionAtomIds: [],
        hoverAtomId: null,
        hoverBondId: null,
        toast: { type: 'info', message: '已按化学规范整理布局' },
      })
    },

    setArrangeParams: (patch) => set((s) => ({ arrangeParams: { ...s.arrangeParams, ...patch } })),

    resetArrangeParams: () => set({ arrangeParams: { ...DEFAULT_ARRANGE_PARAMS } }),

    save: (): SaveResult => {
      const { graph, measure } = get()
      if (!graph.atoms.length) {
        get().showToast('error', '分子为空，无法保存')
        return { status: 'error', message: '分子为空' }
      }
      const entry: Omit<LibraryEntry, 'id'> = {
        name: measure.chineseName || measure.iupacName || measure.formula,
        formula: measure.formula,
        smiles: measure.canonicalSmiles,
        inChI: measure.inChI,
        inChIKey: measure.inChIKey,
        atoms: graph.atoms.map((a) => ({ ...a })),
        bonds: graph.bonds.map((b) => ({ ...b })),
        tags: [],
        createdAt: Date.now(),
      }
      const res = useLibraryStore.getState().save(entry)
      if (res.status === 'duplicate') {
        if (res.existing) {
          get().showToast('info', `该结构已在库中（${res.existing.name || '已有分子'}）`)
        } else {
          get().showToast('info', '该结构已在库中')
        }
        return res
      }
      if (res.status === 'ok') {
        get().showToast('info', '已保存到分子库')
        return res
      }
      get().showToast('error', res.message ?? '保存失败')
      return res
    },
  }
})