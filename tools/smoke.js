/* Launches a packaged build, captures one frame and checks it is a real
   render. Used by CI so a broken Windows or Linux package cannot be shipped
   unnoticed. */
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

const DIST = path.join(__dirname, '..', 'dist')
const NAME = 'Grand Theft Auto VI'

function findBinary () {
  const candidates = [
    [`${NAME}-darwin-arm64`, `${NAME}.app/Contents/MacOS/${NAME}`],
    [`${NAME}-darwin-x64`,   `${NAME}.app/Contents/MacOS/${NAME}`],
    [`${NAME}-win32-x64`,    `${NAME}.exe`],
    [`${NAME}-linux-x64`,    NAME.toLowerCase().replace(/ /g, '-')],
    [`${NAME}-linux-x64`,    NAME]
  ]
  for (const [dir, rel] of candidates) {
    const p = path.join(DIST, dir, rel)
    if (fs.existsSync(p)) return p
  }
  return null
}

/* Reads width/height straight out of the PNG IHDR chunk. */
function pngSize (buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
}

const bin = findBinary()
if (!bin) { console.error('smoke: no packaged build found in dist/'); process.exit(1) }

const shot = path.join(os.tmpdir(), 'gtavi-smoke.png')
fs.rmSync(shot, { force: true })
console.log('smoke: launching ' + bin)

// CI containers block user namespaces, so the sandbox has to come off there.
const args = process.platform === 'linux' ? ['--no-sandbox'] : []
let stdout = ''
const child = spawn(bin, args, {
  env: { ...process.env, SHOT: shot, SHOT_W: '1000', SHOT_H: '563', SHOT_DELAY: '4000' },
  stdio: ['ignore', 'pipe', 'inherit']
})
child.stdout.on('data', d => { stdout += d; process.stdout.write(d) })

const timer = setTimeout(() => { child.kill(); }, 90000)

child.on('exit', code => {
  clearTimeout(timer)
  if (!fs.existsSync(shot)) {
    console.error(`smoke: FAILED - app exited (${code}) without writing a frame`)
    process.exit(1)
  }
  const buf = fs.readFileSync(shot)
  const size = pngSize(buf)
  // Frame size follows the runner's pixel ratio, so check shape, not exact pixels.
  if (!size || size.w < 800 || Math.abs(size.w / size.h - 16 / 9) > 0.05) {
    console.error('smoke: FAILED - unexpected frame ' + JSON.stringify(size))
    process.exit(1)
  }
  // A blank frame compresses to almost nothing; a rendered menu does not.
  if (buf.length < 15000) {
    console.error(`smoke: FAILED - frame is ${buf.length} bytes, looks blank`)
    process.exit(1)
  }
  const m = /SHOT_OK (\{.*\})/.exec(stdout)
  if (!m) {
    console.error('smoke: FAILED - app never reported a rendered page')
    process.exit(1)
  }
  let state
  try { state = JSON.parse(m[1]) } catch { state = {} }
  if (!state.kicker || state.tiles !== 5) {
    console.error('smoke: FAILED - menu did not render: ' + m[1])
    process.exit(1)
  }
  console.log(`smoke: OK - ${size.w}x${size.h}, ${Math.round(buf.length / 1024)}KB, ` +
              `${state.tiles} tiles, selected "${state.kicker}"`)
})
