/**
 * 命名管线（设计文档 §9.1）：分子式 → SMILES → InChI → InChIKey → IUPAC（自研 → PubChem → 手动）。
 */
import type { Measure, MeasureStatus, MoleculeGraph } from '../types/molecule'
import { molecularFormula, heavyAtomCount } from './descriptors'
import { iupacName } from './iupac'
import { chineseName } from './chineseNamer'
import { toFallbackSmiles } from './serialize'
import { rdkitDescriptors } from '../layout/rdkitLayout'
import { fetchPubChemIupac, fetchPubChemChinese, fetchCactusIupac } from '../lib/pubchem'

export function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms)
    p.then((v) => {
      clearTimeout(t)
      resolve(v)
    }).catch(() => {
      clearTimeout(t)
      resolve(fallback)
    })
  })
}

export async function computeMeasure(graph: MoleculeGraph): Promise<Measure> {
  // 分子式即时计算（不依赖 RDKit，任何情况下先保证可用）
  const formula = molecularFormula(graph)
  const heavy = heavyAtomCount(graph)
  // 描述符：RDKit 8s 超时不阻塞（离线/加载失败走兜底）
  const rd = await withTimeout(rdkitDescriptors(graph), 8000, {
    smiles: null,
    inchi: null,
    inchikey: null,
  })
  const smiles = rd.smiles ?? (toFallbackSmiles(graph) || '')
  const inChI = rd.inchi ?? ''
  const inChIKey = rd.inchikey ?? ''

  // 命名：本地规则即时计算；缺失的部分走在线源（PubChem 优先，CACTUS 兜底；中文仅 PubChem 同义词）
  const localIupac = (() => {
    try {
      return iupacName(graph)
    } catch {
      return null
    }
  })()
  const localChinese = (() => {
    try {
      return chineseName(graph)
    } catch {
      return null
    }
  })()
  const needWeb = !localIupac && !!smiles
  const [webIupac, webCactus, webChinese] = await Promise.all([
    needWeb ? fetchPubChemIupac(smiles) : Promise.resolve(null),
    needWeb ? fetchCactusIupac(smiles) : Promise.resolve(null),
    !localChinese && smiles ? fetchPubChemChinese(smiles) : Promise.resolve(null),
  ])
  const iupac = localIupac ?? webIupac ?? webCactus ?? ''
  const chinese = localChinese ?? webChinese ?? ''

  let status: MeasureStatus = 'computing'
  if (iupac && smiles && inChIKey) status = 'ok'
  else if (smiles) status = 'partial'
  else status = 'failed'

  return {
    formula,
    heavyCount: heavy,
    canonicalSmiles: smiles,
    inChI,
    inChIKey,
    iupacName: iupac,
    chineseName: chinese,
    status,
  }
}

/** 轻量版（分子图变化时先即时更新分子式） */
export function quickFormula(graph: MoleculeGraph): string {
  return molecularFormula(graph)
}