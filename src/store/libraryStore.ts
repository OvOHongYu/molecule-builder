/**
 * 分子库 store（设计文档 §9.2）：localStorage 持久化，InChIKey 唯一索引去重。
 */
import { create } from 'zustand'
import type { Atom, Bond, LibraryEntry, MoleculeGraph } from '../types/molecule'
import { loadJSON, saveJSON } from '../lib/localStore'
import { recalcImplicitH } from '../engine/valence'

const LS_KEY = 'molecule-library-v2'

export type SaveResult =
  | { status: 'ok' }
  | { status: 'duplicate'; existing?: LibraryEntry }
  | { status: 'error'; message?: string }

interface LibraryState {
  entries: LibraryEntry[]
  loadedId: string | null
  save(entry: Omit<LibraryEntry, 'id'>): SaveResult
  remove(id: string): void
  clear(): void
  markLoaded(id: string | null): void
}

function persist(entries: LibraryEntry[]): void {
  saveJSON(LS_KEY, entries)
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  entries: loadJSON<LibraryEntry[]>(LS_KEY, []),
  loadedId: null,

  save: (entry) => {
    // 去重键：优先 InChIKey（设计文档 §9.2 唯一索引），无则回退 canonical SMILES
    const dup = get().entries.find((e) => {
      if (entry.inChIKey && e.inChIKey) return e.inChIKey === entry.inChIKey
      return !!entry.smiles && !!e.smiles && e.smiles === entry.smiles
    })
    if (dup) {
      return { status: 'duplicate', existing: dup }
    }
    const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
    const full: LibraryEntry = { ...entry, id }
    const entries = [full, ...get().entries]
    persist(entries)
    set({ entries, loadedId: id })
    return { status: 'ok' }
  },

  remove: (id) => {
    const entries = get().entries.filter((e) => e.id !== id)
    persist(entries)
    set({ entries, loadedId: get().loadedId === id ? null : get().loadedId })
  },

  clear: () => {
    persist([])
    set({ entries: [], loadedId: null })
  },

  markLoaded: (id) => set({ loadedId: id }),
}))

/** 将库条目还原为 MoleculeGraph */
export function entryToGraph(entry: LibraryEntry): MoleculeGraph {
  const atoms: Atom[] = entry.atoms.map((a) => ({ ...a }))
  const bonds: Bond[] = entry.bonds.map((b) => ({ ...b }))
  const maxA = atoms.reduce((m, a) => Math.max(m, a.atom_id), 0)
  const maxB = bonds.reduce((m, b) => Math.max(m, b.bond_id), 0)
  return recalcImplicitH({
    atoms,
    bonds,
    nextAtomId: maxA + 1,
    nextBondId: maxB + 1,
  })
}