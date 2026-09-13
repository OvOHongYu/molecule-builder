/**
 * RDKit 分子构建桥接：
 * graph → molblock → get_mol → 描述符（canonical SMILES / InChI / InChIKey）。
 */
import type { MoleculeGraph } from '../types/molecule'
import { graphToMolblock, toFallbackSmiles } from '../engine/serialize'
import { initRdkit } from '../engine/rdkitLoader'

/**
 * 尝试用 RDKit 创建 JSMol：优先解析 molblock，返回 null 时回退用 SMILES 字符串（解析容错更强）。
 * 调用方必须负责 mol.delete()。
 */
function tryCreateMol(mod: any, graph: MoleculeGraph): { mol: any; via: 'molblock' | 'smiles' } | null {
  const inputs: Array<[string, 'molblock' | 'smiles']> = [
    [graphToMolblock(graph), 'molblock'],
    [toFallbackSmiles(graph), 'smiles'],
  ]
  for (const [input, via] of inputs) {
    if (!input) continue
    try {
      const mol = mod.get_mol(input)
      if (mol) return { mol, via }
    } catch (e) {
      console.warn(`RDKit get_mol (${via}) 失败:`, e)
    }
  }
  return null
}

/** RDKit 描述符：canonical SMILES / InChI / InChIKey */
export async function rdkitDescriptors(graph: MoleculeGraph): Promise<{
  smiles: string | null
  inchi: string | null
  inchikey: string | null
}> {
  const mod = await initRdkit()
  if (!mod || !graph.atoms.length) {
    return { smiles: null, inchi: null, inchikey: null }
  }
  const created = tryCreateMol(mod, graph)
  if (!created) return { smiles: null, inchi: null, inchikey: null }
  const { mol } = created
  try {
    let smiles: string | null = null
    let inchi: string | null = null
    let inchikey: string | null = null
    try {
      smiles = mol.get_smiles()
    } catch (e) {
      console.warn('RDKit get_smiles 失败:', e)
    }
    try {
      inchi = mol.get_inchi()
    } catch (e) {
      console.warn('RDKit get_inchi 失败:', e)
    }
    if (inchi) {
      try {
        inchikey = mod.get_inchikey_for_inchi(inchi)
      } catch (e) {
        console.warn('RDKit get_inchikey 失败:', e)
      }
    }
    return { smiles, inchi, inchikey }
  } catch (e) {
    console.warn('RDKit 描述符计算失败:', e)
    return { smiles: null, inchi: null, inchikey: null }
  } finally {
    try {
      mol.delete()
    } catch {
      /* ignore */
    }
  }
}