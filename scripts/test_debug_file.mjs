import fs from 'fs'
import path from 'path'
import sharp from 'sharp'

const dbgDir = path.resolve('./debug-uploads')
async function latestDebugFile() {
  try {
    const files = await fs.promises.readdir(dbgDir)
    const stats = await Promise.all(files.map(async f => {
      const p = path.join(dbgDir, f)
      const s = await fs.promises.stat(p)
      return { f, p, mtime: s.mtimeMs }
    }))
    stats.sort((a,b)=>b.mtime-a.mtime)
    return stats[0]?.p
  } catch (err) {
    console.error('Cannot read debug dir', err)
    process.exit(1)
  }
}

(async()=>{
  const p = await latestDebugFile()
  if (!p) return console.error('No debug file found')
  console.log('Testing debug file:', p)
  try {
    const buf = await fs.promises.readFile(p)
    console.log('Buffer length', buf.length)
    try {
      const m = await sharp(buf).metadata()
      console.log('metadata from buffer:', m)
    } catch (err) {
      console.error('sharp.metadata(buffer) failed:', err)
    }
    try {
      const m2 = await sharp(p).metadata()
      console.log('metadata from path:', m2)
    } catch (err) {
      console.error('sharp.metadata(path) failed:', err)
    }
  } catch (err) {
    console.error('Failed to read file', err)
  }
})()
