// 逻辑验证脚本：分子式 / 兜底 SMILES / 删除分支标签 / 中英文名（tsx 运行）
import { resetEthane, addBond, addGroup, addAtom, deleteAtom, deleteBond, replaceAtomElement, setBondOrder, connectAtoms } from '../src/engine/moleculeOps'
import { molecularFormula } from '../src/engine/descriptors'
import { toFallbackSmiles } from '../src/engine/serialize'
import { iupacName } from '../src/engine/iupac'
import { isBenzeneLikeBond, isAromaticLikeBond } from '../src/engine/ring'
import { carbonHasFunctionalH } from '../src/engine/functionalGroups'
import { atomById } from '../src/engine/graphUtils'
import { arrangeLayout } from '../src/layout/arrange'
import { chineseName } from '../src/engine/chineseNamer'

function log(name: string, v: unknown): void {
  console.log(`${name} =`, v)
}

// 1) 丁苯（-Ph 接在 4 碳链头）
let g = resetEthane()
let r = addBond(g, 2, 1) // C3
if (!r.ok) throw new Error(r.error)
r = addBond(r.graph, 3, 1) // C4
if (!r.ok) throw new Error(r.error)
r = addGroup(r.graph, 1, 'Ph')
if (!r.ok) throw new Error(r.error)
g = r.graph
log('butylbenzene formula', molecularFormula(g)) // 期望 C10H14
log('butylbenzene smiles', toFallbackSmiles(g)) // 期望 CCCC(...c1ccccc1) 无尾缀
log('butylbenzene iupac', iupacName(g) ?? '(null, fallback 到 PubChem)')

// 2) 乙苯（Ph 接乙烷）
let g2 = resetEthane()
let r2 = addGroup(g2, 1, 'Ph')
if (!r2.ok) throw new Error(r2.error)
log('ethylbenzene formula', molecularFormula(r2.graph)) // C8H10
log('ethylbenzene smiles', toFallbackSmiles(r2.graph)) // CC(c1ccccc1)

// 3) 正丁烷删除中间碳 → 分支标签应不同
let g3 = resetEthane()
let r3 = addBond(g3, 2, 1)
if (!r3.ok) throw new Error(r3.error)
r3 = addBond(r3.graph, 3, 1)
if (!r3.ok) throw new Error(r3.error)
const d = deleteAtom(r3.graph, 2) // 中间碳 C2
if (d.kind === 'ask-branch') {
  log('deleteAtom branches', d.branches.map((b) => `${b.branchAtomId}:${b.label}`))
} else {
  log('deleteAtom unexpected', d.kind)
}

// 4) 乙醇替换检查
let g4 = resetEthane()
let r4 = addAtom(g4, 2, 'O')
if (!r4.ok) throw new Error(r4.error)
log('ethanol formula', molecularFormula(r4.graph)) // C2H6O
log('ethanol smiles', toFallbackSmiles(r4.graph)) // CCO
log('ethanol iupac', iupacName(r4.graph)) // 期望 propan? => null? ethan-1-ol 在自研范围? 报告实际值

// 5) 乙烯（双键）
let g5 = resetEthane()
let r5 = addBond(g5, 1, 2)
if (!r5.ok) throw new Error(r5.error)
log('ethene formula', molecularFormula(r5.graph)) // C2H4
log('ethene smiles', toFallbackSmiles(r5.graph)) // C=C
log('ethene iupac', iupacName(r5.graph))

// 6) 丙酸（-COOH 接乙烷）
let g6 = resetEthane()
let r6 = addGroup(g6, 1, 'COOH')
if (!r6.ok) throw new Error(`COOH: ${r6.error}`)
log('propanoic formula', molecularFormula(r6.graph)) // C3H6O2
log('propanoic smiles', toFallbackSmiles(r6.graph))
log('propanoic iupac', iupacName(r6.graph)) // 期望 propanoic acid
log('propanoic 中文', chineseName(r6.graph)) // 丙酸

// —— 中文名用例 ——
// 4 碳链（丁烷）
const butane = r3.graph
log('butane 中文', chineseName(butane)) // 丁烷
log('butane iupac', iupacName(butane)) // butane

