const { app, BrowserWindow, Menu, nativeImage, screen, protocol, shell, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const { Readable } = require('stream')

// The window/dock/menubar must read as the real thing.
app.setName('Grand Theft Auto VI')

// The menu bed and UI sounds are synthesised, so no click should be needed
// before they are allowed to start.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

// On Linux the app must be started with --no-sandbox. A plain zip cannot carry
// the setuid bit chrome-sandbox needs, and Chromium aborts on an unconfigured
// helper before this file ever runs, so the flag has to come from the command
// line -- appendSwitch('no-sandbox') here would be too late to have any effect.

const ASSETS = path.join(__dirname, '..', 'assets')

/* ------------------------------------------------------------------
   Artwork lives outside the app, in a folder the user controls, so no
   third-party media ever ships inside the build. Files are served to the
   page over an "art://" scheme instead of raw file:// paths.
------------------------------------------------------------------ */
const SLOTS = ['new-game', 'continue', 'progress', 'settings', 'collectibles', 'vi-logo']
const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.avif']
const VIDEO_EXTS = ['.mp4', '.webm', '.mov', '.m4v']
const EXTS = [...VIDEO_EXTS, ...IMAGE_EXTS]   // video wins when both exist

const MIME = {
  '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp',
  '.avif':'image/avif', '.mp4':'video/mp4', '.m4v':'video/mp4', '.webm':'video/webm',
  '.mov':'video/quicktime'
}

const artworkDir = () => path.join(app.getPath('userData'), 'artwork')

function resolveArtwork (name) {
  if (!SLOTS.includes(name)) return null
  for (const dir of [artworkDir(), path.join(ASSETS, 'img')]) {
    for (const ext of EXTS) {
      const p = path.join(dir, name + ext)
      if (fs.existsSync(p)) return p
    }
  }
  return null
}

const kindOf = file => (VIDEO_EXTS.includes(path.extname(file).toLowerCase()) ? 'video' : 'image')

function artworkKinds () {
  const out = {}
  for (const slot of SLOTS) {
    const file = resolveArtwork(slot)
    out[slot] = file ? kindOf(file) : null
  }
  return out
}

const README = `GRAND THEFT AUTO VI - MAIN MENU MOCKUP
=======================================

Drop your own media into this folder to fill the menu, or just drag files
straight onto the app window.

Images: .png .jpg .jpeg .webp .avif
Video:  .mp4 .webm .mov .m4v   (played muted on a loop; wins over an image
                                of the same name)

  new-game      big tile, top left
  continue      big tile, top middle  (also the loading screen backdrop)
  settings      tall tile on the right
  collectibles  small tile, bottom left
  progress      small tile, bottom middle
  vi-logo       optional logo, top right - needs a transparent background

Anything 16:9 and roughly 1920x1080 or larger looks best. Keep clips short;
they loop.

Two optional settings files can sit in here as well:

  framing.json   per-tile crop, e.g. {"continue": {"op": "6% 50%", "zoom": 1.01}}
  content.json   your own gamertag, mission name and percentages

See the project README for what goes in them.

No artwork ships with this app. Whatever you put here is your own choice
and your own responsibility.
`

function ensureArtworkFolder () {
  const dir = artworkDir()
  try {
    fs.mkdirSync(dir, { recursive: true })
    const readme = path.join(dir, 'READ ME - how to add artwork.txt')
    fs.writeFileSync(readme, README)
  } catch { /* a read-only home directory just means placeholders */ }
  return dir
}

const haveArtwork = () => SLOTS.some(s => s !== 'vi-logo' && resolveArtwork(s))

function readJson (name) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(artworkDir(), name), 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch { return {} }
}

const slugToSlot = name => {
  const stem = path.basename(name, path.extname(name)).toLowerCase().replace(/[\s_]+/g, '-')
  return SLOTS.includes(stem) ? stem : null
}

/* Copies dropped media into the artwork folder. A file already named after a
   slot goes there; anything else fills the tile the user had highlighted. */
function importArtwork (files, fallbackSlot) {
  const dir = ensureArtworkFolder()
  const written = []
  let fallbackUsed = false
  for (const src of files) {
    const ext = path.extname(src).toLowerCase()
    if (!EXTS.includes(ext)) continue
    let slot = slugToSlot(src)
    if (!slot) {
      if (fallbackUsed || !SLOTS.includes(fallbackSlot)) continue
      slot = fallbackSlot
      fallbackUsed = true
    }
    try {
      // drop other extensions for this slot, or resolution order would win
      for (const e of EXTS) {
        const old = path.join(dir, slot + e)
        if (e !== ext && fs.existsSync(old)) fs.rmSync(old)
      }
      fs.copyFileSync(src, path.join(dir, slot + ext))
      written.push(slot)
    } catch { /* skip anything unreadable */ }
  }
  return written
}

