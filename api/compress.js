import formidable from 'formidable'
import fs from 'fs'
import sharp from 'sharp'
import { fileTypeFromBuffer } from 'file-type'
import { exec, execSync } from 'child_process'

// Detect whether the `sips` tool is available on startup (useful to skip sips attempts on hosts like Vercel)
let hasSips = false
try {
  execSync('which sips')
  hasSips = true
  // eslint-disable-next-line no-console
  console.log('sips: available on host')
} catch (e) {
  hasSips = false
  // eslint-disable-next-line no-console
  console.log('sips: not available on host')
}

// Vercel/Next-style config to disable automatic body parsing so formidable can parse multipart
export const config = {
  api: {
    bodyParser: false,
  },
}

function parseForm(req) {
  // Wrap formidable.parse in a Promise with a timeout so we don't hang forever
  return new Promise((resolve, reject) => {
    const form = formidable({ multiples: false })
    let finished = false
    const timer = setTimeout(() => {
      if (finished) return
      finished = true
      const err = new Error('Form parse timed out')
      // eslint-disable-next-line no-console
      console.error('parseForm: timeout')
      reject(err)
    }, 60_000)

    form.parse(req, (err, fields, files) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      if (err) return reject(err)
      resolve({ fields, files })
    })
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.setHeader('Allow', 'POST')
    res.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }

  try {
    // Log start of request handling
    // eslint-disable-next-line no-console
    console.log('api/compress: handler start', { method: req.method })
    const startedAt = Date.now()
    const { fields, files } = await parseForm(req)
    // eslint-disable-next-line no-console
    console.log('api/compress: parseForm resolved', { tookMs: Date.now() - startedAt })

    const fileField = files.file || files.files || files.upload
    const file = Array.isArray(fileField) ? fileField[0] : fileField
    const quality = Math.max(1, Math.min(100, parseInt(fields.quality, 10) || 70))
    const maxWidth = parseInt(fields.maxWidth, 10) || 0
    const maxHeight = parseInt(fields.maxHeight, 10) || 0

    if (!file) {
      res.statusCode = 400
      res.end(JSON.stringify({ error: 'No file uploaded' }))
      return
    }

    const inputPath = file.filepath || file.path || file.file

    // Read buffer so we can probe metadata (helps with HEIC/HEIF) and use a consistent pipeline
    const buffer = await fs.promises.readFile(inputPath)

    let metadata
    try {
      metadata = await sharp(buffer).metadata()
    } catch (metaErr) {
      // If metadata fails, try to detect the file type from the buffer and include that in the response
      // eslint-disable-next-line no-console
      console.error('Metadata error', metaErr)
      let detected = null
      try {
        detected = await fileTypeFromBuffer(buffer)
      } catch (ftErr) {
        // eslint-disable-next-line no-console
        console.error('file-type detection failed', ftErr)
      }
      // Try a disk-based fallback: write buffer to /tmp and try sharp(path)
      let tmpPath = null
      let pathErrorStr = null
      try {
        const tmpDir = '/tmp'
        const ts = Date.now()
        const ext = detected && detected.ext ? detected.ext : 'bin'
        const safeName = `upload-${ts}.${ext}`
        tmpPath = `${tmpDir}/${safeName}`
        await fs.promises.writeFile(tmpPath, buffer)
        // eslint-disable-next-line no-console
        console.log('Wrote buffer to', tmpPath, 'attempting sharp(path) fallback')
        try {
          const fbMeta = await sharp(tmpPath).metadata()
          // If metadata succeeds from path, process and return result
          let fbPipeline = sharp(tmpPath).rotate()
          if (maxWidth > 0 || maxHeight > 0) fbPipeline = fbPipeline.resize({ width: maxWidth || null, height: maxHeight || null, fit: 'inside' })
          let fbOut
          let fbContentType = 'image/jpeg'
          if (fbMeta.format === 'png' || fbMeta.hasAlpha) {
            fbOut = await fbPipeline.webp({ quality }).toBuffer()
            fbContentType = 'image/webp'
          } else {
            fbOut = await fbPipeline.jpeg({ quality, progressive: true }).toBuffer()
            fbContentType = 'image/jpeg'
          }
          // eslint-disable-next-line no-console
          console.log('Disk-path fallback succeeded for', tmpPath, fbMeta)
          res.statusCode = 200
          res.setHeader('Content-Type', fbContentType)
          return res.end(fbOut)
        } catch (pathErr) {
          // eslint-disable-next-line no-console
          console.error('sharp(path) fallback failed', pathErr)
          try {
            pathErrorStr = String(pathErr)
          } catch (e) {
            pathErrorStr = 'unknown path error'
          }

          // As a local-only fallback on macOS, try converting with `sips` (if available) and re-run sharp on the converted PNG.
          try {
            const converted = `${tmpPath}.converted.png`
            // eslint-disable-next-line no-console
            console.log('Attempting sips conversion to', converted)
            const sipsOut = await new Promise((resolve) => {
              exec(`sips -s format png ${tmpPath} --out ${converted}`, (err, stdout, stderr) => {
                if (err) return resolve({ err: String(err), stderr: stderr && stderr.toString() })
                return resolve({ out: stdout && stdout.toString() })
              })
            })
            // eslint-disable-next-line no-console
            console.log('sips result', sipsOut)
            try {
              const convBuf = await fs.promises.readFile(converted)
              let convMeta = await sharp(convBuf).metadata()
              // prepare pipeline from converted PNG
              let convPipeline = sharp(convBuf).rotate()
              if (maxWidth > 0 || maxHeight > 0) convPipeline = convPipeline.resize({ width: maxWidth || null, height: maxHeight || null, fit: 'inside' })
              const outBuf = await convPipeline.jpeg({ quality, progressive: true }).toBuffer()
              res.setHeader('Content-Type', 'image/jpeg')
              // eslint-disable-next-line no-console
              console.log('sips+sharp fallback succeeded', convMeta)
              return res.status(200).send(outBuf)
            } catch (convErr) {
              // eslint-disable-next-line no-console
              console.error('sips conversion succeeded but sharp processing failed', convErr)
              try { pathErrorStr = pathErrorStr + ' | sips+sharp: ' + String(convErr) } catch (e) {}
            }
          } catch (sipsErr) {
            // eslint-disable-next-line no-console
            console.error('sips conversion failed', sipsErr)
            try { pathErrorStr = pathErrorStr + ' | sips: ' + String(sipsErr) } catch (e) {}
          }
          // fall through to return 415 below with debug path and error
        }
      } catch (tmpErr) {
        // eslint-disable-next-line no-console
        console.error('Failed to write tmp debug file', tmpErr)
        try {
          pathErrorStr = String(tmpErr)
        } catch (e) {
          pathErrorStr = 'failed to write tmp and could not stringify error'
        }
      }

      const details = detected ? `Detected ${detected.mime} (${detected.ext}) - ${String(metaErr)}` : String(metaErr)
      res.statusCode = 415
      res.end(JSON.stringify({ error: 'Unsupported image format or corrupted image', details, debug: { detected, tmpPath, pathError: pathErrorStr } }))
      return
    }

    let pipeline = sharp(buffer).rotate()
    if (maxWidth > 0 || maxHeight > 0) {
      pipeline = pipeline.resize({ width: maxWidth || null, height: maxHeight || null, fit: 'inside' })
    }

    const fmt = (metadata && metadata.format) || ''
    let outputBuffer
    let contentType = 'image/jpeg'

    if (fmt === 'png' || metadata.hasAlpha) {
      outputBuffer = await pipeline.webp({ quality }).toBuffer()
      contentType = 'image/webp'
    } else {
      outputBuffer = await pipeline.jpeg({ quality, progressive: true }).toBuffer()
      contentType = 'image/jpeg'
    }

    res.statusCode = 200
    res.setHeader('Content-Type', contentType)
    res.end(outputBuffer)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Compression handler error', err)
    res.statusCode = 500
    res.end(JSON.stringify({ error: 'Compression failed', details: String(err) }))
  }
}