// 2-甲基丙烷：丙烷 + CH3 于中间碳
let g7 = resetEthane()
let r7 = addBond(g7, 2, 1) // C3
if (!r7.ok) throw new Error(r7.error)
r7 = addGroup(r7.graph, 2, 'CH3') // C4 于 C2
if (!r7.ok) throw new Error(r7.error)
log('isobutane formula', molecularFormula(r7.graph)) // C4H10
log('isobutane 中文', chineseName(r7.graph)) // 2-甲基丙烷

// 2-丁醇：丁烷 + O 于 C2（邻位醇）
let g8 = resetEthane()
let r8 = addBond(g8, 2, 1)
if (!r8.ok) throw new Error(r8.error)
r8 = addBond(r8.graph, 3, 1)
if (!r8.ok) throw new Error(r8.error)
r8 = addAtom(r8.graph, 2, 'O')
if (!r8.ok) throw new Error(r8.error)
log('2-butanol formula', molecularFormula(r8.graph)) // C4H10O
log('2-butanol 中文', chineseName(r8.graph)) // 2-丁醇
log('2-butanol iupac', iupacName(r8.graph)) // butan-2-ol? 英文器要求端点 → null → PubChem

// 乙二醇：乙烷两端各接 O
let g9 = resetEthane()
let r9 = addAtom(g9, 1, 'O')
if (!r9.ok) throw new Error(r9.error)
r9 = addAtom(r9.graph, 2, 'O')
if (!r9.ok) throw new Error(r9.error)
log('glycol 中文', chineseName(r9.graph)) // 乙二醇
log('glycol iupac', iupacName(r9.graph)) // null（多 OH → PubChem）

// 丁二酸：乙烷两端各接 COOH
let g10 = resetEthane()
let r10 = addGroup(g10, 1, 'COOH')
if (!r10.ok) throw new Error(r10.error)
r10 = addGroup(r10.graph, 2, 'COOH')
if (!r10.ok) throw new Error(r10.error)
log('succinic formula', molecularFormula(r10.graph)) // C4H6O4
log('succinic 中文', chineseName(r10.graph)) // 丁二酸
log('succinic iupac', iupacName(r10.graph)) // null（多 CO2H → PubChem）

// 氯甲烷：乙烷一端替换为 Cl
let g11 = resetEthane()
let r11 = replaceAtomElement(g11, 2, 'Cl')
if (!r11.ok) throw new Error(r11.error)
log('chloromethane formula', molecularFormula(r11.graph)) // CH3Cl
log('chloromethane 中文', chineseName(r11.graph)) // 氯甲烷

// 2-氯乙醇：乙烷接 O 于 C2，再 C1 加 C 并替换为 Cl → ClCH2-CH2OH? 构造：C1-C2-O3，C1 加 C4，C4→Cl
let g12 = resetEthane()
let r12 = addAtom(g12, 2, 'O')
if (!r12.ok) throw new Error(r12.error)
r12 = addBond(r12.graph, 1, 1) // C4 接 C1
if (!r12.ok) throw new Error(r12.error)
r12 = replaceAtomElement(r12.graph, 4, 'Cl')
if (!r12.ok) throw new Error(r12.error)
log('2-chloroethanol 中文', chineseName(r12.graph)) // 2-氯乙醇

// 醚 guard：乙烷接 O，再 O 接 CH3 → 甲乙醚（中英文命名器都应 null）
let g13 = resetEthane()
let r13 = addAtom(g13, 2, 'O')
if (!r13.ok) throw new Error(r13.error)
r13 = addGroup(r13.graph, 3, 'CH3')
if (!r13.ok) throw new Error(r13.error)
log('ether formula', molecularFormula(r13.graph)) // C3H8O
log('ether 中文 (期望 null)', chineseName(r13.graph))
log('ether iupac (期望 null)', iupacName(r13.graph))

