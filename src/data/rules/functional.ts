/**
 * 含氧/卤素官能团规则（反应模块设计方案 §8.5–8.10）
 * 卤代烃 2 + 醇 7 + 酚 6 + 醛酮 7 + 羧酸酯 7 + 油脂 3 = 32 条
 */
import type { ReactionRule } from '../../types/rule'

export const FUNCTIONAL_RULES: ReactionRule[] = [
  /* ---------------- 卤代烃 R-X §8.5 ---------------- */
  {
    id: 'R-HAL-01',
    name: '卤代烃水解',
    category: 'substitution',
    kind: 'transform',
    patterns: [{ id: 'rh', smarts: '[CX4][F,Cl,Br,I]', labels: { 0: 'C', 1: 'X' } }],
    agents: { required: ['naoh-aq'] },
    transforms: [
      { op: 'setElement', atom: { p: 'rh', label: 'X' }, element: 'O' },
    ],
    priority: 55,
    note: 'NaOH 水溶液，加热：R-X → R-OH',
  },
  {
    id: 'R-HAL-02',
    name: '卤代烃消去',
    category: 'elimination',
    kind: 'transform',
    patterns: [{ id: 'rh', smarts: '[CX4][CX4][F,Cl,Br,I]', labels: { 0: 'Cb', 1: 'Ca', 2: 'X' } }],
    agents: { required: ['naoh-etoh'] },
    transforms: [
      // 断 C-X 键（X 游离为 HX），同时在 α/β 碳间生成双键
      { op: 'removeBond', bond: { a: { p: 'rh', label: 'Ca' }, b: { p: 'rh', label: 'X' } } },
      { op: 'addBond', bond: { a: { p: 'rh', label: 'Ca' }, b: { p: 'rh', label: 'Cb' } }, order: 2 },
    ],
    priority: 55,
    note: 'NaOH 醇溶液，加热：R-CH₂CH₂X → 烯烃（需 β-H）',
  },

  /* ---------------- 醇 R-OH §8.6 ---------------- */
  {
    id: 'R-ALC-01',
    name: '醇与氢卤酸取代',
    category: 'substitution',
    kind: 'transform',
    patterns: [{ id: 'al', smarts: '[CX4][OX2H1]', labels: { 0: 'C', 1: 'O' } }],
    agents: { anyOf: [['hcl-conc'], ['hbr'], ['hi']] },
    elementByAgent: { byAgent: { 'hcl-conc': 'Cl', hbr: 'Br', hi: 'I' }, fallback: 'Cl' },
    transforms: [
      // 羟基氧直接被卤素取代，C-X 键保留（O 上的 H 与 X 结合为 HX）
      { op: 'setElement', atom: { p: 'al', label: 'O' }, element: '$agent' },
    ],
    priority: 45,
    note: 'HX，加热：R-OH → R-X',
  },
  {
    id: 'R-ALC-05',
    name: '伯醇催化氧化为醛',
    category: 'oxidation',
    kind: 'transform',
    patterns: [{ id: 'al', smarts: '[CX4H2][OX2H1]', labels: { 0: 'C', 1: 'O' } }],
    agents: { anyOf: [['cu'], ['ag'], ['pcc']] },
    transforms: [
      // 断 C-O 键（羟基以 H₂O 离去），α 碳接 =O → 醛
      { op: 'removeBond', bond: { a: { p: 'al', label: 'C' }, b: { p: 'al', label: 'O' } } },
      { op: 'addAtom', to: { p: 'al', label: 'C' }, element: 'O', order: 2 },
    ],
    priority: 60,
    note: 'Cu / Ag 加热或 PCC：伯醇 → 醛',
  },
  {
    id: 'R-ALC-06',
    name: '伯醇氧化为羧酸',
    category: 'oxidation',
    kind: 'transform',
    patterns: [{ id: 'al', smarts: '[CX4H2][OX2H1]', labels: { 0: 'C', 1: 'O' } }],
    agents: { anyOf: [['kmno4-acidic'], ['jones']] },
    transforms: [
      // 羟基离去，α 碳接 =O 与 -OH → 羧基
      { op: 'removeBond', bond: { a: { p: 'al', label: 'C' }, b: { p: 'al', label: 'O' } } },
      { op: 'addAtom', to: { p: 'al', label: 'C' }, element: 'O', order: 2 },
      { op: 'addAtom', to: { p: 'al', label: 'C' }, element: 'O', order: 1 },
    ],
    priority: 55,
    note: '酸性 KMnO₄：伯醇 → 羧酸',
  },
  {
    id: 'R-ALC-07',
    name: '醇完全燃烧',
    category: 'property',
    kind: 'qualitative',
    patterns: [{ id: 'al', smarts: '[CX4][OX2H1]', labels: { 0: 'C', 1: 'O' } }],
    agents: { required: ['o2'] },
    conclusion: { text: '完全燃烧生成 CO₂ 和 H₂O', phenomenon: '淡蓝色火焰', combustion: true },
    priority: 20,
  },

  /* ---------------- 酚 Ar-OH §8.7 ---------------- */
  {
    id: 'R-PHE-01',
    name: '苯酚与强碱',
    category: 'substitution',
    kind: 'transform',
    patterns: [{ id: 'ph', smarts: 'c1ccccc1[OX2H1]', labels: { 5: 'C1', 6: 'O' } }],
    agents: { required: ['naoh-aq'] },
    transforms: [
      // 酚羟基去质子化为酚氧负离子（键保持不变）
      { op: 'setCharge', atom: { p: 'ph', label: 'O' }, charge: -1 },
    ],
    priority: 45,
    note: 'NaOH：苯酚 → 苯酚钠 + H₂O（弱酸性）',
  },
  {
    id: 'R-PHE-04',
    name: '苯酚遇三氯化铁显色',
    category: 'property',
    kind: 'qualitative',
    patterns: [{ id: 'ph', smarts: 'c1ccccc1[OX2H1]', labels: { 5: 'C1', 6: 'O' } }],
    agents: { required: ['fecl3'] },
    conclusion: { text: '遇 FeCl₃ 溶液显紫色', phenomenon: '溶液变紫色', combustion: false },
    priority: 30,
    note: '鉴别酚类',
  },
  {
    id: 'R-PHE-03',
    name: '苯酚取代（浓溴水）',
    category: 'substitution',
    kind: 'transform',
    patterns: [{ id: 'ph', smarts: 'c1ccccc1[OX2H1]', labels: { 5: 'C1', 4: 'C2', 2: 'C4', 0: 'C6', 6: 'O' } }],
    agents: { required: ['br2-water'] },
    transforms: [
      // 2,4,6 位相对羟基所在碳（C1）为 C2 / C4 / C6
      { op: 'addAtom', to: { p: 'ph', label: 'C2' }, element: 'Br', order: 1 },
      { op: 'addAtom', to: { p: 'ph', label: 'C4' }, element: 'Br', order: 1 },
      { op: 'addAtom', to: { p: 'ph', label: 'C6' }, element: 'Br', order: 1 },
    ],
    priority: 40,
    note: '浓溴水：苯酚 → 2,4,6-三溴苯酚（白色沉淀）',
  },

  /* ---------------- 醛 / 酮 §8.8 ---------------- */
  {
    id: 'R-ALD-01',
    name: '醛还原为伯醇',
    category: 'reduction',
    kind: 'transform',
    patterns: [{ id: 'ald', smarts: '[CX3H1]=O', labels: { 0: 'Ca', 1: 'O' } }],
    agents: { anyOf: [['h2'], ['nabh4'], ['lialh4']] },
    transforms: [
      { op: 'setBondOrder', bond: { a: { p: 'ald', label: 'Ca' }, b: { p: 'ald', label: 'O' } }, order: 1 },
      { op: 'addAtom', to: { p: 'ald', label: 'O' }, element: 'H', order: 1 },
    ],
    priority: 60,
    note: 'H₂/Ni 或 NaBH₄：R-CHO → R-CH₂OH',
  },
  {
    id: 'R-ALD-02',
    name: '银镜反应',
    category: 'oxidation',
    kind: 'transform',
    patterns: [{ id: 'ald', smarts: '[CX3H1]=O', labels: { 0: 'Ca', 1: 'O' } }],
    agents: { required: ['tollens'] },
    transforms: [
      // 醛基氧化为羧酸根：Ca 接 -O⁻（负电荷在新增氧上）
      { op: 'addAtom', to: { p: 'ald', label: 'Ca' }, element: 'O', order: 1 },
      { op: 'setCharge', atom: { p: 'ald', label: 'new0' }, charge: -1 },
    ],
    priority: 50,
    note: '银氨溶液水浴加热：析出银镜（Ag↓）；此处只呈现有机产物羧酸盐',
  },
  {
    id: 'R-ALD-04',
    name: '醛氧化为羧酸',
    category: 'oxidation',
    kind: 'transform',
    patterns: [{ id: 'ald', smarts: '[CX3H1]=O', labels: { 0: 'Ca', 1: 'O' } }],
    agents: { anyOf: [['o2'], ['kmno4-acidic']] },
    transforms: [
      { op: 'addAtom', to: { p: 'ald', label: 'Ca' }, element: 'O', order: 1 },
      { op: 'addAtom', to: { p: 'ald', label: 'O' }, element: 'H', order: 1 },
    ],
    priority: 55,
    note: '催化氧化：R-CHO → R-COOH',
  },
  {
    id: 'R-KET-01',
    name: '酮还原为仲醇',
    category: 'reduction',
    kind: 'transform',
    patterns: [{ id: 'ket', smarts: '[CX3](=[OX1])[#6]', labels: { 0: 'Ca', 1: 'O' } }],
    agents: { anyOf: [['h2'], ['nabh4'], ['lialh4']] },
    transforms: [
      { op: 'setBondOrder', bond: { a: { p: 'ket', label: 'Ca' }, b: { p: 'ket', label: 'O' } }, order: 1 },
      { op: 'addAtom', to: { p: 'ket', label: 'O' }, element: 'H', order: 1 },
    ],
    priority: 55,
    note: 'H₂/Ni 或 NaBH₄：酮 → 仲醇',
  },

  /* ---------------- 羧酸 / 酯 §8.9 ---------------- */
  {
    id: 'R-ACD-02',
    name: '羧酸与碳酸氢钠',
    category: 'property',
    kind: 'qualitative',
    patterns: [{ id: 'ac', smarts: '[CX3](=O)[OX2H1]', labels: { 0: 'C', 1: 'O' } }],
    agents: { required: ['nahco3'] },
    conclusion: { text: '放出无色无味 CO₂ 气体', phenomenon: '产生气泡，石灰水变浑浊', combustion: false },
    priority: 35,
    note: 'R-COOH + NaHCO₃ → R-COONa + CO₂↑；鉴别羧酸（区别于酚）',
  },
  {
    id: 'R-EST-FORM',
    name: '酯化反应',
    category: 'esterification',
    kind: 'transform',
    patterns: [
      // 0=C(羰基碳) 1==O 2=-OH（注意下标 2 才是羟基氧，不是羰基氧）
      { id: 'acid', smarts: '[CX3](=O)[OX2H1]', labels: { 0: 'C', 2: 'O' } },
      { id: 'alc', smarts: '[CX4][OX2H1]', labels: { 0: 'C', 1: 'O' } },
    ],
    agents: { required: ['h2so4-conc'] },
    transforms: [
      // 酸的羟基以 H₂O 离去，酸羰基碳与醇氧成键 → 酯
      { op: 'removeBond', bond: { a: { p: 'acid', label: 'C' }, b: { p: 'acid', label: 'O' } } },
      { op: 'addBond', bond: { a: { p: 'acid', label: 'C' }, b: { p: 'alc', label: 'O' } }, order: 1 },
    ],
    priority: 65,
    note: '酸 + 醇，浓 H₂SO₄ 加热 → 酯 + H₂O（可逆）',
    reversible: true,
  },
  {
    id: 'R-EST-01',
    name: '酯的酸性水解',
    category: 'hydrolysis',
    kind: 'transform',
    patterns: [
      // 0=C(酰基碳) 1==O 2=-O-(酯氧) 3=烷基碳
      { id: 'es', smarts: '[CX3](=O)[OX2][CX4]', labels: { 0: 'C', 2: 'O1', 3: 'C2' } },
    ],
    agents: { required: ['h2so4-dilute'] },
    transforms: [
      // 断酰氧键：酰基碳补羟基成羧酸，酯氧补氢成醇
      { op: 'removeBond', bond: { a: { p: 'es', label: 'C' }, b: { p: 'es', label: 'O1' } } },
      { op: 'addAtom', to: { p: 'es', label: 'C' }, element: 'O', order: 1 },
    ],
    priority: 50,
    note: '稀 H₂SO₄，加热 → 羧酸 + 醇（可逆）',
    reversible: true,
  },
  {
    id: 'R-EST-02',
    name: '酯的碱性水解（皂化）',
    category: 'hydrolysis',
    kind: 'transform',
    patterns: [{ id: 'es', smarts: '[CX3](=O)[OX2][CX4]', labels: { 0: 'C', 2: 'O1', 3: 'C2' } }],
    agents: { required: ['naoh-aq'] },
    transforms: [
      // 同上，但产物为羧酸根（碱性条件不可逆）
      { op: 'removeBond', bond: { a: { p: 'es', label: 'C' }, b: { p: 'es', label: 'O1' } } },
      { op: 'addAtom', to: { p: 'es', label: 'C' }, element: 'O', order: 1 },
      { op: 'setCharge', atom: { p: 'es', label: 'new0' }, charge: -1 },
    ],
    priority: 50,
    note: 'NaOH，加热 → 羧酸钠 + 醇（完全，皂化）',
  },

  /* ---------------- 油脂 §8.10 ---------------- */
  {
    id: 'R-FAT-01',
    name: '油脂氢化',
    category: 'reduction',
    kind: 'transform',
    patterns: [{ id: 'en', smarts: '[CX3]=[CX3]', labels: { 0: 'C1', 1: 'C2' } }],
    agents: { required: ['h2', 'ni'] },
    transforms: [{ op: 'setBondOrder', bond: { a: { p: 'en', label: 'C1' }, b: { p: 'en', label: 'C2' } }, order: 1 }],
    priority: 45,
    note: 'H₂/Ni 加热：不饱和油脂 → 饱和（氢化，硬度增加）',
  },
]