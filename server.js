#!/usr/bin/env node
import express from 'express'
import formidable from 'formidable'
import sharp from 'sharp'
import fs from 'fs'

const app = express()
const PORT = process.env.API_PORT || 3000

app.post('/api/compress', (req, res) => {
  const form = formidable({ multiples: false })

  form.parse(req, async (err, fields, files) => {
    if (err) {
      res.status(500).json({ error: 'File upload error' })
      return
    }

    // support common field names
    const fileField = files.file || files.files || files.upload
    const file = Array.isArray(fileField) ? fileField[0] : fileField
    const quality = Math.max(1, Math.min(100, parseInt(fields.quality, 10) || 70))
    const maxWidth = parseInt(fields.maxWidth, 10) || 0
    const maxHeight = parseInt(fields.maxHeight, 10) || 0

    // log upload info for debugging
    // eslint-disable-next-line no-console
    console.log('Received compress request', { quality, maxWidth, maxHeight })

    if (!file) {
      res.status(400).json({ error: 'No file uploaded' })
      return
    }

    const inputPath = file.filepath || file.path || file.file
    const mime = file.mimetype || file.type || ''

    try {
      // Read file into a buffer and probe metadata to detect format (helps with HEIC/HEIF)
      const buffer = await fs.promises.readFile(inputPath)

      // eslint-disable-next-line no-console
      console.log('File info', { name: file.originalFilename || file.newFilename || file.filename || file.name, mime, size: buffer.length })

      let metadata
      try {
        metadata = await sharp(buffer).metadata()
      } catch (metaErr) {
        // eslint-disable-next-line no-console
        console.error('Metadata error', metaErr)
        return res.status(415).json({ error: 'Unsupported image format or corrupted image', details: String(metaErr) })
      }

      // If metadata indicates heic and sharp/libvips on this machine lacks heif support,
      // metadata call will fail above. If it succeeds, continue.
      // eslint-disable-next-line no-console
      console.log('Detected metadata', metadata)

      let pipeline = sharp(buffer).rotate()

      if (maxWidth > 0 || maxHeight > 0) {
        pipeline = pipeline.resize({ width: maxWidth || null, height: maxHeight || null, fit: 'inside' })
      }

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
      // Provide file info in the error to help debugging
      return res.status(500).json({ error: 'Compression failed', details: String(error), file: { mime, path: inputPath } })
    }
  })
})

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`API server listening on http://localhost:${PORT}`)
})
#!/usr/bin/env node
import express from 'express'
import formidable from 'formidable'
import sharp from 'sharp'
import fs from 'fs'

const app = express()
const PORT = process.env.API_PORT || 3000