// 酮 guard：丙烷中间碳接 =O（用 addAtom O + ? 无法直接做双键到 O；用 丙烷 → replace? 跳过）
// 醛：丁烷 C1 接 CHO? 醛基接链端 → 戊醛? 用乙烷接 CHO → 丙醛
let g14 = resetEthane()
let r14 = addGroup(g14, 1, 'CHO')
if (!r14.ok) throw new Error(r14.error)
log('propanal 中文', chineseName(r14.graph)) // 丙醛
log('propanal iupac', iupacName(r14.graph)) // propanal

// —— 苯环系列中文名 ——
// 苯：乙苯 → 删乙基末端 → 甲苯 → 再删甲基 → 苯
let g15 = resetEthane()
let r15 = addGroup(g15, 1, 'Ph')
if (!r15.ok) throw new Error(r15.error)
const d1 = deleteAtom(r15.graph, 2)
if (d1.kind !== 'done') throw new Error('delete unexpected')
const d2 = deleteAtom(d1.graph, 1)
if (d2.kind !== 'done') throw new Error('delete unexpected')
log('benzene 中文', chineseName(d2.graph)) // 苯
const benzeneAtoms = d2.graph.atoms
const ring0 = benzeneAtoms.find((a) => a.atom_id === 3)! // Ph 环第 0 碳

// 甲苯（乙苯删一个 C）
log('toluene 中文', chineseName(d1.graph)) // 甲苯

// 苯酚：苯 + O 于 ring0
let r16 = addAtom(d2.graph, ring0.atom_id, 'O')
if (!r16.ok) throw new Error(r16.error)
log('phenol 中文', chineseName(r16.graph)) // 苯酚

// 苯甲酸：苯 + COOH 于 ring0（另起一个苯）
let r17 = addGroup(d2.graph, ring0.atom_id, 'COOH')
if (!r17.ok) throw new Error(r17.error)
log('benzoic acid 中文', chineseName(r17.graph)) // 苯甲酸

// 邻二甲苯：甲苯 + CH3 于 ring 相邻碳（ring0+1）
const tolueneGraph = d1.graph
const tolRing0 = tolueneGraph.atoms.find((a) => a.atom_id === 3)!
const tolRing1 = tolueneGraph.atoms.find((a) => a.atom_id === 4)!
let r18 = addGroup(tolueneGraph, tolRing1.atom_id, 'CH3')
if (!r18.ok) throw new Error(r18.error)
log('o-xylene 中文', chineseName(r18.graph)) // 邻二甲苯

// 对硝基甲苯：甲苯 + NO2 于对位（ring0+3）
const tolRing3 = tolueneGraph.atoms.find((a) => a.atom_id === 6)!
let r19 = addGroup(tolueneGraph, tolRing3.atom_id, 'NO2')
if (!r19.ok) throw new Error(r19.error)
log('p-nitrotoluene 中文', chineseName(r19.graph)) // 对硝基甲苯

// 间二氯苯：苯 + Cl 于 ring1、ring3
const b1 = benzeneAtoms.find((a) => a.atom_id === 4)!
const b3 = benzeneAtoms.find((a) => a.atom_id === 6)!
let r20 = addAtom(d2.graph, b1.atom_id, 'Cl')
if (!r20.ok) throw new Error(r20.error)
r20 = addAtom(r20.graph, b3.atom_id, 'Cl')
if (!r20.ok) throw new Error(r20.error)
log('m-dichlorobenzene 中文', chineseName(r20.graph)) // 间二氯苯

// 邻羟基苯甲酸（水杨酸）：苯甲酸 + O 于邻位 ring1
const acidRing1 = r17.graph.atoms.find((a) => a.atom_id === 4)!
let r21 = addAtom(r17.graph, acidRing1.atom_id, 'O')
if (!r21.ok) throw new Error(r21.error)
log('salicylic acid 中文', chineseName(r21.graph)) // 邻羟基苯甲酸

// 对氯甲苯：甲苯 + Cl 于对位
let r22 = addAtom(tolueneGraph, tolRing3.atom_id, 'Cl')
if (!r22.ok) throw new Error(r22.error)
log('p-chlorotoluene 中文', chineseName(r22.graph)) // 对氯甲苯

