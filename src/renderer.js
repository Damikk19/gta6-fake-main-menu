'use strict'

/* Authoring space: every coordinate is measured off the reference frame. */
const STAGE_W = 2000
const STAGE_H = 1125

const RECTS = {
  a: { x: 112,  y: 282, w: 592, h: 385 },   // top-left
  b: { x: 740,  y: 282, w: 592, h: 385 },   // top-middle
  c: { x: 1384, y: 282, w: 524, h: 635 },   // right, spans both rows
  d: { x: 112,  y: 700, w: 592, h: 217 },   // bottom-left
  e: { x: 740,  y: 700, w: 592, h: 217 }    // bottom-middle
}

const GLYPH = {
  triangle: '<svg viewBox="0 0 24 24"><path d="M12 5.2 19.9 18.9H4.1Z" fill="none" stroke="#14121a" stroke-width="2.9" stroke-linejoin="round"/></svg>',
  cross:    '<svg viewBox="0 0 24 24"><path d="M6 6 18 18M18 6 6 18" fill="none" stroke="#14121a" stroke-width="4.1" stroke-linecap="round"/></svg>',
  circle:   '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6.4" fill="none" stroke="#14121a" stroke-width="3.9"/></svg>'
}

const HINTS = {
  menu:     [['Social Club','triangle'],['Select','cross'],['Back','circle']],
  settings: [['Reset to Default','triangle'],['Select','cross'],['Back','circle']],
  stats:    [['Back','circle']],
  modal:    [['Select','cross'],['Back','circle']]
}

const $ = id => document.getElementById(id)

/* An <img> can fail before a listener is attached, so also test the settled
   state: a broken image reports complete with a zero natural width. */
function onImageMissing (img, handle) {
  img.addEventListener('error', handle)
  if (img.complete && img.naturalWidth === 0) handle()
}
const stage = $('stage')

/* ---------------- stage scaling ---------------- */
function fit () {
  const s = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H)
  stage.style.transform = `translate(${-STAGE_W * s / 2}px, ${-STAGE_H * s / 2}px) scale(${s})`
}
window.addEventListener('resize', fit)
fit()

/* ---------------- screen router ---------------- */
const SCREENS = { menu:'screenMenu', settings:'screenSettings', stats:'screenStats', loading:'screenLoading' }
let screen = 'menu'
let modalOpen = false

function setHints (which) {
  $('hints').innerHTML = (HINTS[which] || []).map(([text, g]) =>
    `<span>${text}</span><span class="btn">${GLYPH[g]}</span>`).join('')
}

function show (name) {
  screen = name
  for (const [key, id] of Object.entries(SCREENS)) $(id).classList.toggle('is-active', key === name)
  $('hintbar').classList.toggle('is-hidden', name === 'loading')
  if (name !== 'loading') setHints(modalOpen ? 'modal' : name)
}

/* ================= main menu ================= */
let tabKey = 'story'
let cursor = { col: 1, row: 0 }
let tileEls = []
/* The pointer only drives selection once it has actually moved; otherwise a
   window opening under the cursor would silently change the highlighted tile. */
let mouseActive = false

function renderTabs () {
  const el = $('tabs')
  el.innerHTML = ''
  for (const key of Object.keys(TABS)) {
    const b = document.createElement('button')
    b.className = 'tab' + (key === tabKey ? ' is-active' : '')
    b.innerHTML = `<span class="bumper">${key === 'story' ? 'L1' : 'R1'}</span>` +
                  `<span class="tablabel">${TABS[key].label}</span>`
    b.addEventListener('click', () => setTab(key))
    el.appendChild(b)
  }
}

function renderTiles () {
  const grid = $('grid')
  grid.innerHTML = ''
  tileEls = TABS[tabKey].tiles.map(t => {
    const r = RECTS[t.slot]
    const el = document.createElement('button')
    el.className = 'tile'
    el.style.cssText = `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px`
    el.innerHTML = `<img src="${t.img}" alt=""><div class="scrim"></div><div class="label">${t.label}</div>`
    const f = t.frame || { op:'50% 50%', zoom:1 }
    const im = el.querySelector('img')
    im.style.setProperty('--op', f.op)
    im.style.setProperty('--zoom', String(f.zoom))
    onImageMissing(im, () => im.classList.add('is-missing'))
    el.addEventListener('mouseenter', () => { if (mouseActive) moveTo(t.col, t.row) })
    el.addEventListener('click', () => { moveTo(t.col, t.row); activate() })
    grid.appendChild(el)
    return { el, def: t }
  })
  paintMenu()
}

