import React, { useState, useRef } from 'react'

export default function ImageCompressor() {
  const [files, setFiles] = useState([]) // {file, previewUrl, compressedFile, compressedPreviewUrl, progress}
  const [qualityPercent, setQualityPercent] = useState(70)
  const [sizePreset, setSizePreset] = useState('Large')
  const sizeMap = {
    Original: 0,
    Large: 1920,
    Medium: 1280,
    Small: 800,
    Thumb: 400,
  }
  const inputRef = useRef(null)

  function handleFileChange(e) {
    const selected = Array.from(e.target.files || [])
    const mapped = selected.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      compressedFile: null,
      compressedPreviewUrl: null,
      progress: 0,
      error: null,
    }))
    setFiles((prev) => {
      const start = prev.length
      const newArr = prev.concat(mapped)
      // auto-start compression for newly added files after state updates
      setTimeout(() => {
        for (let i = 0; i < mapped.length; i++) {
          const idx = start + i
          const item = newArr[idx]
          // don't block UI; fire-and-forget compress
          // eslint-disable-next-line no-unused-vars
          ;(async () => {
            try {
              await compressOne(item, idx)
            } catch (e) {
              // swallow - compressOne handles errors into state
            }
          })()
        }
      }, 50)
      return newArr
    })
  }

  async function compressOne(item, idx) {
    await compressServer(item, idx)
  }

  async function compressServer(item, idx) {
    setFiles((prev) => {
      const copy = [...prev]
      copy[idx] = { ...copy[idx], progress: 1, error: null }
      return copy
    })

    if (!item || !item.file) {
      setFiles((prev) => {
        const copy = [...prev]
        copy[idx] = { ...copy[idx], error: 'No file to upload', progress: 0 }
        return copy
      })
      return
    }

    try {
      let fileToSend = item.file

      // Detect HEIC/HEIF by mime or extension
      const lowerName = (fileToSend.name || '').toLowerCase()
      const isHeic = (fileToSend.type && fileToSend.type.includes('heic')) || lowerName.endsWith('.heic') || lowerName.endsWith('.heif')
      if (isHeic) {
        // Try to load heic2any from CDN at runtime and convert to JPEG before upload.
        // This avoids adding a fragile npm dependency and keeps conversion optional.
        // eslint-disable-next-line no-console
        console.log('HEIC detected client-side, attempting dynamic conversion')
        try {
          await loadHeic2any()
          const ab = await fileToSend.arrayBuffer()
          const converted = await (window.heic2any ? window.heic2any({ blob: new Blob([ab]), toType: 'image/jpeg', quality: Math.max(0.01, Math.min(1, qualityPercent / 100)) }) : Promise.reject(new Error('heic2any not available')))
          const convBlob = Array.isArray(converted) ? converted[0] : converted
          const convFile = new File([convBlob], fileToSend.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })
          fileToSend = convFile
          setFiles((prev) => {
            const copy = [...prev]
            if (copy[idx]) copy[idx] = { ...copy[idx], file: convFile, previewUrl: URL.createObjectURL(convFile) }
            return copy
          })
          // eslint-disable-next-line no-console
          console.log('HEIC conversion succeeded client-side')
        } catch (convErr) {
          // Conversion failed — surface error and abort upload
          // eslint-disable-next-line no-console
          console.error('Client HEIC conversion failed', convErr)
          setFiles((prev) => {
            const copy = [...prev]
            copy[idx] = { ...copy[idx], error: 'HEIC conversion failed: ' + String(convErr), progress: 0 }
            return copy
          })
          return
        }
      }

      const form = new FormData()
      form.append('file', fileToSend)
      form.append('quality', Math.round(qualityPercent))
      const maxDim = sizeMap[sizePreset] || 0
      form.append('maxWidth', String(maxDim))
      form.append('maxHeight', String(maxDim))

      // start the request and mark upload in-flight
      // add an AbortController so we don't stay stuck forever
      const ac = new AbortController()
      const timeout = setTimeout(() => ac.abort(), 60_000)
      const resPromise = fetch('/api/compress', { method: 'POST', body: form, signal: ac.signal })
      setFiles((prev) => {
        const copy = [...prev]
        copy[idx] = { ...copy[idx], progress: 50 }
        return copy
      })
      let res
      try {
        res = await resPromise
      } catch (fetchErr) {
        clearTimeout(timeout)
        const msg = fetchErr.name === 'AbortError' ? 'Upload timed out' : String(fetchErr)
        setFiles((prev) => {
          const copy = [...prev]
          copy[idx] = { ...copy[idx], error: msg, progress: 0 }
          return copy
        })
        return
      }
      clearTimeout(timeout)
      // indicate response being read
      setFiles((prev) => {
        const copy = [...prev]
        copy[idx] = { ...copy[idx], progress: 75 }
        return copy
      })

      if (!res.ok) {
        const text = await res.text()
        setFiles((prev) => {
          const copy = [...prev]
          copy[idx] = { ...copy[idx], error: text || 'Server compression failed', progress: 0 }
          return copy
        })
        return
      }

  const blob = await res.blob()
      const ext = blob.type === 'image/webp' ? '.webp' : '.jpg'
      const compressedFile = new File([blob], item.file.name.replace(/\.[^.]+$/, ext), { type: blob.type })
      const compressedPreviewUrl = URL.createObjectURL(blob)

      setFiles((prev) => {
        const copy = [...prev]
        if (copy[idx] && copy[idx].compressedPreviewUrl) URL.revokeObjectURL(copy[idx].compressedPreviewUrl)
        copy[idx] = { ...copy[idx], compressedFile, compressedPreviewUrl, progress: 100 }
        // debug: log that we've set compressed result for this index
        // eslint-disable-next-line no-console
        console.log('compressServer: set compressed result', { idx, name: copy[idx].file?.name, compressedPreviewUrl: copy[idx].compressedPreviewUrl, progress: copy[idx].progress })
        return copy
      })
    } catch (err) {
      setFiles((prev) => {
        const copy = [...prev]
        copy[idx] = { ...copy[idx], error: String(err), progress: 0 }
        return copy
      })
    }
  }

  // Dynamically load heic2any from jsDelivr and attach to window.heic2any
  function loadHeic2any() {
    if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
    if (window.heic2any) return Promise.resolve(window.heic2any)
    // Use jsDelivr to fetch the package distribution (versionless so it resolves to latest)
    const src = 'https://cdn.jsdelivr.net/npm/heic2any/dist/heic2any.min.js'
    return new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = src
      s.async = true
      s.onload = () => {
        if (window.heic2any) return resolve(window.heic2any)
        return reject(new Error('heic2any did not initialize'))
      }
      s.onerror = (e) => reject(new Error('Failed to load heic2any script: ' + String(e)))
      document.head.appendChild(s)
    })
  }

  function updateProgress(idx, p) {
    setFiles((prev) => {
      const copy = [...prev]
      copy[idx] = { ...copy[idx], progress: Math.round(p) }
      return copy
    })
  }

  async function compressAll() {
    // debug: log files snapshot when compressAll starts
    // eslint-disable-next-line no-console
    console.log('compressAll: starting', files.map((f, i) => ({ i, name: f.file.name, progress: f.progress, compressed: !!f.compressedFile, error: f.error })))

    for (let i = 0; i < files.length; i++) {
      const item = files[i]
      // skip already compressed, errored, or in-flight files (progress > 0)
      if (item.compressedFile || item.error || (typeof item.progress === 'number' && item.progress > 0)) {
        // eslint-disable-next-line no-console
        console.log('compressAll: skipping index', i, { progress: item.progress, compressed: !!item.compressedFile, error: item.error })
        continue
      }

      // eslint-disable-next-line no-await-in-loop
      // eslint-disable-next-line no-console
      console.log('compressAll: compressing index', i, item.file.name)
      await compressOne(item, i)
    }
  }

  function removeFile(index) {
    setFiles((prev) => {
      const copy = [...prev]
      const removed = copy.splice(index, 1)[0]
      if (removed) {
        try {
          if (removed.previewUrl) URL.revokeObjectURL(removed.previewUrl)
          if (removed.compressedPreviewUrl) URL.revokeObjectURL(removed.compressedPreviewUrl)
        } catch (e) {}
      }
      return copy
    })
  }

  function downloadFile(item) {
    const fileToDownload = item.compressedFile || item.file
    const url = URL.createObjectURL(fileToDownload)
    const a = document.createElement('a')
    a.href = url
    a.download = fileToDownload.name
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  function humanFileSize(bytes) {
    if (bytes === 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / 1024 ** i).toFixed(2)} ${units[i]}`
  }

  return (
    <div className="compressor">
      <div className="controls">
        <label className="file-input">
          Select images
          <input ref={inputRef} type="file" accept="image/*" multiple onChange={handleFileChange} />
        </label>

        <div className="settings">
          <label>
            Size preset
            <select value={sizePreset} onChange={(e) => setSizePreset(e.target.value)}>
              <option value="Original">Original (no resize)</option>
              <option value="Large">Large (1920px)</option>
              <option value="Medium">Medium (1280px)</option>
              <option value="Small">Small (800px)</option>
              <option value="Thumb">Thumb (400px)</option>
            </select>
          </label>

          <label>
            Quality preset
            <select value={qualityPercent} onChange={(e) => setQualityPercent(Number(e.target.value))}>
              <option value={85}>High (85%)</option>
              <option value={70}>Medium (70%)</option>
              <option value={50}>Low (50%)</option>
            </select>
          </label>

          <div style={{ fontSize: 13, color: '#374151' }}>
            Server-side compression is enabled by default and recommended for best results.
          </div>

          <div className="actions">
            {/* <button type="button" onClick={compressAll} disabled={files.length === 0 || files.some(f => typeof f.progress === 'number' && f.progress > 0)}>
              Compress all
            </button> */}
            <button
              type="button"
              onClick={() => {
                // revoke any object URLs before clearing
                setFiles((prev) => {
                  prev.forEach((it) => {    
                    try {
                      if (it.previewUrl) URL.revokeObjectURL(it.previewUrl)
                      if (it.compressedPreviewUrl) URL.revokeObjectURL(it.compressedPreviewUrl)
                    } catch (e) {}
                  })
                  return []
                })
                if (inputRef.current) inputRef.current.value = null
              }}
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      <div className="list">

        {files.map((item, idx) => {
          const displayProgress = (typeof item.progress === 'number' && item.progress > 0)
            ? Math.round(item.progress)
            : (item.compressedFile || item.compressedPreviewUrl) ? 100 : 0

          return (
            <div className="item" key={`${item.file.name}-${idx}`}>
              <img src={item.previewUrl} alt={item.file.name} />
              {item.compressedPreviewUrl && (
                <div style={{ marginLeft: 8 }}>
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Compressed preview</div>
                  <img src={item.compressedPreviewUrl} alt={`compressed-${item.file.name}`} style={{ width: 120, height: 80, objectFit: 'cover', borderRadius: 6 }} />
                </div>
              )}

              <div className="meta">
                <div className="row">
                  <strong>
                    {item.file.name}
                    {(displayProgress > 0 && displayProgress < 100) && <span className="spinner" title="Uploading..." />}
                  </strong>
                  <span>{humanFileSize(item.file.size)}</span>
                </div>

                <div className="row progress-row">
                  <div className="progress" style={{ width: `${displayProgress}%` }} />
                  <span>{displayProgress}%</span>
                </div>

                <div className="row">
                  <button onClick={() => compressOne(item, idx)} disabled={item.progress > 0 && item.progress < 100}>
                    Compress
                  </button>

                  <button onClick={() => downloadFile(item)}>Download</button>

                  <button onClick={() => removeFile(idx)}>Remove</button>
                </div>

                {item.compressedFile && (
                  <div className="row small">
                    Compressed: {humanFileSize(item.compressedFile.size)}
                  </div>
                )}

                {item.error && <div className="row error">Error: {item.error}</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