// 苯胺：苯 + N
let r23 = addAtom(d2.graph, ring0.atom_id, 'N')
if (!r23.ok) throw new Error(r23.error)
log('aniline 中文', chineseName(r23.graph)) // 苯胺

// —— 扩展命名用例（烯/炔/酮/酯/胺/异丙苯）——
const pair = (g: Parameters<typeof chineseName>[0]) => `${chineseName(g)} / ${iupacName(g)}`

// 乙烯：乙烷键级改双键
let e1 = resetEthane()
let re1 = setBondOrder(e1, 1, 2)
if (!re1.ok) throw new Error(re1.error)
log('ethene 中文/英文', pair(re1.graph)) // 乙烯 / ethene

// 丙烯：C1-C2-C3，末键改双
let e2 = resetEthane()
let re2 = addBond(e2, 2, 1)
if (!re2.ok) throw new Error(re2.error)
const propeneOut = setBondOrder(re2.graph, re2.graph.bonds[re2.graph.bonds.length - 1].bond_id, 2)
if (!propeneOut.ok) throw new Error(propeneOut.error)
log('propene 中文/英文', pair(propeneOut.graph)) // 丙烯 / propene

// 丙炔：末键改三键
let e3 = resetEthane()
let re3 = addBond(e3, 2, 1)
if (!re3.ok) throw new Error(re3.error)
const propyneOut = setBondOrder(re3.graph, re3.graph.bonds[re3.graph.bonds.length - 1].bond_id, 3)
if (!propyneOut.ok) throw new Error(propyneOut.error)
log('propyne 中文/英文', pair(propyneOut.graph)) // 丙炔 / propyne

// 丙酮：丙烷中间碳接 =O
let k1 = resetEthane()
let rk1 = addBond(k1, 2, 1)
if (!rk1.ok) throw new Error(rk1.error)
rk1 = addAtom(rk1.graph, 2, 'O')
if (!rk1.ok) throw new Error(rk1.error)
const ketoBond = rk1.graph.bonds[rk1.graph.bonds.length - 1].bond_id
const ketoneOut = setBondOrder(rk1.graph, ketoBond, 2)
if (!ketoneOut.ok) throw new Error(ketoneOut.error)
log('propan-2-one 中文/英文', pair(ketoneOut.graph)) // 2-丙酮 / propan-2-one

// 乙胺：乙烷接 N
let am1 = resetEthane()
let ram1 = addAtom(am1, 2, 'N')
if (!ram1.ok) throw new Error(ram1.error)
log('ethylamine 中文/英文', pair(ram1.graph)) // 乙胺 / ethan-1-amine

// 甲乙醚：乙烷接 O，O 再接 CH3
let et1 = resetEthane()
let ret1 = addAtom(et1, 2, 'O')
if (!ret1.ok) throw new Error(ret1.error)
ret1 = addGroup(ret1.graph, ret1.graph.atoms[ret1.graph.atoms.length - 1].atom_id, 'CH3')
if (!ret1.ok) throw new Error(ret1.error)
log('methoxyethane 中文/英文', pair(ret1.graph)) // 甲氧基乙烷 / methoxyethane

// 异丙苯：丙烷中间碳接 Ph
let ip1 = resetEthane()
let rip1 = addGroup(ip1, 2, 'CH3')
if (!rip1.ok) throw new Error(rip1.error)
rip1 = addGroup(rip1.graph, 2, 'Ph')
if (!rip1.ok) throw new Error(rip1.error)
log('isopropylbenzene 中文/英文', pair(rip1.graph)) // 异丙苯 / isopropylbenzene

