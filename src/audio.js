'use strict'

/* Every sound here is synthesised at runtime — no audio files ship with the
   app, and the settings sliders drive these gains for real. */
const Sound = (() => {
  let ctx = null
  let master, sfxBus, musicBus
  let ambient = null
  const vol = { master: 0.8, sfx: 0.75, music: 0.6 }

  function init () {
    if (ctx) return ctx
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    master = ctx.createGain()
    sfxBus = ctx.createGain()
    musicBus = ctx.createGain()
    sfxBus.connect(master)
    musicBus.connect(master)
    master.connect(ctx.destination)
    applyVolumes()
    return ctx
  }

  function applyVolumes () {
    if (!ctx) return
    master.gain.value = vol.master
    sfxBus.gain.value = vol.sfx
    musicBus.gain.value = vol.music * 0.5
  }

  function setVolumes (v) {
    Object.assign(vol, v)
    applyVolumes()
  }

  /* ---- building blocks ---- */
  function env (node, peak, attack, decay) {
    const t = ctx.currentTime
    node.gain.setValueAtTime(0.0001, t)
    node.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack)
    node.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
  }

  function blip ({ from, to, type = 'sine', peak = 0.12, attack = 0.004, decay = 0.09 }) {
    const c = init(); if (!c) return
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = type
    const t = c.currentTime
    o.frequency.setValueAtTime(from, t)
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + attack + decay)
    env(g, peak, attack, decay)
    o.connect(g).connect(sfxBus)
    o.start(t)
    o.stop(t + attack + decay + 0.03)
  }

  let noiseBuf = null
  function noiseSource () {
    const c = init(); if (!c) return null
    if (!noiseBuf) {
      noiseBuf = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate)
      const d = noiseBuf.getChannelData(0)
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    }
    const s = c.createBufferSource()
    s.buffer = noiseBuf
    return s
  }

  function tick ({ freq = 2400, q = 6, peak = 0.09, decay = 0.045, sweepTo = null }) {
    const c = init(); if (!c) return
    const s = noiseSource(); if (!s) return
    const f = c.createBiquadFilter()
    const g = c.createGain()
    f.type = 'bandpass'
    f.Q.value = q
    const t = c.currentTime
    f.frequency.setValueAtTime(freq, t)
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + decay)
    env(g, peak, 0.003, decay)
    s.connect(f).connect(g).connect(sfxBus)
    s.start(t)
    s.stop(t + decay + 0.05)
  }

  /* ---- the menu's voice ---- */
  const move   = () => { tick({ freq: 2600, q: 8, peak: 0.055, decay: 0.035 }); blip({ from: 900, type: 'triangle', peak: 0.03, decay: 0.035 }) }
  const select = () => { tick({ freq: 1500, q: 3, peak: 0.07, decay: 0.07 });  blip({ from: 480, to: 760, peak: 0.10, decay: 0.16 }) }
  const back   = () => { blip({ from: 520, to: 300, type: 'sine', peak: 0.09, decay: 0.16 }) }
  const tab    = () => { tick({ freq: 500, q: 1.2, peak: 0.08, decay: 0.2, sweepTo: 3400 }) }
  const open   = () => { blip({ from: 300, to: 520, type: 'triangle', peak: 0.08, decay: 0.18 }) }
  const adjust = () => { tick({ freq: 3200, q: 10, peak: 0.045, decay: 0.028 }) }

  /* ---- ambient beds ---- */
  function stopAmbient (fade = 1.2) {
    if (!ambient) return
    const a = ambient
    ambient = null
    const t = ctx.currentTime
    a.gain.gain.cancelScheduledValues(t)
    a.gain.gain.setValueAtTime(a.gain.gain.value, t)
    a.gain.gain.linearRampToValueAtTime(0.0001, t + fade)
    setTimeout(() => a.nodes.forEach(n => { try { n.stop() } catch {} }), (fade + 0.2) * 1000)
  }

  /* A slow A-minor drone. "loading" leans a semitone darker and opens the
     filter as the bar fills, so the bed tightens along with the progress. */
  function startAmbient (mode = 'menu') {
    const c = init(); if (!c) return
    stopAmbient(0.5)
    const freqs = mode === 'loading' ? [55, 87.31, 130.81, 155.56] : [55, 82.41, 110, 164.81]
    const g = c.createGain()
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = mode === 'loading' ? 260 : 380
    lp.Q.value = 0.7

    const nodes = []
    freqs.forEach((f, i) => {
      ;[0, 1].forEach(d => {
        const o = c.createOscillator()
        o.type = i > 1 ? 'sine' : 'triangle'
        o.frequency.value = f
        o.detune.value = d ? 7 : -7
        const og = c.createGain()
        og.gain.value = (i > 1 ? 0.16 : 0.30) / freqs.length
        o.connect(og).connect(lp)
        o.start()
        nodes.push(o)
      })
    })

    // very slow filter drift so the pad never sits still
    const lfo = c.createOscillator()
    const lfoGain = c.createGain()
    lfo.frequency.value = 0.045
    lfoGain.gain.value = mode === 'loading' ? 70 : 120
    lfo.connect(lfoGain).connect(lp.frequency)
    lfo.start()
    nodes.push(lfo)

    lp.connect(g).connect(musicBus)
    const t = c.currentTime
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(mode === 'loading' ? 0.5 : 0.38, t + 2.2)

    ambient = { gain: g, nodes, filter: lp, mode }
  }

  /* Called as the loading bar advances. */
  function setLoadProgress (pct) {
    if (!ambient || ambient.mode !== 'loading' || !ctx) return
    const target = 240 + pct * 6.5
    ambient.filter.frequency.setTargetAtTime(target, ctx.currentTime, 0.6)
  }

  const resume = () => { const c = init(); if (c && c.state === 'suspended') c.resume() }

  return { move, select, back, tab, open, adjust, startAmbient, stopAmbient, setLoadProgress, setVolumes, resume }
})()