function tileAt (col, row) {
  return TABS[tabKey].tiles.find(t =>
    t.col === col && (t.row === row || (t.rowSpan === 2 && row >= t.row && row < t.row + t.rowSpan)))
}
const currentTile = () => tileAt(cursor.col, cursor.row)

function paintMenu () {
  const cur = currentTile()
  tileEls.forEach(({ el, def }) => el.classList.toggle('is-selected', def === cur))
  $('infoKicker').textContent = cur.kicker
  $('infoTitle').textContent = cur.title
  $('infoChip').textContent = cur.chip || ''
  $('infoChip').style.display = cur.chip ? 'inline-block' : 'none'
}

function moveTo (col, row) {
  if (!tileAt(col, row) || (cursor.col === col && cursor.row === row)) return
  cursor = { col, row }
  paintMenu()
}

function moveMenu (dx, dy) {
  let { col, row } = cursor
  for (let i = 0; i < 3; i++) {
    col += dx; row += dy
    if (col < 0 || col > 2 || row < 0 || row > 1) return
    if (tileAt(col, row)) { moveTo(col, row); return }
  }
}

function setTab (key) {
  if (key === tabKey || !TABS[key]) return
  tabKey = key
  cursor = { ...TABS[key].start }
  renderTabs(); renderTiles()
  const grid = $('grid')
  grid.classList.remove('tab-in'); void grid.offsetWidth; grid.classList.add('tab-in')
}

function cycleTab (dir) {
  const keys = Object.keys(TABS)
  setTab(keys[(keys.indexOf(tabKey) + dir + keys.length) % keys.length])
}

function activate () {
  const cur = currentTile()
  const hit = tileEls.find(t => t.def === cur)
  if (hit) {
    hit.el.classList.remove('is-pressed'); void hit.el.offsetWidth; hit.el.classList.add('is-pressed')
  }
  setTimeout(() => {
    switch (cur.act) {
      case 'settings':   openSettings(); break
      case 'stats':      openStats(cur.data); break
      case 'load':       startLoading(cur); break
      case 'confirmNew': openModal('NEW GAME',
        'Starting a new game will not overwrite your existing save. Any unsaved progress in your current session will be lost.',
        ['Start New Game', 'Cancel'],
        i => { if (i === 0) startLoading({ mode:'story', title:'Prologue - Leonida', img:cur.img }) }); break
      case 'dialog':     openModal('CREW',
        'You are not currently a member of a Crew. Join or start one from the Rockstar Games Social Club to earn bonus RP with your friends.',
        ['OK'], () => {}); break
    }
  }, 130)
}

/* ================= settings ================= */
let catIdx = 0
let rowIdx = 0

function openSettings () { catIdx = 0; rowIdx = 0; renderSettings(); show('settings') }

function valueText (r) {
  return r.type === 'pct' ? r.v + '%' : r.options[r.i]
}

function renderSettings () {
  const cats = $('setCats')
  cats.innerHTML = ''
  SETTINGS.forEach((c, i) => {
    const b = document.createElement('button')
    b.className = 'set-cat' + (i === catIdx ? ' is-active' : '')
    b.textContent = c.label
    b.addEventListener('click', () => { catIdx = i; rowIdx = 0; renderSettings() })
    cats.appendChild(b)
  })
  const rows = $('setRows')
  rows.innerHTML = ''
  SETTINGS[catIdx].rows.forEach((r, i) => {
    const b = document.createElement('button')
    b.className = 'set-row' + (i === rowIdx ? ' is-selected' : '')
    b.innerHTML = `<span class="nm">${r.name}</span>` +
      `<span class="val"><span class="arrow">&#8249;</span>` +
      `<span class="valtext">${valueText(r)}</span>` +
      `<span class="arrow">&#8250;</span></span>`
    b.addEventListener('mouseenter', () => { if (mouseActive) { rowIdx = i; paintSettings() } })
    b.addEventListener('click', () => { rowIdx = i; adjust(1) })
    rows.appendChild(b)
  })
  paintSettings()
}

