/**
 * 规则集：醇/酚/醛/羧酸补充 + 生物分子 + 聚合物（设计方案 §8.6–8.12）
 * 含 B 类（定性结论）与 C 类（聚合提示）规则。
 *
 * 注：设计方案中 R-ALC-03（醇的酯化）与 R-ACD-03（羧酸的酯化）是同一条反应的两种入口，
 * 已合并为 R-EST-FORM（见 functional.ts），故此处不再重复定义。
 */
import type { ReactionRule } from '../../types/rule'

export const BIO_RULES: ReactionRule[] = [
  /* ---------------- 醇 / 酚 补充 ---------------- */
  {
    id: 'R-ALC-02',
    name: '醇分子间脱水成醚',
    category: 'condensation',
    kind: 'transform',
    patterns: [{ id: 'al', smarts: '[CX4][OX2H1]', labels: { 0: 'C', 1: 'O' }, copies: 2 }],
    agents: { required: ['h2so4-conc'] },
    tempRange: [100, 160],
    transforms: [
      // 两分子醇各脱羟基/氢：断第一分子的 C-O（O 以 H₂O 离去），其碳接到第二分子的氧上
      { op: 'removeBond', bond: { a: { p: 'al', label: 'C', copy: 0 }, b: { p: 'al', label: 'O', copy: 0 } } },
      { op: 'addBond', bond: { a: { p: 'al', label: 'C', copy: 0 }, b: { p: 'al', label: 'O', copy: 1 } }, order: 1 },
    ],
    priority: 60,
    note: '浓 H₂SO₄，140 ℃：2 R-OH → R-O-R + H₂O',
  },
  {
    id: 'R-ALC-04',
    name: '醇分子内脱水（消去）',
    category: 'elimination',
    kind: 'transform',
    patterns: [{ id: 'al', smarts: '[CX4][CX4][OX2H1]', labels: { 0: 'Cb', 1: 'Ca', 2: 'O' } }],
    agents: { required: ['h2so4-conc'] },
    tempRange: [160, 200],
    transforms: [
      // 断 C-O（羟基以 H₂O 离去），α/β 碳间生成双键
      { op: 'removeBond', bond: { a: { p: 'al', label: 'Ca' }, b: { p: 'al', label: 'O' } } },
      { op: 'addBond', bond: { a: { p: 'al', label: 'Ca' }, b: { p: 'al', label: 'Cb' } }, order: 2 },
    ],
    priority: 65,
    note: '浓 H₂SO₄，170 ℃：R-CH₂CH₂OH → 烯烃 + H₂O',
  },
  {
    id: 'R-PHE-02',
    name: '苯酚与碳酸钠',
    category: 'substitution',
    kind: 'transform',
    patterns: [{ id: 'ph', smarts: 'c1ccccc1[OX2H1]', labels: { 5: 'C1', 6: 'O' } }],
    agents: { required: ['na2co3'] },
    transforms: [
      // 酚羟基去质子化（键保持不变）
      { op: 'setCharge', atom: { p: 'ph', label: 'O' }, charge: -1 },
    ],
    priority: 40,
    note: 'Na₂CO₃：苯酚 → 苯酚钠 + NaHCO₃（酸性介于 H₂CO₃ 与 HCO₃⁻ 之间）',
  },
  {
    id: 'R-PHE-05',
    name: '苯酚氧化',
    category: 'property',
    kind: 'qualitative',
    patterns: [{ id: 'ph', smarts: 'c1ccccc1[OX2H1]', labels: { 5: 'C1', 6: 'O' } }],
    agents: { anyOf: [['kmno4-acidic']] },
    conclusion: { text: '易被空气或酸性 KMnO₄ 氧化', phenomenon: '苯酚露置空气中呈粉红色', combustion: false },
    priority: 25,
    note: '氧化产物随条件变化且常为混合物，不作结构承诺',
  },
  {
    id: 'R-PHE-06',
    name: '苯酚与甲醛缩聚',
    category: 'polymerization',
    kind: 'polymer',
    patterns: [{ id: 'ph', smarts: 'c1ccccc1[OX2H1]', labels: { 5: 'C1', 6: 'O' } }],
    agents: { required: ['formaldehyde'] },
    polymer: { repeatUnitSmiles: 'Cc1cc(O)ccc1', name: '酚醛树脂', degreeNote: 'n 为聚合度；缩聚产物不参与配平' },
    priority: 30,
    note: '苯酚 + 甲醛 → 酚醛树脂（缩聚）',
  },

  /* ---------------- 醛 补充 ---------------- */
  {
    id: 'R-ALD-03',
    name: '醛与新制氢氧化铜',
    category: 'oxidation',
    kind: 'transform',
    patterns: [{ id: 'ald', smarts: '[CX3H1]=O', labels: { 0: 'Ca', 1: 'O' } }],
    agents: { required: ['cuoh2'] },
    transforms: [
      // 醛基氧化为羧酸根（负电荷在新增氧上）
      { op: 'addAtom', to: { p: 'ald', label: 'Ca' }, element: 'O', order: 1 },
      { op: 'setCharge', atom: { p: 'ald', label: 'new0' }, charge: -1 },
    ],
    priority: 50,
    note: '新制 Cu(OH)₂ 加热：砖红色 Cu₂O 沉淀；此处只呈现有机产物羧酸盐',
  },
  {
    id: 'R-ALD-05',
    name: '甲醛与尿素缩聚',
    category: 'polymerization',
    kind: 'polymer',
    patterns: [{ id: 'ald', smarts: '[CX3H1]=O', labels: { 0: 'Ca', 1: 'O' } }],
    agents: { required: ['formaldehyde', 'urea'] },
    polymer: { name: '脲醛树脂', degreeNote: 'n 为聚合度；交联聚合物不参与配平' },
    priority: 25,
    note: '甲醛 + 尿素 → 脲醛树脂（缩聚）',
  },
  {
    id: 'R-KET-02',
    name: '酮完全燃烧',
    category: 'property',
    kind: 'qualitative',
    patterns: [{ id: 'ket', smarts: '[CX3](=[OX1])[#6]', labels: { 0: 'Ca', 1: 'O' } }],
    agents: { required: ['o2'] },
    conclusion: { text: '完全燃烧生成 CO₂ 和 H₂O', phenomenon: '放热', combustion: true },
    priority: 20,
  },

  /* ---------------- 羧酸 补充 ---------------- */
  {
    id: 'R-ACD-01',
    name: '羧酸与碱成盐',
    category: 'property',
    kind: 'qualitative',
    patterns: [{ id: 'ac', smarts: '[CX3](=O)[OX2H1]', labels: { 0: 'C', 1: 'O' } }],
    agents: { anyOf: [['naoh-aq'], ['na2co3']] },
    conclusion: { text: '与 NaOH、Na₂CO₃ 反应生成羧酸盐', phenomenon: '体现酸性（强于碳酸）', combustion: false },
    priority: 25,
    note: '产物为盐，具体形态取决于所用碱，不作结构承诺',
  },
  {
    id: 'R-ACD-04',
    name: '二元酸与二元醇缩聚（聚酯）',
    category: 'polymerization',
    kind: 'polymer',
    patterns: [
      { id: 'ac', smarts: '[CX3](=O)[OX2H1]', labels: { 0: 'C', 1: 'O' } },
      { id: 'al', smarts: '[CX4][OX2H1]', labels: { 0: 'C', 1: 'O' } },
    ],
    agents: { required: ['h2so4-conc'] },
    polymer: { name: '聚酯', degreeNote: 'n 为聚合度；需双官能团单体，不参与配平' },
    priority: 30,
    note: '二元酸 + 二元醇 → 聚酯 + H₂O',
  },
  {
    id: 'R-ACD-05',
    name: '二元酸与二胺缩聚（聚酰胺）',
    category: 'polymerization',
    kind: 'polymer',
    patterns: [
      { id: 'ac', smarts: '[CX3](=O)[OX2H1]', labels: { 0: 'C', 1: 'O' } },
      { id: 'am', smarts: '[NX3;H2][CX4]', labels: { 0: 'N' } },
    ],
    polymer: { name: '聚酰胺', degreeNote: 'n 为聚合度；需双官能团单体，不参与配平' },
    priority: 30,
    note: '二元酸 + 二胺 → 聚酰胺 + H₂O',
  },

  /* ---------------- 油脂 补充 ---------------- */
  {
    id: 'R-FAT-02',
    name: '油脂酸性水解',
    category: 'hydrolysis',
    kind: 'transform',
    patterns: [{ id: 'es', smarts: '[CX3](=O)[OX2][CX4]', labels: { 0: 'C', 2: 'O1', 3: 'C2' } }],
    agents: { required: ['h2so4-dilute'] },
    transforms: [
      { op: 'removeBond', bond: { a: { p: 'es', label: 'C' }, b: { p: 'es', label: 'O1' } } },
      { op: 'addAtom', to: { p: 'es', label: 'C' }, element: 'O', order: 1 },
    ],
    priority: 40,
    note: '稀 H₂SO₄ 加热：油脂 → 甘油 + 高级脂肪酸（逐个酯键断裂）',
  },
  {
    id: 'R-FAT-03',
    name: '油脂碱性水解（皂化）',
    category: 'hydrolysis',
    kind: 'transform',
    patterns: [{ id: 'es', smarts: '[CX3](=O)[OX2][CX4]', labels: { 0: 'C', 2: 'O1', 3: 'C2' } }],
    agents: { required: ['naoh-aq'] },
    transforms: [
      { op: 'removeBond', bond: { a: { p: 'es', label: 'C' }, b: { p: 'es', label: 'O1' } } },
      { op: 'addAtom', to: { p: 'es', label: 'C' }, element: 'O', order: 1 },
      { op: 'setCharge', atom: { p: 'es', label: 'new0' }, charge: -1 },
    ],
    priority: 40,
    note: 'NaOH 加热：油脂 → 甘油 + 高级脂肪酸钠（皂化，完全）',
  },

  /* ---------------- 糖类 §8.11 ---------------- */
  {
    id: 'R-SAC-01',
    name: '葡萄糖的还原性',
    category: 'oxidation',
    kind: 'transform',
    patterns: [{ id: 'ald', smarts: '[CX3H1]=O', labels: { 0: 'Ca', 1: 'O' } }],
    agents: { anyOf: [['tollens'], ['cuoh2'], ['fehling']] },
    transforms: [
      { op: 'addAtom', to: { p: 'ald', label: 'Ca' }, element: 'O', order: 1 },
      { op: 'addAtom', to: { p: 'ald', label: 'O' }, element: 'H', order: 1 },
    ],
    priority: 50,
    note: '葡萄糖含游离醛基（开链式），可发生银镜反应与 Cu(OH)₂ 反应 → 葡萄糖酸',
  },
  {
    id: 'R-SAC-02',
    name: '葡萄糖完全燃烧',
    category: 'property',
    kind: 'qualitative',
    patterns: [{ id: 'ald', smarts: '[CX3H1]=O', labels: { 0: 'Ca', 1: 'O' } }],
    agents: { required: ['o2'] },
    conclusion: { text: '完全燃烧生成 CO₂ 和 H₂O', phenomenon: '放热', combustion: true },
    priority: 15,
  },
  {
    id: 'R-SAC-03',
    name: '蔗糖水解',
    category: 'hydrolysis',
    kind: 'transform',
    patterns: [{ id: 'gly', smarts: '[CX4]1[OX2][CX4][CX4][CX4][CX4]1', labels: { 0: 'C1', 1: 'O' } }],
    agents: { anyOf: [['h2so4-dilute'], ['enzyme']] },
    transforms: [{ op: 'removeBond', bond: { a: { p: 'gly', label: 'C1' }, b: { p: 'gly', label: 'O' } } }],
    priority: 35,
    note: '稀 H₂SO₄ 或酶：蔗糖 → 葡萄糖 + 果糖（产物需按单糖组分补齐）',
  },
  {
    id: 'R-SAC-04',
    name: '麦芽糖水解',
    category: 'hydrolysis',
    kind: 'transform',
    patterns: [{ id: 'gly', smarts: '[CX4]1[OX2][CX4][CX4][CX4][CX4]1', labels: { 0: 'C1', 1: 'O' } }],
    agents: { anyOf: [['h2so4-dilute'], ['enzyme']] },
    transforms: [{ op: 'removeBond', bond: { a: { p: 'gly', label: 'C1' }, b: { p: 'gly', label: 'O' } } }],
    priority: 35,
    note: '稀 H₂SO₄ 或酶：麦芽糖 → 2 分子葡萄糖',
  },
  {
    id: 'R-SAC-05',
    name: '淀粉与纤维素水解',
    category: 'hydrolysis',
    kind: 'transform',
    patterns: [{ id: 'gly', smarts: '[CX4][OX2][CX4]', labels: { 0: 'C1', 1: 'O', 2: 'C2' } }],
    agents: { anyOf: [['h2so4-dilute'], ['enzyme']] },
    transforms: [{ op: 'removeBond', bond: { a: { p: 'gly', label: 'C1' }, b: { p: 'gly', label: 'O' } } }],
    priority: 30,
    note: '酸或酶，加热：淀粉 / 纤维素 → 葡萄糖。因聚合度不定，最终产物以葡萄糖计',
  },
  {
    id: 'R-SAC-06',
    name: '淀粉遇碘显色',
    category: 'property',
    kind: 'qualitative',
    patterns: [{ id: 'gly', smarts: '[CX4][OX2][CX4]', labels: { 0: 'C1', 1: 'O', 2: 'C2' } }],
    agents: { required: ['i2'] },
    conclusion: { text: '遇 I₂ 变蓝', phenomenon: '溶液显蓝色（鉴别淀粉）', combustion: false },
    priority: 25,
  },

  /* ---------------- 氨基酸 §8.12 ---------------- */
  {
    id: 'R-AMI-01',
    name: '氨基酸的两性',
    category: 'property',
    kind: 'qualitative',
    patterns: [{ id: 'aa', smarts: '[NX3][CX4][CX3](=O)[OX2H1]', labels: { 0: 'N', 1: 'Ca', 2: 'C', 3: 'O' } }],
    agents: { anyOf: [['naoh-aq'], ['hcl-conc']] },
    conclusion: { text: '既可与酸反应也可与碱反应（两性）', phenomenon: '分子内同时含 -NH₂ 与 -COOH', combustion: false },
    priority: 30,
    note: '两性离子形态取决于 pH，不作结构承诺',
  },
  {
    id: 'R-AMI-02',
    name: '氨基酸成肽',
    category: 'condensation',
    kind: 'transform',
    patterns: [
      // 0=N 1=Cα 2=羧基碳 3==O（羰基）4=-OH（下标 4 才是离去羟基）
      { id: 'a1', smarts: '[NX3;H2][CX4][CX3](=O)[OX2H1]', labels: { 0: 'N', 1: 'Ca', 2: 'C', 4: 'O' } },
      { id: 'a2', smarts: '[NX3;H2][CX4][CX3](=O)[OX2H1]', labels: { 0: 'N', 1: 'Ca', 2: 'C', 4: 'O' } },
    ],
    transforms: [
      // 一分子氨基酸的 -COOH 与另一分子的 -NH₂ 脱水成肽键（O 以 H₂O 离去）
      { op: 'removeBond', bond: { a: { p: 'a1', label: 'C' }, b: { p: 'a1', label: 'O' } } },
      { op: 'addBond', bond: { a: { p: 'a1', label: 'C' }, b: { p: 'a2', label: 'N' } }, order: 1 },
    ],
    priority: 40,
    note: '-COOH 与 -NH₂ 脱水成肽键（-CO-NH-）→ 二肽 + H₂O',
  },
  {
    id: 'R-AMI-03',
    name: '氨基酸缩聚',
    category: 'polymerization',
    kind: 'polymer',
    patterns: [{ id: 'aa', smarts: '[NX3][CX4][CX3](=O)[OX2H1]', labels: { 0: 'N' } }],
    polymer: { name: '聚酰胺（蛋白质）', degreeNote: 'n 为聚合度；缩聚不参与配平' },
    priority: 25,
    note: '多分子氨基酸脱水缩聚 → 聚酰胺（蛋白质）',
  },

  /* ---------------- 蛋白质 §8.12 ---------------- */
  {
    id: 'R-PRO-01',
    name: '蛋白质水解',
    category: 'hydrolysis',
    kind: 'transform',
    patterns: [{ id: 'pep', smarts: '[CX3](=O)[NX3]', labels: { 0: 'C', 1: 'N' } }],
    agents: { anyOf: [['h2so4-dilute'], ['naoh-aq'], ['enzyme']] },
    transforms: [
      // 断肽键；酰基碳补羟基成羧酸，氮补氢成氨基
      { op: 'removeBond', bond: { a: { p: 'pep', label: 'C' }, b: { p: 'pep', label: 'N' } } },
      { op: 'addAtom', to: { p: 'pep', label: 'C' }, element: 'O', order: 1 },
    ],
    priority: 40,
    note: '酸 / 碱 / 酶，加热：肽键断裂 → 氨基酸（与 R-AMI-02 互为逆反应）',
    reversible: true,
  },
  {
    id: 'R-PRO-02',
    name: '蛋白质变性',
    category: 'property',
    kind: 'qualitative',
    patterns: [{ id: 'pep', smarts: '[CX3](=O)[NX3]', labels: { 0: 'C', 1: 'N' } }],
    conclusion: {
      text: '加热、重金属盐、乙醇、紫外线使蛋白质变性',
      phenomenon: '失去生理活性、溶解度下降（不可逆）',
      combustion: false,
    },
    priority: 20,
    note: '作用于蛋白质分子整体，不可逆',
  },
  {
    id: 'R-PRO-03',
    name: '蛋白质盐析',
    category: 'property',
    kind: 'qualitative',
    patterns: [{ id: 'pep', smarts: '[CX3](=O)[NX3]', labels: { 0: 'C', 1: 'N' } }],
    agents: { required: ['ammonium-sulfate-sat'] },
    conclusion: { text: '饱和 (NH₄)₂SO₄ 溶液使蛋白质析出', phenomenon: '析出后加水可重新溶解（可逆）', combustion: false },
    priority: 20,
    note: '作用于蛋白质分子整体，可逆',
  },
  {
    id: 'R-PRO-04',
    name: '蛋白质显色（黄蛋白反应）',
    category: 'property',
    kind: 'qualitative',
    patterns: [{ id: 'pep', smarts: '[CX3](=O)[NX3]', labels: { 0: 'C', 1: 'N' } }],
    agents: { required: ['hno3-conc'] },
    conclusion: { text: '遇浓硝酸变黄', phenomenon: '沉淀变黄色（黄蛋白反应）', combustion: false },
    priority: 20,
    note: '含苯环的蛋白质显黄色',
  },
]