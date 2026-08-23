const { app, BrowserWindow, Menu, nativeImage, screen, protocol, net, shell, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const { pathToFileURL } = require('url')

// The window/dock/menubar must read as the real thing.
app.setName('Grand Theft Auto VI')

const ASSETS = path.join(__dirname, '..', 'assets')

/* ------------------------------------------------------------------
   Artwork lives outside the app, in a folder the user controls, so no
   third-party images ever ship inside the build. Files are served to the
   page over an "art://" scheme instead of raw file:// paths.
------------------------------------------------------------------ */
const SLOTS = ['new-game', 'continue', 'progress', 'settings', 'collectibles', 'vi-logo']
const EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.avif']

const artworkDir = () => path.join(app.getPath('userData'), 'artwork')

function resolveArtwork (name) {
  if (!SLOTS.includes(name)) return null
  const dir = artworkDir()
  for (const ext of EXTS) {
    const p = path.join(dir, name + ext)
    if (fs.existsSync(p)) return p
  }
  // A local checkout may keep its own artwork in assets/img (git-ignored).
  for (const ext of EXTS) {
    const p = path.join(ASSETS, 'img', name + ext)
    if (fs.existsSync(p)) return p
  }
  return null
}

const README = `GRAND THEFT AUTO VI - MAIN MENU MOCKUP
=======================================

Drop your own images into this folder to fill the menu.
Accepted formats: .png .jpg .jpeg .webp .avif

  new-game.jpg      big tile, top left
  continue.jpg      big tile, top middle  (also the loading screen backdrop)
  settings.jpg      tall tile on the right
  collectibles.jpg  small tile, bottom left
  progress.jpg      small tile, bottom middle
  vi-logo.png       optional logo, top right - needs a transparent background

Anything 16:9 and roughly 1920x1080 or larger looks best.
Restart the app after adding files.

No artwork ships with this app. Whatever you put here is your own choice
and your own responsibility.
`

function ensureArtworkFolder () {
  const dir = artworkDir()
  try {
    fs.mkdirSync(dir, { recursive: true })
    const readme = path.join(dir, 'READ ME - how to add artwork.txt')
    if (!fs.existsSync(readme)) fs.writeFileSync(readme, README)
  } catch { /* a read-only home directory just means placeholders */ }
  return dir
}

const haveArtwork = () => SLOTS.some(s => s !== 'vi-logo' && resolveArtwork(s))

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
  win.once('ready-to-show', () => win.show())

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
        app.quit()
      }, Number(process.env.SHOT_DELAY || 1200))
    })
  }

  return win
}

app.whenReady().then(() => {
  protocol.handle('art', async (req) => {
    const name = new URL(req.url).hostname
    const file = resolveArtwork(name)
    if (!file) return new Response(null, { status: 404 })
    return net.fetch(pathToFileURL(file).toString())
  })

  ipcMain.handle('artwork:open', () => shell.openPath(ensureArtworkFolder()))
  ipcMain.handle('artwork:status', () => ({ dir: artworkDir(), ready: haveArtwork() }))

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