function paintSettings () {
  const rowEls = $('setRows').children
  for (let i = 0; i < rowEls.length; i++) {
    rowEls[i].classList.toggle('is-selected', i === rowIdx)
    rowEls[i].querySelector('.valtext').textContent = valueText(SETTINGS[catIdx].rows[i])
  }
  const r = SETTINGS[catIdx].rows[rowIdx]
  $('setHelp').innerHTML = `<span class="h-name">${r.name.toUpperCase()}</span>` +
                           `<div class="h-desc">${r.desc}</div>`
}

function adjust (dir) {
  const r = SETTINGS[catIdx].rows[rowIdx]
  if (r.type === 'pct') r.v = Math.max(0, Math.min(100, r.v + dir * r.step))
  else r.i = (r.i + dir + r.options.length) % r.options.length
  paintSettings()
}

/* Authored values are the factory defaults; snapshot them once at start-up. */
const SETTING_DEFAULTS = SETTINGS.map(c => c.rows.map(r => (r.type === 'pct' ? r.v : r.i)))

function resetDefaults () {
  SETTINGS[catIdx].rows.forEach((r, i) => {
    const d = SETTING_DEFAULTS[catIdx][i]
    if (r.type === 'pct') r.v = d; else r.i = d
  })
  paintSettings()
}

/* ================= stats ================= */
function openStats (key) {
  const d = STATS[key]
  $('statsTitle').textContent = d.title
  $('statsBig').textContent = d.big
  $('statsSub').textContent = d.sub
  $('statsBody').innerHTML = d.rows.map(([name, have, total]) => {
    const count = total == null ? have : `${have} / ${total}`
    return `<div class="stat-row"><span class="s-name">${name}</span>` +
           `<span class="s-count">${count}</span>` +
           `<span class="s-bar${total == null ? ' is-blank' : ''}"><i></i></span></div>`
  }).join('')
  // a style attribute in markup would trip the CSP, so size the fills via CSSOM
  const bars = $('statsBody').querySelectorAll('.s-bar i')
  d.rows.forEach(([, have, total], i) => {
    bars[i].style.width = total == null ? '0%' : Math.round(have / total * 100) + '%'
  })
  show('stats')
}

/* ================= loading ================= */
let loadRaf = null
let loadStart = 0
let tipTimer = null

function lerpCurve (curve, t) {
  if (t <= 0) return 0
  for (let i = 1; i < curve.length; i++) {
    const [p1, t1] = curve[i]
    if (t <= t1) {
      const [p0, t0] = curve[i - 1]
      return p0 + (p1 - p0) * (t - t0) / (t1 - t0)
    }
  }
  return 100
}

function stageText (stages, pct) {
  let out = stages[0][1]
  for (const [p, s] of stages) if (pct >= p) out = s
  return out
}

function startLoading (tile) {
  const mode = tile.mode || 'story'
  const art = $('loadArt')
  art.classList.remove('is-missing')
  art.src = tile.img
  $('loadTitle').textContent = tile.title || ''
  $('loadKicker').textContent = mode === 'online' ? 'JOINING SESSION' : 'LOADING'
  $('loadPct').textContent = '0%'
  $('loadFill').style.width = '0%'
  $('loadStatus').textContent = 'Initializing'

  art.style.animation = 'none'; void art.offsetWidth; art.style.animation = ''

  let tip = Math.floor(Math.random() * TIPS.length)
  const paintTip = () => { $('loadTip').innerHTML = `<b>TIP</b>&nbsp;&nbsp;${TIPS[tip % TIPS.length]}` }
  paintTip()
  clearInterval(tipTimer)
  tipTimer = setInterval(() => { tip++; paintTip() }, 6000)

  show('loading')
  const curve = LOAD_CURVE[mode] || LOAD_CURVE.story
  const stages = LOAD_STAGES[mode] || LOAD_STAGES.story
  loadStart = performance.now()
  cancelAnimationFrame(loadRaf)
  const step = now => {
    const pct = lerpCurve(curve, now - loadStart)
    $('loadPct').textContent = Math.floor(pct) + '%'
    $('loadFill').style.width = pct + '%'
    $('loadStatus').textContent = stageText(stages, pct)
    loadRaf = requestAnimationFrame(step)
  }
  loadRaf = requestAnimationFrame(step)
}

function stopLoading () {
  cancelAnimationFrame(loadRaf)
  clearInterval(tipTimer)
  loadRaf = null
}

