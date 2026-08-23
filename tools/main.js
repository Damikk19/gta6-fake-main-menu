const { app, BrowserWindow } = require('electron')
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

// CI images ship an unconfigured SUID sandbox helper, which aborts Electron.
if (process.platform === 'linux') app.commandLine.appendSwitch('no-sandbox')

const ROOT = path.join(__dirname, '..')
const ASSETS = path.join(ROOT, 'assets')
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
const ICNS_VARIANTS = [
  ['icon_16x16.png', 16], ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32], ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128], ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256], ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512], ['icon_512x512@2x.png', 1024]
]

const decode = dataUrl => Buffer.from(dataUrl.split(',')[1], 'base64')

/* A modern .ico is just a directory of PNGs, so no pixel encoder is needed. */
function packIco (entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)              // reserved
  header.writeUInt16LE(1, 2)              // 1 = icon
  header.writeUInt16LE(entries.length, 4)

  const dir = Buffer.alloc(16 * entries.length)
  let offset = header.length + dir.length
  entries.forEach(({ size, png }, i) => {
    const at = i * 16
    dir.writeUInt8(size >= 256 ? 0 : size, at)      // 0 encodes 256
    dir.writeUInt8(size >= 256 ? 0 : size, at + 1)
    dir.writeUInt8(0, at + 2)                        // palette entries
    dir.writeUInt8(0, at + 3)                        // reserved
    dir.writeUInt16LE(1, at + 4)                     // colour planes
    dir.writeUInt16LE(32, at + 6)                    // bits per pixel
    dir.writeUInt32LE(png.length, at + 8)
    dir.writeUInt32LE(offset, at + 12)
    offset += png.length
  })
  return Buffer.concat([header, dir, ...entries.map(e => e.png)])
}

app.whenReady().then(async () => {
  /* Builds must never embed someone else's mark, so the logo file is opt-in:
     `npm run icons -- --logo` for a personal build, plain for anything shipped. */
  const allowLogo = process.argv.includes('--logo')
  const win = new BrowserWindow({ show: false, width: 1200, height: 1200 })
  await win.loadFile(path.join(__dirname, 'icon.html'),
    { search: allowLogo ? 'logo=1' : '' })

  let ready = false
  for (let i = 0; i < 60 && !ready; i++) {
    ready = await win.webContents.executeJavaScript('window.__READY === true')
    if (!ready) await new Promise(r => setTimeout(r, 120))
  }
  if (!ready) { console.error('icon render timed out'); app.exit(1); return }

  const usedLogo = await win.webContents.executeJavaScript('window.__USED_LOGO')
  const render = size => win.webContents.executeJavaScript(`window.__render(${size})`).then(decode)

  fs.mkdirSync(path.join(ASSETS, 'img'), { recursive: true })
  fs.writeFileSync(path.join(ASSETS, 'img', 'icon.png'), await render(1024))

  const ico = []
  for (const size of ICO_SIZES) ico.push({ size, png: await render(size) })
  fs.writeFileSync(path.join(ASSETS, 'icon.ico'), packIco(ico))

  if (process.platform === 'darwin') {
    const set = path.join(os.tmpdir(), 'gtavi-icon.iconset')
    fs.rmSync(set, { recursive: true, force: true })
    fs.mkdirSync(set, { recursive: true })
    for (const [name, size] of ICNS_VARIANTS) fs.writeFileSync(path.join(set, name), await render(size))
    execFileSync('iconutil', ['-c', 'icns', set, '-o', path.join(ASSETS, 'icon.icns')])
    fs.rmSync(set, { recursive: true, force: true })
  }

  console.log(`icons written (mark: ${usedLogo ? 'vi-logo.png' : 'typographic fallback'})`)
  app.quit()
})
