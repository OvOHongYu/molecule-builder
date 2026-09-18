/**
 * 试剂与条件库（反应模块设计方案 §9）。
 *
 * 设计约束（源自规则清单）：
 *  1. **条件分流必须可区分**：`NaOH 水溶液` 与 `NaOH 醇溶液` 决定卤代烃水解还是消去，
 *     故同一物质的不同条件形态建立独立条目（naoh-aq / naoh-etoh）。
 *  2. **金属与无机产物条目可以无结构**：银氨溶液、Pd/C、分子筛等只有名称与类别。
 *  3. **显色 / 燃烧类试剂只需名称**：I₂ 溶液、FeCl₃ 溶液、浓 HNO₃、饱和 (NH₄)₂SO₄ 等。
 *
 * 缩写（abbr）是规则匹配的关键字段，须与规则 `agents` 声明保持一致，
 * 由 `scripts/verify.ts` 的引用闭合断言校验。
 */
import type { ReagentCategory } from '../types/reaction'

export interface ReagentEntry {
  id: string
  name: string
  nameEn: string
  abbr?: string
  smiles?: string
  category: ReagentCategory
  tags: string[]
  hazard?: string
}

export const REAGENTS: ReagentEntry[] = [
  /* ---------- 酸 ---------- */
  { id: 'h2so4-conc', name: '浓硫酸', nameEn: 'Sulfuric acid (conc.)', abbr: 'H2SO4(conc)', smiles: 'OS(=O)(=O)O', category: 'acid', tags: ['催化剂', '脱水剂', '磺化'], hazard: '强腐蚀性' },
  { id: 'h2so4-dilute', name: '稀硫酸', nameEn: 'Sulfuric acid (dilute)', abbr: 'H2SO4(aq)', smiles: 'OS(=O)(=O)O', category: 'acid', tags: ['水解', '催化'], hazard: '腐蚀性' },
  { id: 'hcl-conc', name: '浓盐酸', nameEn: 'Hydrochloric acid (conc.)', abbr: 'HCl(conc)', smiles: 'Cl', category: 'acid', tags: ['酸化', '卤代'], hazard: '强腐蚀性、挥发性' },
  { id: 'hno3-conc', name: '浓硝酸', nameEn: 'Nitric acid (conc.)', abbr: 'HNO3(conc)', smiles: 'O[N+](=O)[O-]', category: 'acid', tags: ['硝化', '氧化', '黄蛋白反应'], hazard: '强氧化性、强腐蚀性' },
  { id: 'hbr', name: '溴化氢', nameEn: 'Hydrogen bromide', abbr: 'HBr', smiles: 'Br', category: 'acid', tags: ['卤代'], hazard: '强腐蚀性' },
  { id: 'hi', name: '碘化氢', nameEn: 'Hydrogen iodide', abbr: 'HI', smiles: 'I', category: 'acid', tags: ['卤代'], hazard: '强腐蚀性' },
  { id: 'acoh', name: '乙酸', nameEn: 'Acetic acid', abbr: 'AcOH', smiles: 'CC(=O)O', category: 'acid', tags: ['酯化', '缓冲'], hazard: '腐蚀性' },
  { id: 'h3po4', name: '磷酸', nameEn: 'Phosphoric acid', abbr: 'H3PO4', smiles: 'OP(=O)(O)O', category: 'acid', tags: ['催化'], hazard: '腐蚀性' },
  { id: 'hcooh', name: '甲酸', nameEn: 'Formic acid', abbr: 'HCOOH', smiles: 'C(=O)O', category: 'acid', tags: ['还原', '酸化'], hazard: '腐蚀性' },

  /* ---------- 碱 ---------- */
  { id: 'naoh-aq', name: '氢氧化钠水溶液', nameEn: 'Sodium hydroxide (aq.)', abbr: 'NaOH(aq)', smiles: '[OH-].[Na+]', category: 'base', tags: ['水解', '皂化', '中和'], hazard: '强腐蚀性' },
  { id: 'naoh-etoh', name: '氢氧化钠醇溶液', nameEn: 'Sodium hydroxide (in EtOH)', abbr: 'NaOH(EtOH)', smiles: '[OH-].[Na+]', category: 'base', tags: ['消去'], hazard: '强腐蚀性、易燃' },
  { id: 'koh-aq', name: '氢氧化钾水溶液', nameEn: 'Potassium hydroxide (aq.)', abbr: 'KOH(aq)', smiles: '[OH-].[K+]', category: 'base', tags: ['水解', '皂化'], hazard: '强腐蚀性' },
  { id: 'koh-etoh', name: '氢氧化钾醇溶液', nameEn: 'Potassium hydroxide (in EtOH)', abbr: 'KOH(EtOH)', smiles: '[OH-].[K+]', category: 'base', tags: ['消去'], hazard: '强腐蚀性、易燃' },
  { id: 'na2co3', name: '碳酸钠', nameEn: 'Sodium carbonate', abbr: 'Na2CO3', smiles: '[Na+].[Na+].[O-]C(=O)[O-]', category: 'base', tags: ['中和', '弱碱性'], hazard: '刺激性' },
  { id: 'nahco3', name: '碳酸氢钠', nameEn: 'Sodium bicarbonate', abbr: 'NaHCO3', smiles: '[Na+].OC(=O)[O-]', category: 'base', tags: ['鉴别羧酸', '弱碱性'], hazard: '低' },
  { id: 'et3n', name: '三乙胺', nameEn: 'Triethylamine', abbr: 'Et3N', smiles: 'CCN(CC)CC', category: 'base', tags: ['缚酸剂'], hazard: '易燃、刺激性' },
  { id: 'pyridine', name: '吡啶', nameEn: 'Pyridine', abbr: 'py', smiles: 'c1ccncc1', category: 'base', tags: ['缚酸剂', '溶剂'], hazard: '易燃、有毒' },
  { id: 'tbuok', name: '叔丁醇钾', nameEn: 'Potassium tert-butoxide', abbr: 't-BuOK', smiles: 'CC(C)(C)[O-].[K+]', category: 'base', tags: ['强碱', '消去'], hazard: '强碱、易燃' },
  { id: 'nanh2', name: '氨基钠', nameEn: 'Sodium amide', abbr: 'NaNH2', smiles: '[NH2-].[Na+]', category: 'base', tags: ['强碱'], hazard: '遇水剧烈反应' },
  { id: 'nah', name: '氢化钠', nameEn: 'Sodium hydride', abbr: 'NaH', smiles: '[NaH]', category: 'base', tags: ['强碱'], hazard: '遇水剧烈反应、易燃' },

  /* ---------- 氧化剂 ---------- */
  { id: 'kmno4-acidic', name: '酸性高锰酸钾', nameEn: 'Potassium permanganate (acidic)', abbr: 'KMnO4/H+', smiles: '[K+].[O-][Mn](=O)(=O)=O', category: 'oxidant', tags: ['强氧化', '褪色', '断键'], hazard: '强氧化性、腐蚀性' },
  { id: 'kmno4-dilute-cold', name: '稀冷高锰酸钾', nameEn: 'Potassium permanganate (dilute, cold)', abbr: 'KMnO4(dil.)', smiles: '[K+].[O-][Mn](=O)(=O)=O', category: 'oxidant', tags: ['氧化', '邻二醇'], hazard: '强氧化性' },
  { id: 'pcc', name: '吡啶氯铬酸盐', nameEn: 'Pyridinium chlorochromate', abbr: 'PCC', smiles: 'c1cc[nH+]cc1.[O-][Cr](=O)(=O)Cl', category: 'oxidant', tags: ['氧化', '伯醇→醛'], hazard: '有毒、致癌' },
  { id: 'pdc', name: '吡啶二铬酸盐', nameEn: 'Pyridinium dichromate', abbr: 'PDC', smiles: 'c1cc[nH+]cc1.[O-][Cr](=O)(=O)[O-][Cr](=O)(=O)[O-]', category: 'oxidant', tags: ['氧化'], hazard: '有毒、致癌' },
  { id: 'jones', name: '琼斯试剂', nameEn: 'Jones reagent', abbr: 'CrO3/H2SO4', smiles: 'O=[Cr](=O)(O)O', category: 'oxidant', tags: ['氧化', '伯醇→酸'], hazard: '强氧化性、致癌' },
  { id: 'mcpba', name: '间氯过氧苯甲酸', nameEn: 'meta-Chloroperoxybenzoic acid', abbr: 'mCPBA', smiles: 'O=C(OO)c1cccc(Cl)c1', category: 'oxidant', tags: ['环氧化', '氧化'], hazard: '强氧化性、易爆' },
  { id: 'h2o2', name: '过氧化氢', nameEn: 'Hydrogen peroxide', abbr: 'H2O2', smiles: 'OO', category: 'oxidant', tags: ['氧化', '漂白'], hazard: '氧化性' },
  { id: 'o2', name: '氧气', nameEn: 'Oxygen', abbr: 'O2', smiles: 'O=O', category: 'oxidant', tags: ['燃烧', '催化氧化'], hazard: '助燃' },
  { id: 'oso4', name: '四氧化锇', nameEn: 'Osmium tetroxide', abbr: 'OsO4', smiles: 'O=[Os](=O)(=O)=O', category: 'oxidant', tags: ['双羟基化'], hazard: '剧毒、挥发性' },
  { id: 'tollens', name: '银氨溶液', nameEn: 'Tollens reagent', abbr: '[Ag(NH3)2]OH', category: 'oxidant', tags: ['银镜反应', '鉴别醛基'], hazard: '久置生成雷银、易爆' },
  { id: 'cuoh2', name: '新制氢氧化铜', nameEn: 'Copper(II) hydroxide (fresh)', abbr: 'Cu(OH)2', smiles: '[Cu+2].[OH-].[OH-]', category: 'oxidant', tags: ['醛基检验', '砖红色沉淀'], hazard: '刺激性' },
  { id: 'fehling', name: '斐林试剂', nameEn: 'Fehling reagent', abbr: 'Fehling', category: 'oxidant', tags: ['醛基检验'], hazard: '腐蚀性' },

  /* ---------- 还原剂 ---------- */
  { id: 'h2', name: '氢气', nameEn: 'Hydrogen', abbr: 'H2', smiles: '[H][H]', category: 'reductant', tags: ['加成', '加氢', '还原'], hazard: '易燃易爆' },
  { id: 'nabh4', name: '硼氢化钠', nameEn: 'Sodium borohydride', abbr: 'NaBH4', smiles: '[BH4-].[Na+]', category: 'reductant', tags: ['还原', '醛酮→醇'], hazard: '遇水放氢' },
  { id: 'lialh4', name: '氢化铝锂', nameEn: 'Lithium aluminium hydride', abbr: 'LiAlH4', smiles: '[AlH4-].[Li+]', category: 'reductant', tags: ['强还原'], hazard: '遇水剧烈反应、易燃' },
  { id: 'sn-hcl', name: '锡-盐酸', nameEn: 'Tin and hydrochloric acid', abbr: 'Sn/HCl', category: 'reductant', tags: ['还原', '硝基→氨基'], hazard: '腐蚀性' },
  { id: 'feso4', name: '硫酸亚铁', nameEn: 'Iron(II) sulfate', abbr: 'FeSO4', smiles: '[Fe+2].[O-]S(=O)(=O)[O-]', category: 'reductant', tags: ['还原'], hazard: '刺激性' },

  /* ---------- 催化剂 ---------- */
  { id: 'ni', name: '镍', nameEn: 'Nickel', abbr: 'Ni', smiles: '[Ni]', category: 'catalyst', tags: ['加氢催化剂'], hazard: '粉末易燃' },
  { id: 'ni-raney', name: '雷尼镍', nameEn: 'Raney nickel', abbr: 'Raney Ni', category: 'catalyst', tags: ['加氢催化剂'], hazard: '自燃' },
  { id: 'pt', name: '铂', nameEn: 'Platinum', abbr: 'Pt', smiles: '[Pt]', category: 'catalyst', tags: ['加氢催化剂'], hazard: '—' },
  { id: 'pd-c', name: '钯碳', nameEn: 'Palladium on carbon', abbr: 'Pd/C', category: 'catalyst', tags: ['加氢', '脱保护'], hazard: '易燃' },
  { id: 'lindlar', name: '林德拉催化剂', nameEn: 'Lindlar catalyst', abbr: 'Lindlar', category: 'catalyst', tags: ['选择性加氢', '炔→烯'], hazard: '—' },
  { id: 'cu', name: '铜', nameEn: 'Copper', abbr: 'Cu', smiles: '[Cu]', category: 'catalyst', tags: ['催化氧化'], hazard: '—' },
  { id: 'ag', name: '银', nameEn: 'Silver', abbr: 'Ag', smiles: '[Ag]', category: 'catalyst', tags: ['催化氧化'], hazard: '—' },
  { id: 'febr3', name: '三溴化铁', nameEn: 'Iron(III) bromide', abbr: 'FeBr3', smiles: '[Fe](Br)(Br)Br', category: 'catalyst', tags: ['卤代催化剂', '路易斯酸'], hazard: '腐蚀性、吸湿' },
  { id: 'fecl3', name: '三氯化铁', nameEn: 'Iron(III) chloride', abbr: 'FeCl3', smiles: '[Fe](Cl)(Cl)Cl', category: 'catalyst', tags: ['卤代催化剂', '酚显色'], hazard: '腐蚀性、吸湿' },
  { id: 'alcl3', name: '三氯化铝', nameEn: 'Aluminium chloride', abbr: 'AlCl3', smiles: '[Al](Cl)(Cl)Cl', category: 'catalyst', tags: ['傅-克反应', '路易斯酸'], hazard: '遇水剧烈反应' },
  { id: 'hgso4', name: '硫酸汞', nameEn: 'Mercury(II) sulfate', abbr: 'HgSO4', smiles: '[Hg+2].[O-]S(=O)(=O)[O-]', category: 'catalyst', tags: ['炔水合'], hazard: '剧毒' },
  { id: 'c-activated', name: '活性炭', nameEn: 'Activated carbon', abbr: 'C', category: 'catalyst', tags: ['高温催化', '吸附'], hazard: '粉尘可燃' },
  { id: 'enzyme', name: '酶', nameEn: 'Enzyme', abbr: 'enzyme', category: 'catalyst', tags: ['生物催化', '水解'], hazard: '—' },
  { id: 'molecular-sieve', name: '分子筛', nameEn: 'Molecular sieves', abbr: '4Å MS', category: 'catalyst', tags: ['干燥', '脱水'], hazard: '—' },
  { id: 'amberlyst', name: '酸性树脂', nameEn: 'Amberlyst-15', abbr: 'Amberlyst', category: 'catalyst', tags: ['固体酸催化'], hazard: '—' },

  /* ---------- 卤化 / 脱水试剂 ---------- */
  { id: 'br2', name: '溴', nameEn: 'Bromine', abbr: 'Br2', smiles: 'BrBr', category: 'other', tags: ['加成', '卤代', '褪色'], hazard: '强腐蚀性、挥发性' },
  { id: 'br2-water', name: '溴水', nameEn: 'Bromine water', abbr: 'Br2(aq)', smiles: 'BrBr', category: 'other', tags: ['酚取代', '鉴别不饱和键'], hazard: '腐蚀性' },
  { id: 'cl2', name: '氯气', nameEn: 'Chlorine', abbr: 'Cl2', smiles: 'ClCl', category: 'other', tags: ['加成', '卤代'], hazard: '剧毒' },
  { id: 'i2', name: '碘', nameEn: 'Iodine', abbr: 'I2', smiles: 'II', category: 'other', tags: ['显色', '卤代'], hazard: '升华、刺激性' },
  { id: 'socl2', name: '二氯亚砜', nameEn: 'Thionyl chloride', abbr: 'SOCl2', smiles: 'O=S(Cl)Cl', category: 'other', tags: ['酰氯化', '氯化'], hazard: '腐蚀性、遇水放气' },
  { id: 'pbr3', name: '三溴化磷', nameEn: 'Phosphorus tribromide', abbr: 'PBr3', smiles: 'BrP(Br)Br', category: 'other', tags: ['溴代'], hazard: '腐蚀性、遇水放气' },
  { id: 'h2o', name: '水', nameEn: 'Water', abbr: 'H2O', smiles: 'O', category: 'other', tags: ['水合', '水解'], hazard: '—' },

  /* ---------- 其他试剂 ---------- */
  { id: 'formaldehyde', name: '甲醛', nameEn: 'Formaldehyde', abbr: 'HCHO', smiles: 'C=O', category: 'other', tags: ['缩聚', '酚醛树脂', '脲醛树脂'], hazard: '致癌、刺激性' },
  { id: 'urea', name: '尿素', nameEn: 'Urea', abbr: 'CO(NH2)2', smiles: 'NC(N)=O', category: 'other', tags: ['缩聚'], hazard: '低' },
  { id: 'ammonium-sulfate-sat', name: '饱和硫酸铵溶液', nameEn: 'Saturated ammonium sulfate', abbr: '(NH4)2SO4(sat.)', category: 'other', tags: ['盐析'], hazard: '刺激性' },
  { id: 'glycerol', name: '甘油', nameEn: 'Glycerol', abbr: 'glycerol', smiles: 'OCC(O)CO', category: 'other', tags: ['油脂水解产物'], hazard: '低' },
  { id: 'glucose', name: '葡萄糖', nameEn: 'Glucose', abbr: 'Glc', smiles: 'OCC1OC(O)C(O)C(O)C1O', category: 'other', tags: ['还原糖', '单糖'], hazard: '低' },
  { id: 'fructose', name: '果糖', nameEn: 'Fructose', abbr: 'Fru', smiles: 'OCC1(O)OC(CO)C(O)C1O', category: 'other', tags: ['单糖'], hazard: '低' },
  { id: 'sucrose', name: '蔗糖', nameEn: 'Sucrose', abbr: 'Suc', category: 'other', tags: ['二糖', '非还原糖'], hazard: '低' },
  { id: 'starch', name: '淀粉', nameEn: 'Starch', abbr: 'starch', category: 'other', tags: ['多糖', '遇碘变蓝'], hazard: '低' },
  { id: 'cellulose', name: '纤维素', nameEn: 'Cellulose', abbr: 'cellulose', category: 'other', tags: ['多糖'], hazard: '低' },

  /* ---------- 溶剂 ---------- */
  { id: 'etoh', name: '乙醇', nameEn: 'Ethanol', abbr: 'EtOH', smiles: 'CCO', category: 'solvent', tags: ['溶剂', '醇'], hazard: '易燃' },
  { id: 'meoh', name: '甲醇', nameEn: 'Methanol', abbr: 'MeOH', smiles: 'CO', category: 'solvent', tags: ['溶剂'], hazard: '易燃、剧毒' },
  { id: 'dcm', name: '二氯甲烷', nameEn: 'Dichloromethane', abbr: 'DCM', smiles: 'ClCCl', category: 'solvent', tags: ['溶剂'], hazard: '刺激性' },
  { id: 'thf', name: '四氢呋喃', nameEn: 'Tetrahydrofuran', abbr: 'THF', smiles: 'C1CCOC1', category: 'solvent', tags: ['溶剂'], hazard: '易燃、易生成过氧化物' },
  { id: 'et2o', name: '乙醚', nameEn: 'Diethyl ether', abbr: 'Et2O', smiles: 'CCOCC', category: 'solvent', tags: ['溶剂'], hazard: '极易燃' },
  { id: 'dmf', name: 'N,N-二甲基甲酰胺', nameEn: 'N,N-Dimethylformamide', abbr: 'DMF', smiles: 'CN(C)C=O', category: 'solvent', tags: ['溶剂'], hazard: '生殖毒性' },
  { id: 'dmso', name: '二甲基亚砜', nameEn: 'Dimethyl sulfoxide', abbr: 'DMSO', smiles: 'CS(C)=O', category: 'solvent', tags: ['溶剂', '氧化'], hazard: '低毒、促渗透' },
  { id: 'acetone', name: '丙酮', nameEn: 'Acetone', abbr: 'acetone', smiles: 'CC(C)=O', category: 'solvent', tags: ['溶剂'], hazard: '易燃' },
  { id: 'toluene', name: '甲苯', nameEn: 'Toluene', abbr: 'PhMe', smiles: 'Cc1ccccc1', category: 'solvent', tags: ['溶剂'], hazard: '易燃、神经毒性' },
  { id: 'water-solvent', name: '水（溶剂）', nameEn: 'Water (solvent)', abbr: 'H2O', smiles: 'O', category: 'solvent', tags: ['溶剂'], hazard: '—' },
]

/** 按 id 建索引 */
export const REAGENT_BY_ID: Map<string, ReagentEntry> = new Map(REAGENTS.map((r) => [r.id, r]))

export function findReagent(id: string): ReagentEntry | undefined {
  return REAGENT_BY_ID.get(id)
}

/** 本地模糊检索：名称 / 英文名 / 缩写 / 标签 */
export function searchReagents(query: string, category?: ReagentCategory): ReagentEntry[] {
  const q = query.trim().toLowerCase()
  return REAGENTS.filter((r) => {
    if (category && r.category !== category) return false
    if (!q) return true
    return (
      r.name.toLowerCase().includes(q) ||
      r.nameEn.toLowerCase().includes(q) ||
      (r.abbr ?? '').toLowerCase().includes(q) ||
      r.tags.some((t) => t.toLowerCase().includes(q))
    )
  })
}

export const REAGENT_CATEGORY_LABEL: Record<ReagentCategory, string> = {
  acid: '酸',
  base: '碱',
  oxidant: '氧化剂',
  reductant: '还原剂',
  catalyst: '催化剂',
  ligand: '配体',
  solvent: '溶剂',
  dehydrant: '脱水剂',
  protective: '保护基',
  other: '其他',
}