/* Video needs byte ranges; without them playback stalls or refuses to start. */
function serveFile (file, rangeHeader) {
  const size = fs.statSync(file).size
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream'
  const m = rangeHeader && /bytes=(\d*)-(\d*)/.exec(rangeHeader)

  if (m) {
    let start = m[1] ? parseInt(m[1], 10) : 0
    let end = m[2] ? parseInt(m[2], 10) : size - 1
    if (Number.isNaN(start) || start < 0) start = 0
    if (Number.isNaN(end) || end >= size) end = size - 1
    if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
    return new Response(Readable.toWeb(fs.createReadStream(file, { start, end })), {
      status: 206,
      headers: {
        'Content-Type': type,
        'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes'
      }
    })
  }

  return new Response(Readable.toWeb(fs.createReadStream(file)), {
    headers: { 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes' }
  })
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'art', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
])

function buildMenu () {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'Grand Theft Auto VI',
      submenu: [
        { role: 'about', label: 'About Grand Theft Auto VI' },
        { type: 'separator' },
        { label: 'Artwork Folder…', click: () => shell.openPath(ensureArtworkFolder()) },
        { type: 'separator' },
        { role: 'hide', label: 'Hide Grand Theft Auto VI' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit', label: 'Quit Grand Theft Auto VI' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'togglefullscreen' },
        { label: 'Toggle Full Screen', accelerator: 'F11', visible: false,
          click: (_i, win) => win && win.setFullScreen(!win.isFullScreen()) }
      ]
    }
  ]))
}

/* Largest 16:9 content box that sits comfortably inside the display. */
function windowSize () {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  const w = Math.round(Math.min(width * 0.82, (height - 60) * 0.82 * 16 / 9))
  return { width: w, height: Math.round(w * 9 / 16) }
}

function createWindow () {
  const size = windowSize()
  const win = new BrowserWindow({
    width: size.width,
    height: size.height,
    useContentSize: true,
    minWidth: 800,
    minHeight: 450,
    title: 'Grand Theft Auto VI',
    backgroundColor: '#111018',
    show: false,
    fullscreenable: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      preload: path.join(__dirname, 'preload.js')
    }
  })

  if (process.env.SHOT_W) win.setContentSize(Number(process.env.SHOT_W), Number(process.env.SHOT_H))
  else win.setAspectRatio(16 / 9)

  win.loadFile(path.join(__dirname, 'index.html'))

  // Nothing in the page may rename the window.
  win.on('page-title-updated', (e) => { e.preventDefault() })
  win.once('ready-to-show', () => {
    // While capturing, stay out of the way: a focused window on a desktop in
    // use catches the operator's real keystrokes and clicks.
    if (process.env.SHOT) {
      win.setFocusable(false)
      win.setIgnoreMouseEvents(true)
      win.showInactive()
    } else win.show()
  })

  // Dev helper: SHOT=/path/out.png npm start -> capture and exit.
  if (process.env.SHOT) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        for (const k of (process.env.SHOT_KEYS || '').split(',').filter(Boolean)) {
          win.webContents.sendInputEvent({ type: 'keyDown', keyCode: k })
          win.webContents.sendInputEvent({ type: 'char', keyCode: k })
          win.webContents.sendInputEvent({ type: 'keyUp', keyCode: k })
          await new Promise(r => setTimeout(r, 350))
        }
        if (process.env.SHOT_POST) await new Promise(r => setTimeout(r, Number(process.env.SHOT_POST)))
        fs.writeFileSync(process.env.SHOT, (await win.webContents.capturePage()).toPNG())
        // Proof the page actually reached the menu, not just that pixels exist.
        const state = await win.webContents.executeJavaScript(
          'JSON.stringify({ kicker: (document.getElementById("infoKicker")||{}).textContent || "",' +
          ' tiles: document.querySelectorAll(".tile").length })').catch(() => '{}')
        console.log('SHOT_OK ' + state)
        app.quit()
      }, Number(process.env.SHOT_DELAY || 1200))
    })
  }

  return win
}

app.whenReady().then(() => {
  protocol.handle('art', async (req) => {
    const file = resolveArtwork(new URL(req.url).hostname)
    if (!file) return new Response(null, { status: 404 })
    try { return serveFile(file, req.headers.get('range')) }
    catch { return new Response(null, { status: 500 }) }
  })

  ipcMain.handle('artwork:open', () => shell.openPath(ensureArtworkFolder()))
  ipcMain.handle('artwork:status', () => ({ dir: artworkDir(), ready: haveArtwork(), kinds: artworkKinds() }))
  ipcMain.handle('artwork:framing', () => readJson('framing.json'))
  ipcMain.handle('artwork:content', () => readJson('content.json'))
  ipcMain.handle('artwork:import', (_e, files, fallbackSlot) => importArtwork(files, fallbackSlot))

  buildMenu()
  ensureArtworkFolder()

  const iconPath = path.join(ASSETS, 'img', 'icon.png')
  if (process.platform === 'darwin' && app.dock && fs.existsSync(iconPath)) {
    app.dock.setIcon(nativeImage.createFromPath(iconPath))
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => { app.quit() })
