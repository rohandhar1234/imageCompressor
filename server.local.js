#!/usr/bin/env node
import express from 'express'
import formidable from 'formidable'
import sharp from 'sharp'
import fs from 'fs'
import { exec } from 'child_process'
import { fileTypeFromBuffer } from 'file-type'

const app = express()
const PORT = process.env.API_PORT || 3000

app.post('/api/compress', (req, res) => {
  const form = formidable({ multiples: false })

  form.parse(req, async (err, fields, files) => {
    if (err) {
      res.status(500).json({ error: 'File upload error' })
      return
    }

    const fileField = files.file || files.files || files.upload
    const file = Array.isArray(fileField) ? fileField[0] : fileField
    const quality = Math.max(1, Math.min(100, parseInt(fields.quality, 10) || 70))
    const maxWidth = parseInt(fields.maxWidth, 10) || 0
    const maxHeight = parseInt(fields.maxHeight, 10) || 0

    // eslint-disable-next-line no-console
    console.log('Received compress request', { quality, maxWidth, maxHeight })

    if (!file) {
      res.status(400).json({ error: 'No file uploaded' })
      return
    }

  const inputPath = file.filepath || file.path || file.file
  const mime = file.mimetype || file.type || ''

    try {
      const buffer = await fs.promises.readFile(inputPath)
      // eslint-disable-next-line no-console
      console.log('File info', { name: file.originalFilename || file.newFilename || file.filename || file.name, mime, size: buffer.length, path: inputPath })

      // log first bytes for quick header inspection
      // eslint-disable-next-line no-console
      console.log('Header (hex):', buffer.slice(0, 16).toString('hex'))

      let metadata
      try {
        metadata = await sharp(buffer).metadata()
      } catch (metaErr) {
        // eslint-disable-next-line no-console
        console.error('Metadata error', metaErr)

        // Try to detect file type from buffer as a fallback diagnostic
        let detected = null
        try {
          detected = await fileTypeFromBuffer(buffer)
        } catch (ftErr) {
          // eslint-disable-next-line no-console
          console.error('file-type detection failed', ftErr)
        }

        // eslint-disable-next-line no-console
        console.log('file-type result:', detected)

        // If file-type thinks it's a JPEG or PNG, try a disk-based sharp pipeline as a fallback.
        if (detected && (detected.ext === 'jpg' || detected.ext === 'jpeg' || detected.ext === 'png')) {
          try {
            // eslint-disable-next-line no-console
            console.log('Attempting disk-based fallback using sharp(inputPath)')
            let fbPipeline = sharp(inputPath).rotate()
            if (maxWidth > 0 || maxHeight > 0) fbPipeline = fbPipeline.resize({ width: maxWidth || null, height: maxHeight || null, fit: 'inside' })
            let fbOut
            if (detected.ext === 'png') {
              fbOut = await fbPipeline.webp({ quality }).toBuffer()
              res.setHeader('Content-Type', 'image/webp')
            } else {
              fbOut = await fbPipeline.jpeg({ quality, progressive: true }).toBuffer()
              res.setHeader('Content-Type', 'image/jpeg')
            }
            // eslint-disable-next-line no-console
            console.log('Disk fallback succeeded')
            return res.status(200).send(fbOut)
          } catch (fbErr) {
            // eslint-disable-next-line no-console
            console.error('Disk fallback failed', fbErr)
            // Persist buffer to disk for debugging
            try {
              const debugDir = './debug-uploads'
              await fs.promises.mkdir(debugDir, { recursive: true })
              const ts = Date.now()
              const safeName = (file.originalFilename || 'upload').replace(/[^a-zA-Z0-9_.-]/g, '_')
              const dbgPath = `${debugDir}/${ts}-${safeName}.${detected.ext}`
              await fs.promises.writeFile(dbgPath, buffer)
              // Try to run `file` on the saved file to get system-level detection (if available)
              let fileCmdOut = null
              try {
                fileCmdOut = await new Promise((resolve) => {
                  exec(`file -b ${dbgPath}`, (err, stdout, stderr) => {
                    if (err) return resolve({ err: String(err), stderr: stderr && stderr.toString() })
                    return resolve({ out: stdout && stdout.toString() })
                  })
                })
              } catch (fcErr) {
                // ignore
              }

              // As a local fallback on macOS, try converting the saved file to PNG using `sips` and re-run sharp on that PNG.
              // This helps when libvips/sharp can't parse certain JPEGs that system image APIs can handle.
              try {
                const converted = `${debugDir}/${ts}-${safeName}.converted.png`
                // eslint-disable-next-line no-console
                console.log('Attempting sips conversion to', converted)
                const sipsOut = await new Promise((resolve) => {
                  exec(`sips -s format png ${dbgPath} --out ${converted}`, (err, stdout, stderr) => {
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
                }
              } catch (sipsErr) {
                // eslint-disable-next-line no-console
                console.error('sips conversion failed', sipsErr)
              }

              // eslint-disable-next-line no-console
              console.log('Wrote debug file to', dbgPath, 'fileCmd:', fileCmdOut)
              // include debug path and file command output in the response for diagnosis
              return res.status(415).json({ error: 'Unsupported image format or corrupted image', details: String(fbErr), debug: { path: dbgPath, fileCmd: fileCmdOut } })
            } catch (persistErr) {
              // eslint-disable-next-line no-console
              console.error('Failed to write debug file', persistErr)
            }
          }
        }

        const details = detected ? `Detected ${detected.mime} (${detected.ext}) - ${String(metaErr)}` : String(metaErr)
        return res.status(415).json({ error: 'Unsupported image format or corrupted image', details })
      }

      let pipeline = sharp(buffer).rotate()
      if (maxWidth > 0 || maxHeight > 0) pipeline = pipeline.resize({ width: maxWidth || null, height: maxHeight || null, fit: 'inside' })

      const fmt = (metadata && metadata.format) || ''
      let outputBuffer
      if (fmt === 'png' || metadata.hasAlpha) {
        outputBuffer = await pipeline.webp({ quality }).toBuffer()
        res.setHeader('Content-Type', 'image/webp')
      } else {
        outputBuffer = await pipeline.jpeg({ quality, progressive: true }).toBuffer()
        res.setHeader('Content-Type', 'image/jpeg')
      }

      return res.status(200).send(outputBuffer)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Compression error', error)
      return res.status(500).json({ error: 'Compression failed', details: String(error), file: { mime, path: inputPath } })
    }
  })
})

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Local API server listening on http://localhost:${PORT}`)
})
