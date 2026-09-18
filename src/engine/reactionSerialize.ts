/**
 * 反应式序列化（反应模块设计方案 §10）：RXN V2000、反应 SMILES、去重键。
 *
 * - RXN：`$RXN` 头 + 反应物/产物 molblock 分块（复用 graphToMolblock）；
 *   系数按重复写出多个 molblock 表达（V2000 无系数位）。
 * - 反应 SMILES：`反应物.反应物>试剂>产物.产物`；SMILES 语义无法表达系数，导出时需提示。
 */
import type { MoleculeGraph } from '../types/molecule'
import type { ReactionScheme, SchemeComponent } from '../types/reaction'
import { graphToMolblock } from './serialize'

/** 按系数展开组分 → 分子图数组（每个分子一份） */
export function expandComponents(comps: SchemeComponent[]): MoleculeGraph[] {
  const out: MoleculeGraph[] = []
  for (const c of comps) {
    const n = Math.max(1, Math.round(c.coefficient))
    for (let i = 0; i < n; i++) out.push(c.molecule)
  }
  return out
}

/** 生成 RXN V2000 文本 */
export function toRxn(scheme: ReactionScheme): string {
  const reactants = expandComponents(scheme.reactants)
  const products = expandComponents(scheme.products)
  const lines: string[] = []
  lines.push('$RXN')
  lines.push('  MoleculeBuilder')
  lines.push('  Organic Chem Workbench')
  lines.push('  reaction scheme')
  lines.push('')
  lines.push(
    `${String(reactants.length).padStart(3)}${String(products.length).padStart(3)}`,
  )
  for (const g of reactants) {
    lines.push('$MOL')
    lines.push(graphToMolblock(g).trimEnd())
  }
  for (const g of products) {
    lines.push('$MOL')
    lines.push(graphToMolblock(g).trimEnd())
  }
  return lines.join('\n') + '\n'
}

/**
 * 生成反应 SMILES。
 * @param smilesOf 由调用方提供的 canonical SMILES 提供器（RDKit 优先，兜底自研）
 */
export function toReactionSmiles(
  scheme: ReactionScheme,
  smilesOf: (g: MoleculeGraph) => string,
): string {
  const side = (comps: SchemeComponent[]): string =>
    comps
      .map((c) => smilesOf(c.molecule).trim())
      .filter(Boolean)
      .join('.')
  const agents = scheme.agents.map((a) => a.text.trim()).filter(Boolean).join('.')
  return `${side(scheme.reactants)}>${agents}>${side(scheme.products)}`
}

/**
 * 反应式去重键（设计方案 §10.3）：
 * `反应物 key 升序 join("+") + ">" + 产物 key 升序 join("+")`
 * key 优先 InChIKey，缺失时退化为 canonical SMILES。
 * 不含条件与试剂——同一对反应物/产物在不同条件下视为同一反应式。
 */
export function schemeKey(
  reactantKeys: string[],
  productKeys: string[],
): string {
  const norm = (ks: string[]): string =>
    ks
      .map((k) => k.trim())
      .filter(Boolean)
      .sort()
      .join('+')
  return `${norm(reactantKeys)}>${norm(productKeys)}`
}