app.post('/api/compress', (req, res) => {
  const form = formidable({ multiples: false })

  form.parse(req, async (err, fields, files) => {
    if (err) {
      res.status(500).json({ error: 'File upload error' })
      return
    }

    // support common field names
    const fileField = files.file || files.files || files.upload
    const file = Array.isArray(fileField) ? fileField[0] : fileField
    const quality = Math.max(1, Math.min(100, parseInt(fields.quality, 10) || 70))
    const maxWidth = parseInt(fields.maxWidth, 10) || 0
    const maxHeight = parseInt(fields.maxHeight, 10) || 0

    // log upload info for debugging
    // eslint-disable-next-line no-console
    console.log('Received compress request', { quality, maxWidth, maxHeight })

    if (!file) {
      res.status(400).json({ error: 'No file uploaded' })
      return
    }

    const inputPath = file.filepath || file.path || file.file
    const mime = file.mimetype || file.type || ''

    try {
      // Read file into a buffer and probe metadata to detect format (helps with HEIC/HEIF)
      const buffer = await fs.promises.readFile(inputPath)

      // eslint-disable-next-line no-console
      console.log('File info', { name: file.originalFilename || file.newFilename || file.filename || file.name, mime, size: buffer.length })

      let metadata
      try {
        metadata = await sharp(buffer).metadata()
      } catch (metaErr) {
        // eslint-disable-next-line no-console
        console.error('Metadata error', metaErr)
        return res.status(415).json({ error: 'Unsupported image format or corrupted image', details: String(metaErr) })
      }

      // If metadata indicates heic and sharp/libvips on this machine lacks heif support,
      // metadata call will fail above. If it succeeds, continue.
      // eslint-disable-next-line no-console
      console.log('Detected metadata', metadata)

      let pipeline = sharp(buffer).rotate()

      if (maxWidth > 0 || maxHeight > 0) {
        pipeline = pipeline.resize({ width: maxWidth || null, height: maxHeight || null, fit: 'inside' })
      }

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
      // Provide file info in the error to help debugging
      return res.status(500).json({ error: 'Compression failed', details: String(error), file: { mime, path: inputPath } })
    }
  })
})

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`API server listening on http://localhost:${PORT}`)
})
#!/usr/bin/env node
import express from 'express'
import formidable from 'formidable'
import sharp from 'sharp'
import fs from 'fs'
    try {
      // Log incoming file info for easier debugging (filename, mimetype, path)
      // eslint-disable-next-line no-console
      console.log('Upload:', { name: file.originalFilename || file.newFilename || file.filename || file.name, mime, path: inputPath, maxWidth, maxHeight, quality })

      // Read file into a buffer and probe metadata first - this helps with HEIC/HEIF and other formats
      const buffer = await fs.promises.readFile(inputPath)

      let metadata
      try {
        metadata = await sharp(buffer).metadata()
      } catch (metaErr) {
        // If metadata reading fails, log and throw to outer catch
        // eslint-disable-next-line no-console
        console.error('Metadata error for file', inputPath, metaErr)
        throw metaErr
      }

      // prepare sharp pipeline with EXIF-aware rotation using buffer input
      let pipeline = sharp(buffer).rotate()

      // apply resize if requested (fit inside box)
      if (maxWidth > 0 || maxHeight > 0) {
        pipeline = pipeline.resize({ width: maxWidth || null, height: maxHeight || null, fit: 'inside' })
      }

      // Decide output format based on detected metadata.format (prefer webp for png/hasAlpha)
      const fmt = metadata.format || ''
      if (fmt === 'png' || metadata.hasAlpha) {
        outputBuffer = await pipeline.webp({ quality }).toBuffer()
        res.setHeader('Content-Type', 'image/webp')
      } else {
        // default to jpeg for other formats (jpg, heic, etc.)
        outputBuffer = await pipeline.jpeg({ quality }).toBuffer()
        res.setHeader('Content-Type', 'image/jpeg')
      }
  const maxHeight = parseInt(fields.maxHeight, 10) || 0

    if (!file) {
      res.status(400).json({ error: 'No file uploaded' })
      return
    }

    try {
      const inputPath = file.filepath || file.path || file.file
      const mime = file.mimetype || file.type || ''
      let outputBuffer

      // prepare sharp pipeline with EXIF-aware rotation
      let pipeline = sharp(inputPath).rotate()

      // apply resize if requested (fit inside box)
      if (maxWidth > 0 || maxHeight > 0) {
        // use 0 to mean unlimited; fit inside ensures both dimensions <= provided
        pipeline = pipeline.resize({ width: maxWidth || null, height: maxHeight || null, fit: 'inside' })
      }

      if (mime.includes('png')) {
        outputBuffer = await pipeline.webp({ quality }).toBuffer()
        res.setHeader('Content-Type', 'image/webp')
      } else {
        outputBuffer = await pipeline.jpeg({ quality }).toBuffer()
        res.setHeader('Content-Type', 'image/jpeg')
      }

      res.status(200).send(outputBuffer)
    } catch (error) {
      console.error('Compression error', error)
      res.status(500).json({ error: 'Compression failed' })
    }
  })
})

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`API server listening on http://localhost:${PORT}`)
})