/* ================= modal ================= */
let modalBtns = []
let modalIdx = 0
let modalDone = null

function openModal (title, body, buttons, onPick) {
  $('modalTitle').textContent = title
  $('modalBody').textContent = body
  const wrap = $('modalActions')
  wrap.innerHTML = ''
  modalBtns = buttons.map((label, i) => {
    const b = document.createElement('button')
    b.className = 'modal-btn' + (i === 0 ? ' is-selected' : '')
    b.textContent = label
    b.addEventListener('mouseenter', () => { if (mouseActive) { modalIdx = i; paintModal() } })
    b.addEventListener('click', () => { modalIdx = i; confirmModal() })
    wrap.appendChild(b)
    return b
  })
  modalIdx = 0
  modalDone = onPick
  modalOpen = true
  $('modalLayer').classList.add('is-open')
  setHints('modal')
}

function paintModal () {
  modalBtns.forEach((b, i) => b.classList.toggle('is-selected', i === modalIdx))
}

function closeModal () {
  modalOpen = false
  $('modalLayer').classList.remove('is-open')
  setHints(screen)
}

function confirmModal () {
  const pick = modalIdx
  const done = modalDone
  closeModal()
  if (done) done(pick)
}

/* ================= input ================= */
function goBack () {
  if (screen === 'loading') { stopLoading(); show('menu') }
  else if (screen !== 'menu') show('menu')
}

window.addEventListener('keydown', e => {
  const k = e.key
  const dir = { ArrowLeft:[-1,0], a:[-1,0], A:[-1,0], ArrowRight:[1,0], d:[1,0], D:[1,0],
                ArrowUp:[0,-1], w:[0,-1], W:[0,-1], ArrowDown:[0,1], s:[0,1], S:[0,1] }[k]
  const select = k === 'Enter' || k === ' '
  const back = k === 'Escape' || k === 'Backspace'

  if (modalOpen) {
    if (dir && dir[0]) { modalIdx = (modalIdx + dir[0] + modalBtns.length) % modalBtns.length; paintModal() }
    else if (select) confirmModal()
    else if (back) closeModal()
    else return
    e.preventDefault(); return
  }

  if (screen === 'menu') {
    if (dir) moveMenu(dir[0], dir[1])
    else if (select) activate()
    else if (k === 'q' || k === 'Q') cycleTab(-1)
    else if (k === 'e' || k === 'E' || k === 'Tab') cycleTab(1)
    else return
  } else if (screen === 'settings') {
    const rows = SETTINGS[catIdx].rows
    if (k === 'q' || k === 'Q') { catIdx = (catIdx - 1 + SETTINGS.length) % SETTINGS.length; rowIdx = 0; renderSettings() }
    else if (k === 'e' || k === 'E' || k === 'Tab') { catIdx = (catIdx + 1) % SETTINGS.length; rowIdx = 0; renderSettings() }
    else if (dir && dir[1]) { rowIdx = (rowIdx + dir[1] + rows.length) % rows.length; paintSettings() }
    else if (dir && dir[0]) adjust(dir[0])
    else if (k === 'r' || k === 'R') resetDefaults()
    else if (back) goBack()
    else return
  } else if (screen === 'stats' || screen === 'loading') {
    if (back || select) goBack()
    else return
  }
  e.preventDefault()
})

/* Cursor stays hidden like an in-game menu, but reappears while the mouse moves. */
let hideTimer = null
window.addEventListener('mousemove', () => {
  mouseActive = true
  document.body.classList.add('show-cursor')
  clearTimeout(hideTimer)
  hideTimer = setTimeout(() => {
    document.body.classList.remove('show-cursor')
    mouseActive = false
  }, 1600)
})

/* ---------------- artwork state ---------------- */
onImageMissing($('viLogo'), () => {
  $('viLogo').classList.add('is-missing')
  $('viFallback').classList.add('is-shown')
})
onImageMissing($('loadArt'), () => $('loadArt').classList.add('is-missing'))

const hint = $('artHint')
hint.addEventListener('click', () => window.gtavi && window.gtavi.openArtworkFolder())
if (window.gtavi) {
  window.gtavi.artworkStatus().then(({ ready }) => { hint.hidden = ready })
}

renderTabs()
renderTiles()
setHints('menu')
