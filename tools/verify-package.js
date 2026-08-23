/* Proves a packaged build carries no third-party media, by reading the asar
   directory straight out of the archive header. Deliberately dependency-free:
   pulling a tool off the network to check this would be one more thing that can
   drift or break the build. */
const fs = require('fs')
const path = require('path')

const ARTWORK = ['new-game', 'continue', 'progress', 'settings', 'collectibles', 'vi-logo']
const DIST = path.join(__dirname, '..', 'dist')

function findAsar (dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const found = findAsar(p)
      if (found) return found
    } else if (entry.name === 'app.asar') return p
  }
  return null
}

/* asar layout: pickle(4) | headerSize(4) | jsonLen(4) | jsonLen padding(4) | JSON */
function readAsarTree (file) {
  const fd = fs.openSync(file, 'r')
  try {
    const head = Buffer.alloc(16)
    fs.readSync(fd, head, 0, 16, 0)
    const jsonLen = head.readUInt32LE(12)
    const json = Buffer.alloc(jsonLen)
    fs.readSync(fd, json, 0, jsonLen, 16)
    return JSON.parse(json.toString('utf8'))
  } finally { fs.closeSync(fd) }
}

function walk (node, prefix, out) {
  for (const [name, child] of Object.entries(node.files || {})) {
    const p = prefix + '/' + name
    if (child.files) walk(child, p, out); else out.push(p)
  }
  return out
}

if (!fs.existsSync(DIST)) { console.error('verify: no dist/ to inspect'); process.exit(1) }
const asar = findAsar(DIST)
if (!asar) { console.error('verify: no app.asar found under dist/'); process.exit(1) }
console.log('verify: inspecting ' + asar)

const files = walk(readAsarTree(asar), '', [])
const media = files.filter(f => f.startsWith('/assets/img/'))
media.forEach(f => console.log('  ' + f))

const leaked = media.filter(f => ARTWORK.some(a => path.basename(f).startsWith(a + '.')))
if (leaked.length) {
  console.error('verify: FAILED — artwork was packaged: ' + leaked.join(', '))
  process.exit(1)
}
console.log(`verify: OK — ${files.length} files, no third-party media`)
