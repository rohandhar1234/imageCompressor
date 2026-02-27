import React from 'react'
import ImageCompressor from './components/ImageCompressor'

export default function App() {
  return (
    <div className="app">
      <header>
        <h1>Image Compressor</h1>
        <p>Compress images in the browser, adjust quality and max dimensions, then download.</p>
      </header>

      <main>
        <ImageCompressor />
      </main>

      <footer>
        {/* <small>Built with browser-image-compression and Vite + React</small> */}
      </footer>
    </div>
  )
}