// 酯：丙酸 + 酸羟基单键 O 上接 CH3 → 丙酸甲酯
let es1 = resetEthane()
let res1 = addGroup(es1, 1, 'COOH')
if (!res1.ok) throw new Error(res1.error)
const acidO = res1.graph.atoms.find(
  (a) =>
    a.element === 'O' &&
    res1.graph.bonds.some(
      (b) => b.order === 1 && ((b.atom1_id === a.atom_id) !== (b.atom2_id === a.atom_id)),
    ) &&
    res1.graph.bonds.filter((b) => b.atom1_id === a.atom_id || b.atom2_id === a.atom_id).length === 1,
)!
res1 = addGroup(res1.graph, acidO.atom_id, 'CH3')
if (!res1.ok) throw new Error(res1.error)
log('methyl propanoate 中文/英文', pair(res1.graph)) // 丙酸甲酯 / methyl propanoate

// —— 连接两个指定原子（不新增端点，直接成键）——
let cc1 = resetEthane()
let rcc = addBond(cc1, 2, 1) // C3
if (!rcc.ok) throw new Error(rcc.error)
const ringOut = connectAtoms(rcc.graph, 1, 3, 1) // C1—C3 闭环 → 环丙烷
if (!ringOut.ok) throw new Error(ringOut.error)
log('cyclopropane formula', molecularFormula(ringOut.graph)) // C3H6
log('cyclopropane 中文/英文', pair(ringOut.graph)) // 环结构 → null

// 已有键/自连 应被拒绝
log('connect self (期望 error)', connectAtoms(rcc.graph, 1, 1, 1).ok)
log('connect existing (期望 error)', connectAtoms(rcc.graph, 1, 2, 1).ok)

// —— 苯环键实体化：改一根环键 → 整圈转为显式 Kekulé ——
const benzeneGraph = d2.graph
const benBond = benzeneGraph.bonds.find((b) => b.aromatic)!.bond_id
const matOut = setBondOrder(benzeneGraph, benBond, 1)
if (!matOut.ok) throw new Error(matOut.error)
log(
  'benzene→kekulé',
  `aromatic=${matOut.graph.bonds.filter((b) => b.aromatic).length} orders=${matOut.graph.bonds.map((b) => b.order).join(',')} name=${pair(matOut.graph)}`,
)

// —— 手工绘制的凯库勒环（芳香标记已清除、单双交替）应同样识别为芳香环 ——
const keb = matOut.graph
log('kekulé ring 芳香提示', isBenzeneLikeBond(keb, keb.bonds[0].bond_id)) // true
const kebNoop = setBondOrder(keb, keb.bonds[0].bond_id, 2)
log('kekulé ring 切换', kebNoop.ok ? kebNoop.graph.bonds.map((b) => b.order).join(',') : kebNoop.error)
log('kekulé ring 切换后名称', kebNoop.ok ? pair(kebNoop.graph) : '')
const kebSame = setBondOrder(keb, keb.bonds[0].bond_id, 1)
log('kekulé ring 无变化不产生新图', kebSame.ok && kebSame.graph === keb)

// —— 官能团氢识别（不受“显示 C-H 氢”开关控制的常显碳氢）——
const fhCount = (g: Parameters<typeof chineseName>[0]) =>
  g.atoms.filter((a) => carbonHasFunctionalH(g, a)).length
log('propanal 官能团碳氢数 (期望 1，甲酰氢)', fhCount(r14.graph))
log('propyne 官能团碳氢数 (期望 1，端炔氢)', fhCount(propyneOut.graph))
log('acetone 官能团碳氢数 (期望 0，羰基无氢)', fhCount(ketoneOut.graph))
log('butane 官能团碳氢数 (期望 0)', fhCount(r3.graph))
log('ethanol 官能团碳氢数 (期望 0，-OH 由标签显示)', fhCount(r4.graph))

// —— 自动整理布局 ——
const dist = (g: Parameters<typeof chineseName>[0], b: { atom1_id: number; atom2_id: number }) => {
  const a1 = atomById(g, b.atom1_id)!
  const a2 = atomById(g, b.atom2_id)!
  return Math.hypot(a1.x - a2.x, a1.y - a2.y)
}

// 1) 键长标准化：丁烷全部键长 = 44
const arrButane = arrangeLayout(r3.graph)
log('arrange 丁烷键长', arrButane.bonds.map((b) => dist(arrButane, b).toFixed(1)).join(','))

