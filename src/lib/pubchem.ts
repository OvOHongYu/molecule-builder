/**
 * PubChem PUG REST 命名 fallback（设计文档 §9.1）：IUPAC 名在线查询，5s 超时。
 */
export async function fetchPubChemIupac(smiles: string): Promise<string | null> {
  const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/${encodeURIComponent(smiles)}/property/IUPACName/JSON`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 5000)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) return null
    const j = (await res.json()) as {
      PropertyTable?: { Properties?: Array<{ IUPACName?: string }> }
    }
    return j?.PropertyTable?.Properties?.[0]?.IUPACName ?? null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * CACTUS（NCI）命名 fallback：PubChem 不可用时的第二英文名来源。
 * 接口返回 text/plain 的 IUPAC 名；失败（含 "N/A"）返回 null。
 */
export async function fetchCactusIupac(smiles: string): Promise<string | null> {
  const url = `https://cactus.nci.nih.gov/chemical/structure/${encodeURIComponent(smiles)}/iupac_name`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 5000)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) return null
    const text = (await res.text()).trim()
    if (!text || /^N\/A$/i.test(text) || /error/i.test(text) || text.includes('<')) return null
    return text
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * PubChem 中文同义词 fallback：取同义词列表中最短的含 CJK 且以常见官能团后缀结尾的词条。
 * （同义词含大量俗名/商品名，用「后缀必须像化学名」过滤减少误配。）
 */
export async function fetchPubChemChinese(smiles: string): Promise<string | null> {
  const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/${encodeURIComponent(smiles)}/synonyms/JSON`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 5000)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) return null
    const j = (await res.json()) as {
      PropertyTable?: { Properties?: Array<{ Synonyms?: string[] }> }
    }
    const syns = j?.PropertyTable?.Properties?.[0]?.Synonyms
    if (!Array.isArray(syns)) return null
    const cjk = syns.filter(
      (s) =>
        typeof s === 'string' &&
        /[\u4e00-\u9fff]/.test(s) &&
        /(烷|醇|醛|酸|酮|酯|醚|胺|酰胺|腈|苯|烯|炔|酚|酐)$/.test(s.trim()),
    )
    if (!cjk.length) return null
    return cjk.sort((a, b) => a.length - b.length)[0]
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}