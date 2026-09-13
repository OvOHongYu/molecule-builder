// 将 RDKit wasm（JS 胶水 + wasm 核心）复制到 public/rdkit，dev 与 build 均可用
import { mkdirSync, copyFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'node_modules', '@rdkit', 'rdkit', 'dist')
const dest = join(root, 'public', 'rdkit')

mkdirSync(dest, { recursive: true })
for (const f of ['RDKit_minimal.js', 'RDKit_minimal.wasm']) {
  const from = join(src, f)
  if (existsSync(from)) {
    copyFileSync(from, join(dest, f))
    console.log(`copied ${f}`)
  } else {
    console.warn(`missing ${from}`)
  }
}