// 2) 环规范化：苯环正六边形（边长 44、顶点半径 44）
const arrBenzene = arrangeLayout(d2.graph)
const cx = arrBenzene.atoms.reduce((s, a) => s + a.x, 0) / arrBenzene.atoms.length
const cy = arrBenzene.atoms.reduce((s, a) => s + a.y, 0) / arrBenzene.atoms.length
log(
  'arrange 苯环',
  `边长=${arrBenzene.bonds.map((b) => dist(arrBenzene, b).toFixed(1)).join(',')} 顶点半径=${arrBenzene.atoms
    .map((a) => Math.hypot(a.x - cx, a.y - cy).toFixed(1))
    .join(',')}`,
)

// 3) 方向对齐：主轴竖直
const arr90 = arrangeLayout(r3.graph, { direction: 90 })
const xs = arr90.atoms.map((a) => a.x)
const ys = arr90.atoms.map((a) => a.y)
log('arrange 方向 90° (期望 Δy > Δx)', `Δx=${(Math.max(...xs) - Math.min(...xs)).toFixed(1)} Δy=${(Math.max(...ys) - Math.min(...ys)).toFixed(1)}`)

// 4) 多片段：水平分布且不重叠
const frag = {
  atoms: [
    ...r3.graph.atoms.map((a) => ({ ...a })),
    ...r4.graph.atoms.map((a) => ({ ...a, atom_id: a.atom_id + 100 })),
  ],
  bonds: [
    ...r3.graph.bonds.map((b) => ({ ...b })),
    ...r4.graph.bonds.map((b) => ({ ...b, bond_id: b.bond_id + 100, atom1_id: b.atom1_id + 100, atom2_id: b.atom2_id + 100 })),
  ],
  nextAtomId: 200,
  nextBondId: 200,
}
const arrFrag = arrangeLayout(frag)
const fragA = arrFrag.atoms.filter((a) => a.atom_id <= 100)
const fragB = arrFrag.atoms.filter((a) => a.atom_id > 100)
const rangeA = { min: Math.min(...fragA.map((a) => a.x)), max: Math.max(...fragA.map((a) => a.x)) }
const rangeB = { min: Math.min(...fragB.map((a) => a.x)), max: Math.max(...fragB.map((a) => a.x)) }
log(
  'arrange 多片段 (期望两组 x 区间不重叠)',
  `${rangeA.min.toFixed(0)}~${rangeA.max.toFixed(0)} / ${rangeB.min.toFixed(0)}~${rangeB.max.toFixed(0)}`,
)

// 5) 化学完整性：原子/键/键级/芳香性不变
log(
  'arrange 完整性 (期望 true)',
  arrBenzene.atoms.length === d2.graph.atoms.length &&
    arrBenzene.atoms.every((a, i) => a.atom_id === d2.graph.atoms[i].atom_id) &&
    arrBenzene.bonds.length === d2.graph.bonds.length &&
    arrBenzene.bonds.every(
      (b, i) => b.order === d2.graph.bonds[i].order && b.aromatic === d2.graph.bonds[i].aromatic,
    ),
)

// 6) 性能：500 原子长链
const bigAtoms = Array.from({ length: 500 }, (_, i) => ({
  atom_id: i + 1,
  element: 'C',
  charge: 0,
  radical: 0,
  implicit_h: 2,
  stereo: '',
  lone_pairs: 0,
  x: i * 10,
  y: 0,
}))
const bigBonds = Array.from({ length: 499 }, (_, i) => ({
  bond_id: i + 1,
  atom1_id: i + 1,
  atom2_id: i + 2,
  order: 1 as const,
  aromatic: false,
  stereo: '',
}))
const t0 = Date.now()
const arrBig = arrangeLayout({ atoms: bigAtoms, bonds: bigBonds, nextAtomId: 501, nextBondId: 500 })
const elapsed = Date.now() - t0
log('arrange 500 原子耗时(ms)', elapsed)
log('arrange 500 原子键长归一 (期望全部 44)', arrBig.bonds.every((b) => Math.abs(dist(arrBig, b) - 44) < 0.12))

