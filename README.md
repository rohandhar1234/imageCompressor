# Image Compress (Vite + React + Serverless)

This project is a Vite + React frontend with a serverless `/api/compress` endpoint (formidable + sharp) intended for deployment to Vercel.

Goals in this repo
- Use a serverless function for image compression (ready in `api/compress.js`).
- Develop locally against a serverless-like runtime using `vercel dev`, or use the local Express shim `server.local.js` for quick iteration.
- Deploy to Vercel (connected to GitHub) for production hosting.

Quick local setup
1. Install dependencies

```bash
npm install
```

2. Fast local dev (Express shim)

- Start the local API server (this mirrors the serverless handler for quick dev):

```bash
npm run start:api
# (runs server.local.js on port 3000 by default)
```

- Start the frontend dev server:

```bash
npm run dev
```

Vite is configured to proxy `/api` to `http://localhost:3000`, so the React app will call the local API server transparently.

3. Full serverless local dev (recommended to emulate Vercel)

- Install the Vercel CLI if you don't have it:

```bash
npm i -g vercel
```

- Start Vercel dev which runs your frontend and serverless functions together:

```bash
npm run dev:vercel
# (runs `vercel dev`; it will serve the site and functions on localhost)
```

This is the closest local environment to what you'll deploy.

Testing the compress API locally

- Use the UI in the browser to select an image and compress it.
- Or test with curl (replace `input.jpg` accordingly):

```bash
curl -s -X POST "http://localhost:3000/api/compress" -F "file=@input.jpg" -F "quality=70" --output out.bin
```

Deployment to Vercel (via GitHub)

1. Commit and push this repository to GitHub.
2. Go to https://vercel.com, import the GitHub repository and follow the prompts.
3. Vercel will run the build and deploy static site + serverless functions. The endpoint will be available at `/api/compress` in production.

Notes about sharp and native dependencies

- `sharp` depends on libvips; on your local mac you previously installed libvips via Homebrew. On Vercel, the platform provides a Linux build environment and will install/build `sharp` during deployment. If you see errors related to libvips/sharp during deployment, try the following:
  - Ensure `sharp` is listed in `package.json` dependencies (it is).
  - Try deploying again (Vercel often resolves prebuilt binaries for sharp). If it fails, consult Vercel's docs for using native modules with serverless functions. They have a guide for `sharp`.

Troubleshooting tips
- If the browser shows an error when compressing:
  - Inspect DevTools → Network → POST /api/compress. Look at status and response body.
  - Check the server logs (if running `vercel dev` or the local Express server) for errors — the code logs metadata and errors for easier diagnosis.
- If you see `Unsupported image format` for some iPhone images (HEIC/HEIF):
  - Vercel's libvips build must include HEIF support. If it doesn't, you can either:
    - Add a client-side fallback (canvas-based encode) for HEIC, or
    - Convert HEIC to JPEG on the client before uploading, or
    - Use a specialized server that includes libheif support.

Recommended next steps
- Try `npm run dev:vercel` and compress a few images via the UI. If that works, push to GitHub and import the repo to Vercel for deployment.
- Tell me if you want me to:
  - Replace `server.local.js` with a `vercel dev`-only workflow and simplify scripts.
  - Add a GitHub Actions workflow to run a smoke test against the Vercel preview deployment.

---

If you want, I can now: (pick one)
- Add a small smoke-test script that POSTs a sample image to `/api/compress` (automatable in CI).
- Update package.json to include `vercel` as a devDependency and a `dev:vercel` script that runs the local vercel binary if installed locally.
- Prepare a step-by-step deploy checklist for GitHub → Vercel.
# React Image Compressor (Frontend)

This is a minimal Vite + React frontend that lets users compress images in the browser using `browser-image-compression`.

Features:
- Select multiple images
- Adjust quality and maximum dimensions
- Compress single images or all at once
- Progress indicator and download compressed image

Quick start

1. Install dependencies

```bash
cd /Users/rohandhar/Desktop/imageCompress
npm install
```

2. Run the dev server

```bash
npm run dev
```

Open the URL printed by Vite (typically http://localhost:5173).

Notes
- Compression runs entirely in the browser; no server needed.
- For very large images consider increasing memory or using a backend service.

Next steps (optional)
- Add drag-and-drop
- Add batch download (zip)
- Persist settings in localStorage