// —— 两个环被一个键连接：整理后不应出现键线相交 ——
const ringG = resetEthane()
let rrg = addBond(ringG, 2, 1)
if (!rrg.ok) throw new Error(rrg.error)
rrg = connectAtoms(rrg.graph, 1, 3, 1) // 三元环 1-2-3
if (!rrg.ok) throw new Error(rrg.error)
rrg = addBond(rrg.graph, 1, 1) // 连接键 → 原子 4
if (!rrg.ok) throw new Error(rrg.error)
for (const anchor of [4, 5, 6, 7]) {
  rrg = addBond(rrg.graph, anchor, 1)
  if (!rrg.ok) throw new Error(rrg.error)
}
rrg = connectAtoms(rrg.graph, 4, 8, 1) // 五元环 4-5-6-7-8
if (!rrg.ok) throw new Error(rrg.error)
const biRing = arrangeLayout(rrg.graph)
log('两环+单键 原子/键数', `${biRing.atoms.length}/${biRing.bonds.length}`)
log('两环+单键 键长', biRing.bonds.map((b) => dist(biRing, b).toFixed(1)).join(','))
const segs = biRing.bonds.map((b) => ({
  b,
  p: atomById(biRing, b.atom1_id)!,
  q: atomById(biRing, b.atom2_id)!,
}))
const crossSign = (P: { x: number; y: number }, Q: { x: number; y: number }, R: { x: number; y: number }) =>
  (Q.x - P.x) * (R.y - P.y) - (Q.y - P.y) * (R.x - P.x)
let crossCount = 0
for (let i = 0; i < segs.length; i++) {
  for (let j = i + 1; j < segs.length; j++) {
    const A = segs[i]
    const B = segs[j]
    if (
      [A.b.atom1_id, A.b.atom2_id].some((x) => x === B.b.atom1_id || x === B.b.atom2_id)
    ) {
      continue
    }
    const d1 = crossSign(B.p, B.q, A.p)
    const d2 = crossSign(B.p, B.q, A.q)
    const d3 = crossSign(A.p, A.q, B.p)
    const d4 = crossSign(A.p, A.q, B.q)
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
      crossCount++
    }
  }
}
log('两环+单键 键线相交数 (期望 0)', crossCount)

// —— 芳香环被破坏：残留芳香键应被规范化（去芳香化 + 凯库勒交替）——
const benForBreak = d2.graph
const brokenOut = deleteBond(benForBreak, benForBreak.bonds[0].bond_id)
if (brokenOut.kind !== 'done') throw new Error('deleteBond unexpected')
log('破环后 残留芳香键数 (期望 0)', brokenOut.graph.bonds.filter((b) => b.aromatic).length)
log('破环后 键级 (期望 2,1,2,1,2 交替保留双键)', brokenOut.graph.bonds.map((b) => b.order).join(','))
log('破环后 分子式 (期望 C6H8，双键未丢失)', molecularFormula(brokenOut.graph))

// —— 多环分子：每根芳香键都应按各自所在环处理 ——
const twoRings = {
  atoms: [...d2.graph.atoms.map((a) => ({ ...a })), ...d2.graph.atoms.map((a) => ({ ...a, atom_id: a.atom_id + 100 }))],
  bonds: [
    ...d2.graph.bonds.map((b) => ({ ...b })),
    ...d2.graph.bonds.map((b) => ({ ...b, bond_id: b.bond_id + 100, atom1_id: b.atom1_id + 100, atom2_id: b.atom2_id + 100 })),
  ],
  nextAtomId: 200,
  nextBondId: 200,
}
log('双苯环 芳香等价判定 (期望 true)', isAromaticLikeBond(twoRings, twoRings.bonds[0].bond_id))
const twoOut = setBondOrder(twoRings, twoRings.bonds[0].bond_id, 2)
log('双苯环 改键级成功 (期望 true)', twoOut.ok)
log(
  '双苯环 处理后残留芳香键数 (期望 6，另一环保持芳香)',
  twoOut.ok ? twoOut.graph.bonds.filter((b) => b.aromatic).length : -1,
)