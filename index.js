// zissl — Copyright (C) 2026 Eliyahu Moshe Leinkram
// SPDX-License-Identifier: AGPL-3.0-or-later
// Full notice: see LICENSE and NOTICE.md at the repo root.

/**
 * zissl — Hydra's synth language on a WebGPU renderer, in one file of WGSL.
 * This module is the thin browser host: it turns transform chains like
 * osc(10).rotate(0.1).modulate(noise(3)).out(o0) into a single WGSL fragment
 * shader per output, runs the ping-pong feedback buffers (o0..o3), feeds
 * external sources (s0..s3), and blits to the canvas. The language and its
 * editors live a layer above — this package is the picture.
 *
 * The engine is a hydra-synth derivative (AGPL-3.0-or-later) — see NOTICE.md.
 */

import { LIB } from "./dist/zissl.wgsl.js";

// name, kind, wgsl fn, scalar params [name, default]. Kinds: src (starts a
// chain), coord (warps st), color (maps the color), combine (mixes another
// chain's color in), combineCoord (warps st BY another chain's color).
const DEFS = [
  ["noise", "src", "zs_noise", [["scale", 10], ["offset", 0.1]]],
  ["voronoi", "src", "zs_voronoi", [["scale", 5], ["speed", 0.3], ["blending", 0.3]]],
  ["osc", "src", "zs_osc", [["frequency", 60], ["sync", 0.1], ["offset", 0]]],
  ["shape", "src", "zs_shape", [["sides", 3], ["radius", 0.3], ["smoothing", 0.01]]],
  ["gradient", "src", "zs_gradient", [["speed", 0]]],
  ["solid", "src", "zs_solid", [["r", 0], ["g", 0], ["b", 0], ["a", 1]]],
  ["src", "src", null, []],
  ["prev", "src", null, []], // this output's own last frame — no argument needed

  ["rotate", "coord", "zg_rotate", [["angle", 10], ["speed", 0]]],
  ["scale", "coord", "zg_scale", [["amount", 1.5], ["xMult", 1], ["yMult", 1], ["offsetX", 0.5], ["offsetY", 0.5]]],
  ["pixelate", "coord", "zg_pixelate", [["pixelX", 20], ["pixelY", 20]]],
  ["repeat", "coord", "zg_repeat", [["repeatX", 3], ["repeatY", 3], ["offsetX", 0], ["offsetY", 0]]],
  ["repeatX", "coord", "zg_repeatX", [["reps", 3], ["offset", 0]]],
  ["repeatY", "coord", "zg_repeatY", [["reps", 3], ["offset", 0]]],
  ["kaleid", "coord", "zg_kaleid", [["nSides", 4]]],
  ["scroll", "coord", "zg_scroll", [["scrollX", 0.5], ["scrollY", 0.5], ["speedX", 0], ["speedY", 0]]],
  ["scrollX", "coord", "zg_scrollX", [["scrollX", 0.5], ["speed", 0]]],
  ["scrollY", "coord", "zg_scrollY", [["scrollY", 0.5], ["speed", 0]]],

  ["posterize", "color", "zc_posterize", [["bins", 3], ["gamma", 0.6]]],
  ["shift", "color", "zc_shift", [["r", 0.5], ["g", 0], ["b", 0], ["a", 0]]],
  ["invert", "color", "zc_invert", [["amount", 1]]],
  ["contrast", "color", "zc_contrast", [["amount", 1.6]]],
  ["brightness", "color", "zc_brightness", [["amount", 0.4]]],
  ["luma", "color", "zc_luma", [["threshold", 0.5], ["tolerance", 0.1]]],
  ["thresh", "color", "zc_thresh", [["threshold", 0.5], ["tolerance", 0.04]]],
  ["color", "color", "zc_color", [["r", 1], ["g", 1], ["b", 1], ["a", 1]]],
  ["saturate", "color", "zc_saturate", [["amount", 2]]],
  ["hue", "color", "zc_hue", [["hue", 0.4]]],
  ["colorama", "color", "zc_colorama", [["amount", 0.005]]],
  ["sum", "color", "zc_sum", [["r", 1], ["g", 1], ["b", 1], ["a", 1]]],
  ["r", "color", "zc_r", [["scale", 1], ["offset", 0]]],
  ["g", "color", "zc_g", [["scale", 1], ["offset", 0]]],
  ["b", "color", "zc_b", [["scale", 1], ["offset", 0]]],
  ["a", "color", "zc_a", [["scale", 1], ["offset", 0]]],

  ["add", "combine", "zb_add", [["amount", 1]]],
  ["sub", "combine", "zb_sub", [["amount", 1]]],
  ["layer", "combine", "zb_layer", []],
  ["blend", "combine", "zb_blend", [["amount", 0.5]]],
  ["mult", "combine", "zb_mult", [["amount", 1]]],
  ["diff", "combine", "zb_diff", []],
  ["mask", "combine", "zb_mask", []],

  ["modulateRepeat", "combineCoord", "zm_modulateRepeat", [["repeatX", 3], ["repeatY", 3], ["offsetX", 0.5], ["offsetY", 0.5]]],
  ["modulateRepeatX", "combineCoord", "zm_modulateRepeatX", [["reps", 3], ["offset", 0.5]]],
  ["modulateRepeatY", "combineCoord", "zm_modulateRepeatY", [["reps", 3], ["offset", 0.5]]],
  ["modulateKaleid", "combineCoord", "zm_modulateKaleid", [["nSides", 4]]],
  ["modulateScrollX", "combineCoord", "zm_modulateScrollX", [["scrollX", 0.5], ["speed", 0]]],
  ["modulateScrollY", "combineCoord", "zm_modulateScrollY", [["scrollY", 0.5], ["speed", 0]]],
  ["modulate", "combineCoord", "zm_modulate", [["amount", 0.1]]],
  ["modulateScale", "combineCoord", "zm_modulateScale", [["multiple", 1], ["offset", 1]]],
  ["modulatePixelate", "combineCoord", "zm_modulatePixelate", [["multiple", 10], ["offset", 3]]],
  ["modulateRotate", "combineCoord", "zm_modulateRotate", [["multiple", 1], ["offset", 0]]],
  ["modulateHue", "combineCoord", "zm_modulateHue", [["amount", 1]]],
];

const EASE = {
  linear: (t) => t,
  sin: (t) => 0.5 - Math.cos(t * Math.PI) / 2,
  easeInQuad: (t) => t * t,
  easeOutQuad: (t) => t * (2 - t),
  easeInOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1),
};

const mod = (x, n) => ((x % n) + n) % n;

/** Hydra's array sequencing: one step per beat, [..].fast/.smooth/.ease/.offset. */
function seqValue(arr, ctx) {
  const len = arr.length;
  if (!len) return 0;
  const val = (x) => (typeof x === "function" ? Number(x(ctx)) || 0 : Number(x) || 0);
  const speed = arr._speed ?? 1;
  const smooth = arr._smooth ?? 0;
  const index = ctx.time * speed * (ctx.bpm / 60) + (arr._offset ?? 0);
  if (smooth) {
    const ease = arr._ease ?? EASE.linear;
    const i = index - smooth / 2;
    const cur = val(arr[Math.floor(mod(i, len))]);
    const next = val(arr[Math.floor(mod(i + 1, len))]);
    const t = Math.min(mod(i, 1) / smooth, 1);
    return cur + ease(t) * (next - cur);
  }
  return val(arr[Math.floor(mod(index, len))]);
}

/** A param function is USER code, run every frame for every slot. If it throws
 *  (a typo, a bad clock instant, a pattern query that comes back empty) the
 *  throw would unwind the whole frame and stop the rAF loop for the session —
 *  the canvas freezes black and nothing ever repaints. So: hold the last good
 *  value for that slot and keep drawing. */
const lastParam = new WeakMap();
function evalParam(v, ctx) {
  if (typeof v === "number") return v;
  if (typeof v === "function") {
    try {
      const n = Number(v(ctx));
      if (Number.isFinite(n)) {
        lastParam.set(v, n);
        return n;
      }
      return lastParam.get(v) ?? 0;
    } catch {
      return lastParam.get(v) ?? 0;
    }
  }
  if (Array.isArray(v)) {
    try {
      return seqValue(v, ctx);
    } catch {
      return 0;
    }
  }
  return 0;
}

/** Hydra patches Array.prototype for sequence modifiers; so do we (guarded,
 *  non-enumerable — the same trade Hydra makes, for the same drop-in reason). */
function patchArrays() {
  const mods = {
    fast(s = 1) { this._speed = s; return this; },
    slow(s = 1) { this._speed = 1 / s; return this; },
    smooth(s = 1) { this._smooth = s; return this; },
    ease(e) { this._smooth = this._smooth ?? 1; this._ease = typeof e === "function" ? e : EASE[e] ?? EASE.linear; return this; },
    offset(o = 0.5) { this._offset = o % 1; return this; },
    fit(low = 0, high = 1) {
      const mn = Math.min(...this), mx = Math.max(...this);
      const m = this.map((v) => ((v - mn) / (mx - mn || 1)) * (high - low) + low);
      m._speed = this._speed; m._smooth = this._smooth; m._ease = this._ease; m._offset = this._offset;
      return m;
    },
  };
  for (const [k, f] of Object.entries(mods)) {
    if (!(k in Array.prototype)) {
      Object.defineProperty(Array.prototype, k, { value: f, writable: true, configurable: true });
    }
  }
}

class Chain {
  constructor(z, node) {
    this.z = z;
    this.stack = [node];
  }
  /** Compile this chain and point an output at it (default o0). */
  out(output) {
    this.z._setOutput(output ?? this.z.o0, this);
    return this;
  }
}

for (const def of DEFS) {
  const [name, kind, fn, specs] = def;
  if (kind === "src") continue; // sources live on the synth, not the chain
  Chain.prototype[name] = function (...args) {
    // sum()'s scale is a vec4 in Hydra — `sum([1,1,1,1])` — while every other
    // array argument is a SEQUENCE. Unpack it so Hydra's own call shape works
    // here unchanged (this is also the shape our chain→float conversion uses).
    if (name === "sum" && Array.isArray(args[0])) args = [...args[0]];
    this.stack.push({ def, args });
    return this;
  };
}

class Output {
  constructor(z, i) {
    this.z = z;
    this.i = i;
    this.program = null;
    this._front = 0;
    this._clear = false;
    this._alloc();
  }
  _alloc() {
    const { device, width, height } = this.z;
    const mk = () =>
      device.createTexture({
        size: [width, height],
        format: "rgba8unorm",
        usage:
          GPUTextureUsage.RENDER_ATTACHMENT |
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_SRC,
      });
    this._texs?.forEach((t) => t.destroy());
    this._texs = [mk(), mk()];
    this._views = [this._texs[0].createView(), this._texs[1].createView()];
    this._front = 0;
  }
  get frontView() { return this._views[this._front]; }
  get backView() { return this._views[1 - this._front]; }
  _swap() { this._front = 1 - this._front; }
}

class Source {
  constructor(z, i) {
    this.z = z;
    this.i = i;
    this.media = null;
    this.dynamic = false;
    this._w = 1;
    this._h = 1;
    this._makeTex(1, 1);
  }
  _makeTex(w, h) {
    this.tex?.destroy();
    this.tex = this.z.device.createTexture({
      size: [w, h],
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.view = this.tex.createView();
    this._w = w;
    this._h = h;
  }
  /** Bring your own media: init({ src: videoOrCanvasOrBitmapOrStream, dynamic: true }). */
  init({ src, dynamic = true } = {}) {
    if (typeof MediaStream !== "undefined" && src instanceof MediaStream) {
      this._stream(src);
      return;
    }
    this.media = src;
    this.dynamic = dynamic;
    this._tick(true);
  }
  async initCam(index) {
    const constraints = index != null ? { video: { deviceId: index } } : { video: true };
    this._stream(await navigator.mediaDevices.getUserMedia(constraints));
  }
  async initScreen() {
    this._stream(await navigator.mediaDevices.getDisplayMedia({ video: true }));
  }
  _stream(stream) {
    const v = document.createElement("video");
    v.muted = true;
    v.autoplay = true;
    v.playsInline = true;
    v.srcObject = stream;
    v.play().catch(() => {});
    this.media = v;
    this.dynamic = true;
  }
  async initVideo(url = "") {
    const v = document.createElement("video");
    v.crossOrigin = "anonymous";
    v.muted = true;
    v.loop = true;
    v.autoplay = true;
    v.playsInline = true;
    v.src = url;
    await v.play().catch(() => {});
    this.media = v;
    this.dynamic = true;
  }
  async initImage(url = "") {
    const blob = await fetch(url, { mode: "cors" }).then((r) => r.blob());
    this.media = await createImageBitmap(blob);
    this.dynamic = false;
    this._tick(true);
  }
  clear() {
    this.media = null;
    this.dynamic = false;
    this._makeTex(1, 1);
  }
  _dims() {
    const m = this.media;
    if (!m) return null;
    const w = m.videoWidth ?? m.naturalWidth ?? m.width;
    const h = m.videoHeight ?? m.naturalHeight ?? m.height;
    return w > 0 && h > 0 ? [w, h] : null;
  }
  _tick(force = false) {
    if (!this.media || (!this.dynamic && !force)) return;
    if (this.media.readyState != null && this.media.readyState < 2) return;
    const d = this._dims();
    if (!d) return;
    if (d[0] !== this._w || d[1] !== this._h) this._makeTex(d[0], d[1]);
    this.z.device.queue.copyExternalImageToTexture(
      { source: this.media },
      { texture: this.tex },
      [this._w, this._h]
    );
  }
}

/**
 * Audio reactivity — Hydra's `a` object, WebAudio AnalyserNode under the hood
 * (no Meyda dependency). a.fft[n] gives 0..1 per bin, with Hydra's knobs:
 * setBins / setCutoff / setScale / setSmooth, show()/hide() overlay.
 *
 * The upgrade over Hydra: init() takes ANY source — nothing (microphone),
 * a MediaStream, an HTMLMediaElement, or an AudioNode. Handing it an engine's
 * output node (e.g. zaltz's AudioWorkletNode) makes the visuals react to the
 * music itself, no mic loopback, sample-accurate to what's actually playing.
 */
class Audio {
  constructor(z) {
    this.z = z;
    this.bins = 4;
    this.cutoff = 2;
    this.scale = 10;
    this.smooth = 0.4;
    this.max = 15;
    this.fft = [0, 0, 0, 0];
    this._prev = [0, 0, 0, 0];
    this._analyser = null;
    this._ctx = null;
    this._canvas = null;
  }
  /** init() → microphone; init({ source }) → MediaStream | HTMLMediaElement |
   *  AudioNode (analysed in its own context — nothing is rerouted). */
  async init(opts = {}) {
    const src = opts.source;
    if (src && typeof src.connect === "function" && src.context) {
      // an AudioNode — tap it where it lives
      this._ctx = src.context;
      this._owns = false;
      this._analyser = this._ctx.createAnalyser();
      src.connect(this._analyser);
    } else {
      this._ctx = new (window.AudioContext ?? window.webkitAudioContext)();
      this._owns = true;
      this._analyser = this._ctx.createAnalyser();
      if (typeof HTMLMediaElement !== "undefined" && src instanceof HTMLMediaElement) {
        const node = this._ctx.createMediaElementSource(src);
        node.connect(this._analyser);
        node.connect(this._ctx.destination);
      } else {
        const stream = src ?? (await navigator.mediaDevices.getUserMedia({ audio: true }));
        this._ctx.createMediaStreamSource(stream).connect(this._analyser);
      }
      this._ctx.resume?.().catch(() => {});
    }
    this._analyser.fftSize = 1024;
    this._analyser.smoothingTimeConstant = 0; // we smooth ourselves, Hydra-style
    this._data = new Uint8Array(this._analyser.frequencyBinCount);
    this.setBins(this.bins);
    return this;
  }
  setBins(n = 4) {
    this.bins = n;
    this.fft = new Array(n).fill(0);
    this._prev = new Array(n).fill(0);
    return this;
  }
  setCutoff(c = 2) { this.cutoff = c; return this; }
  setScale(s = 10) { this.scale = s; return this; }
  setSmooth(s = 0.4) { this.smooth = s; return this; }
  show() {
    if (!this._canvas) {
      const c = document.createElement("canvas");
      c.width = 100;
      c.height = 80;
      c.style.cssText = "position:fixed;right:8px;bottom:8px;background:rgba(0,0,0,.5);z-index:10";
      document.body.appendChild(c);
      this._canvas = c;
    }
    this._canvas.style.display = "block";
    return this;
  }
  hide() {
    if (this._canvas) this._canvas.style.display = "none";
    return this;
  }
  _tick() {
    if (!this._analyser) return;
    this._analyser.getByteFrequencyData(this._data);
    const chunk = Math.floor(this._data.length / this.bins) || 1;
    for (let i = 0; i < this.bins; i++) {
      let sum = 0;
      for (let k = 0; k < chunk; k++) sum += this._data[i * chunk + k];
      const loud = (sum / chunk / 255) * this.max; // ≈ Hydra's sones range
      const sm = (this._prev[i] ?? 0) * this.smooth + loud * (1 - this.smooth);
      this._prev[i] = sm;
      this.fft[i] = Math.max(0, Math.min(1, (sm - this.cutoff) / this.scale));
    }
    if (this._canvas && this._canvas.style.display !== "none") {
      const g = this._canvas.getContext("2d");
      const { width: w, height: h } = this._canvas;
      g.clearRect(0, 0, w, h);
      g.fillStyle = "#7c63ff";
      const bw = w / this.bins;
      for (let i = 0; i < this.bins; i++) {
        g.fillRect(i * bw + 1, h - this.fft[i] * h, bw - 2, this.fft[i] * h);
      }
    }
  }
}

/**
 * THE SWARM — zissl's proof that the new machine matters. A physarum colony
 * on compute shaders: agents in storage buffers sense the trail field AND the
 * living picture (any output), steer toward light, deposit as they walk; a
 * blur/decay pass grows the deposits into filaments. The trail feeds back
 * into the language as an ordinary source. Hydra's WebGL has no compute —
 * this layer is simply outside its physics.
 *
 * One system per synth (like Hydra's one `a`): swarm(...) configures it and
 * returns a chain sampling its trail.
 */
class Swarm {
  constructor(z) {
    this.z = z;
    this.active = false;
    this.count = 0;
    this.speed = 1;
    this.turn = 1;
    this.senseAng = 0.4;
    this.senseDist = 9;
    this.decay = 0.92;
    // Relative deposit: 1.0 holds the field's mean around ~0.35 at ANY agent
    // count, resolution or decay (see _tick) — lanes concentrate 10–100× the
    // mean and clamp bright; the background falls dark. Without this
    // normalization a fresh uniform colony saturates the whole field before
    // lanes can form, and a flat field has no gradients to follow — a trap.
    this.deposit = 1;
    this.steerAmt = 1.2;
    this.steer = null;
    this._front = 0;
  }
  /** swarm(count, steer, speed, turn) — the language entry configures here. */
  config(count, steer, speed, turn) {
    const n = Math.max(1, Math.min(2_000_000, Math.floor(Number(count) || 200_000)));
    if (!this._movePipe) this._build();
    if (n !== this.count) this._makeAgents(n);
    this.steer = steer ?? null;
    if (speed != null) this.speed = Number(speed) || 1;
    if (turn != null) this.turn = Number(turn) || 1;
    this.active = true;
  }
  /** Sampled by chains like a Source; repeat sampler suits the toroidal field. */
  get frontView() { return this._views?.[this._front]; }
  _build() {
    const { device } = this.z;
    // Same one file of WGSL; kernels live at @group(1), invisible to render.
    const code = `struct ZU {
  res: vec2f, time: f32, bpm: f32, mouse: vec2f, pad0: vec2f, p: array<vec4f, 1>,
}
@group(0) @binding(0) var<uniform> U: ZU;
${LIB}`;
    const module = device.createShaderModule({ code });
    this._movePipe = device.createComputePipeline({
      layout: "auto",
      compute: { module, entryPoint: "zk_move" },
    });
    this._blurPipe = device.createComputePipeline({
      layout: "auto",
      compute: { module, entryPoint: "zk_blur" },
    });
    this._ubuf = device.createBuffer({
      size: 48,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this._ucpu = new Float32Array(12);
    this._black = device.createTexture({
      size: [1, 1],
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    this._blackView = this._black.createView();
    this._alloc();
  }
  _alloc() {
    const { device, width, height } = this.z;
    this._texs?.forEach((t) => t.destroy());
    this._fieldBuf?.destroy();
    this._texs = [0, 1].map(() =>
      device.createTexture({
        size: [width, height],
        format: "rgba8unorm",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING,
      })
    );
    this._views = this._texs.map((t) => t.createView());
    this._fieldBuf = device.createBuffer({
      size: width * height * 4,
      usage: GPUBufferUsage.STORAGE,
    });
    this._w = width;
    this._h = height;
    this._front = 0;
  }
  _makeAgents(n) {
    const { device, width, height } = this.z;
    this._agentBuf?.destroy();
    const data = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      data[i * 4] = Math.random() * width;
      data[i * 4 + 1] = Math.random() * height;
      data[i * 4 + 2] = Math.random() * Math.PI * 2;
      data[i * 4 + 3] = Math.random();
    }
    this._agentBuf = device.createBuffer({
      size: data.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this._agentBuf, 0, data);
    this.count = n;
  }
  _tick(encoder, dt) {
    if (!this.active || !this.count) return;
    if (this._w !== this.z.width || this._h !== this.z.height) this._alloc();
    const { device } = this.z;
    const u = this._ucpu;
    u[0] = this.count; u[1] = this._w; u[2] = this._h; u[3] = Math.min(dt || 0.016, 0.1);
    u[4] = this.speed; u[5] = this.turn; u[6] = this.senseAng; u[7] = this.senseDist;
    u[8] = this.decay;
    u[9] = this.deposit * 0.35 * (1 - this.decay) * ((this._w * this._h) / this.count);
    u[10] = this.steer ? this.steerAmt : 0;
    u[11] = this.z.time;
    device.queue.writeBuffer(this._ubuf, 0, u);
    const steerView =
      (this.steer && (this.steer.frontView ?? this.steer.view)) ?? this._blackView;
    const moveBind = device.createBindGroup({
      layout: this._movePipe.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: { buffer: this._ubuf } },
        { binding: 1, resource: { buffer: this._agentBuf } },
        { binding: 2, resource: { buffer: this._fieldBuf } },
        { binding: 3, resource: this._views[this._front] },
        { binding: 5, resource: steerView },
      ],
    });
    const blurBind = device.createBindGroup({
      layout: this._blurPipe.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: { buffer: this._ubuf } },
        { binding: 2, resource: { buffer: this._fieldBuf } },
        { binding: 3, resource: this._views[this._front] },
        { binding: 4, resource: this._views[1 - this._front] },
      ],
    });
    const pass = encoder.beginComputePass();
    pass.setPipeline(this._movePipe);
    pass.setBindGroup(1, moveBind);
    pass.dispatchWorkgroups(Math.ceil(this.count / 256));
    pass.setPipeline(this._blurPipe);
    pass.setBindGroup(1, blurBind);
    pass.dispatchWorkgroups(Math.ceil(this._w / 8), Math.ceil(this._h / 8));
    pass.end();
    this._front = 1 - this._front;
  }
}

const BLIT_VS = `
struct VO { @builtin(position) pos: vec4f, @location(0) uv: vec2f }
@vertex fn zvs(@builtin(vertex_index) vi: u32) -> VO {
  var p = array<vec2f, 3>(vec2f(-1.0, -3.0), vec2f(3.0, 1.0), vec2f(-1.0, 1.0));
  var o: VO;
  o.pos = vec4f(p[vi], 0.0, 1.0);
  o.uv = vec2f(p[vi].x, -p[vi].y) * 0.5 + vec2f(0.5);
  return o;
}`;

const BLIT_ONE = BLIT_VS + `
@group(0) @binding(0) var s: sampler;
@group(0) @binding(1) var t: texture_2d<f32>;
@fragment fn zfs(inp: VO) -> @location(0) vec4f {
  return vec4f(textureSample(t, s, inp.uv).rgb, 1.0);
}`;

const BLIT_FOUR = BLIT_VS + `
@group(0) @binding(0) var s: sampler;
@group(0) @binding(1) var t0: texture_2d<f32>;
@group(0) @binding(2) var t1: texture_2d<f32>;
@group(0) @binding(3) var t2: texture_2d<f32>;
@group(0) @binding(4) var t3: texture_2d<f32>;
@fragment fn zfs(inp: VO) -> @location(0) vec4f {
  let g = inp.uv * 2.0;
  let cell = fract(g);
  let ix = clamp(i32(g.x), 0, 1) + 2 * clamp(i32(g.y), 0, 1);
  let a = textureSample(t0, s, cell);
  let b = textureSample(t1, s, cell);
  let c = textureSample(t2, s, cell);
  let d = textureSample(t3, s, cell);
  var outc = a;
  if (ix == 1) { outc = b; }
  if (ix == 2) { outc = c; }
  if (ix == 3) { outc = d; }
  return vec4f(outc.rgb, 1.0);
}`;

export class Zissl {
  /** @private — use Zissl.create() */
  constructor(device, canvas, opts) {
    this.device = device;
    this.canvas = canvas;
    // Floor at 1 — a canvas measured mid-layout can report 0, and a 0-sized
    // texture poisons every pass that touches it.
    this.width = Math.max(1, Math.floor(opts.width ?? canvas.width ?? 1280)) || 1280;
    this.height = Math.max(1, Math.floor(opts.height ?? canvas.height ?? 720)) || 720;
    canvas.width = this.width;
    canvas.height = this.height;

    this.time = 0;
    this.speed = 1;
    this.bpm = 30;
    this.fps = undefined; // set to cap the render rate, Hydra-style
    this.mouse = { x: 0, y: 0 };
    // Hydra's per-frame hooks, same signature (dt in MILLISECONDS) and same
    // order: update() before the frame is built, afterUpdate() once it's queued.
    this.update = null;
    this.afterUpdate = null;
    this.stats = { fps: 0 };
    this.onerror = null;
    this.a = new Audio(this);
    this._timeFn = null; // external transport for H(), in cycles
    this._reify = null; // host's string → pattern parser (mini-notation in H)
    this.H = this.H.bind(this);
    this._userFns = [];
    this._defs = new Map(DEFS.map((d) => [d[0], d]));

    this.gpuctx = canvas.getContext("webgpu");
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.gpuctx.configure({ device, format: this.format, alphaMode: "opaque" });

    // Outputs sample nearest+clamp — hydra's exact regl fbo params (measured
    // by the harness; linear+repeat here visibly diverges under modulate).
    this.sampRepeat = device.createSampler({
      addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge", magFilter: "nearest", minFilter: "nearest",
    });
    // Linear+clamp — the canvas blit (an upscaled low-res render must not look
    // like a mosaic), and external sources when a host asks for smoothing.
    this.sampClamp = device.createSampler({
      addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge", magFilter: "linear", minFilter: "linear",
    });
    // EXTERNAL SOURCES DEFAULT TO NEAREST — hydra's regl textures are nearest,
    // and the golden gate caught the difference the moment a camera/canvas was
    // sampled through a coordinate warp (kaleid on s0: MAE 2.45, corr 0.984).
    // Pass sourceFilter: "linear" to trade that parity for smoother video.
    this.sampSrc = opts.sourceFilter === "linear" ? this.sampClamp : this.sampRepeat;

    this.o0 = new Output(this, 0);
    this.o1 = new Output(this, 1);
    this.o2 = new Output(this, 2);
    this.o3 = new Output(this, 3);
    this.s0 = new Source(this, 0);
    this.s1 = new Source(this, 1);
    this.s2 = new Source(this, 2);
    this.s3 = new Source(this, 3);
    this._outputs = [this.o0, this.o1, this.o2, this.o3];
    this._sources = [this.s0, this.s1, this.s2, this.s3];
    this._renderOut = this.o0; // render() with no arg → 2×2 grid, like Hydra

    // source functions live on the instance: z.osc(...), z.noise(...)
    for (const def of DEFS) {
      if (def[1] !== "src") continue;
      const name = def[0];
      this[name] = (...args) => new Chain(this, { def, args });
    }

    // The compute layer: one swarm per synth, spoken as a source.
    this._swarmSys = new Swarm(this);
    this.swarm = (count, steer, speed, turn) => {
      this._swarmSys.config(count, steer, speed, turn);
      return this.src(this._swarmSys);
    };
    // the deeper knobs: swarm.tune({ deposit, decay, senseAng, senseDist, steerAmt })
    this.swarm.tune = (opts = {}) => {
      for (const k of ["deposit", "decay", "senseAng", "senseDist", "steerAmt", "speed", "turn"]) {
        if (typeof opts[k] === "number") this._swarmSys[k] = opts[k];
      }
      return this.swarm;
    };

    const blitOne = device.createShaderModule({ code: BLIT_ONE });
    const blitFour = device.createShaderModule({ code: BLIT_FOUR });
    const mkBlit = (module) =>
      device.createRenderPipeline({
        layout: "auto",
        vertex: { module, entryPoint: "zvs" },
        fragment: { module, entryPoint: "zfs", targets: [{ format: this.format }] },
        primitive: { topology: "triangle-list" },
      });
    this._blitOne = mkBlit(blitOne);
    this._blitFour = mkBlit(blitFour);

    this._onMouse = (e) => {
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      this.mouse.x = ((e.clientX - r.left) / r.width) * this.width;
      this.mouse.y = ((e.clientY - r.top) / r.height) * this.height;
    };
    window.addEventListener("pointermove", this._onMouse);

    device.lost.then((info) => {
      if (info.reason !== "destroyed" && this.onerror) {
        this.onerror("zissl: GPU device lost — recreate the engine (" + info.message + ")");
      }
    });

    patchArrays();

    this._running = true;
    this._last = 0;
    // autoLoop: false hands the clock to the host — drive with z.tick(dtMs).
    // (Hydra has the same switch, for hosts that own their render loop.)
    this._autoLoop = opts.autoLoop !== false;
    if (this._autoLoop) this._raf = requestAnimationFrame((t) => this._frame(t));
  }

  /**
   * Boot the engine on a canvas. WebGPU only — there is deliberately no
   * WebGL fallback; Hydra itself is the WebGL path.
   *
   * @param {{ canvas?: HTMLCanvasElement, width?: number, height?: number,
   *           makeGlobal?: boolean }} [opts]
   *   makeGlobal installs the Hydra globals (osc, noise, o0.., render, …)
   *   on globalThis, exactly like Hydra's default mode.
   * @returns {Promise<Zissl>}
   */
  static async create(opts = {}) {
    if (!navigator.gpu) throw new Error("zissl: WebGPU is not available in this browser");
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error("zissl: no WebGPU adapter");
    const device = await adapter.requestDevice();
    let canvas = opts.canvas;
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.width = opts.width ?? 1280;
      canvas.height = opts.height ?? 720;
      document.body.appendChild(canvas);
    }
    const z = new Zissl(device, canvas, opts);
    if (opts.makeGlobal) z.install();
    return z;
  }

  /** Point the canvas at one output — or at the 2×2 grid of all four. */
  render(output) {
    this._renderOut = output ?? null;
  }

  /** Black, everywhere, now. Programs drop; feedback buffers clear. */
  hush() {
    for (const o of this._outputs) {
      o.program = null;
      o._clear = true;
    }
    this._swarmSys.active = false; // sketches re-arm it by calling swarm()
  }

  setResolution(width, height) {
    this.width = Math.max(1, Math.floor(width)) || 1;
    this.height = Math.max(1, Math.floor(height)) || 1;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    for (const o of this._outputs) o._alloc();
  }

  /**
   * Register a custom transform, Hydra setFunction-style — but the body is
   * WGSL. `wgsl` must define a function named exactly `name` with the right
   * shape for its kind (see engine/zissl.wgsl for the house style).
   */
  setFunction({ name, type, inputs = [], wgsl }) {
    const def = [name, type, name, inputs.map((i) => [i.name, i.default ?? 0])];
    this._defs.set(name, def);
    this._userFns.push(wgsl);
    if (type === "src") {
      this[name] = (...args) => new Chain(this, { def, args });
      if (this._installed) this._installed[name] = this[name];
    } else {
      Chain.prototype[name] = function (...args) {
        this.stack.push({ def, args });
        return this;
      };
    }
  }

  /**
   * THE STRUDEL BRIDGE. Point H's transport at your scheduler's clock, in
   * CYCLES — the same clock your audio engine plays from — and every H(pat)
   * param samples the pattern at that exact musical moment, frame by frame:
   *
   *   z.setTime(() => scheduler.now());          // cycles
   *   osc(4, 0, 1).rotate(H(saw.slow(8))).out(o0);
   *
   * Unset, H falls back to zissl's own clock (time · bpm/60). Note that
   * @strudel/hydra's H also works against zissl UNCHANGED — its thunks are
   * valid params — this built-in just removes the dependency and the
   * global-time plumbing.
   */
  setTime(fn) {
    this._timeFn = typeof fn === "function" ? fn : null;
    return this;
  }

  /** Teach H how to read a STRING. Hand it Strudel's `reify` (or any
   *  string → pattern parser) and mini-notation works in a param slot:
   *  `H("<0!4 1!8>")`. Without it, a string is just a number-ish value —
   *  which is how a section gate silently reads 0 forever. */
  setReify(fn) {
    this._reify = typeof fn === "function" ? fn : null;
    return this;
  }

  /** Strudel pattern (anything with queryArc) → per-frame param. Also accepts
   *  mini-notation (with setReify), a plain function of cycle time, or a
   *  number (passthrough). */
  H(p) {
    const now = () => (this._timeFn ? this._timeFn() : this.time * (this.bpm / 60));
    if (typeof p === "string") {
      const parse = this._reify ?? globalThis.reify;
      const pat = typeof parse === "function" ? parse(p) : null;
      if (pat && typeof pat.queryArc === "function") p = pat;
    }
    if (typeof p === "number") return () => p;
    if (p && typeof p.queryArc === "function") {
      return () => {
        const t = now();
        const hap = p.queryArc(t, t)[0];
        const val = hap && hap.value;
        return typeof val === "number" ? val : Number(val) || 0;
      };
    }
    if (typeof p === "function") return () => Number(p(now())) || 0;
    return () => 0;
  }

  /** Read an output's current frame as ImageData (defaults to what's on
   *  screen). This is the honest pixel path — WebGPU canvases don't readback
   *  through 2d drawImage — and the future golden-gate harness against Hydra. */
  async readPixels(output) {
    const o = output ?? this._renderOut ?? this.o0;
    const { device, width, height } = this;
    const bpr = Math.ceil((width * 4) / 256) * 256;
    const buf = device.createBuffer({
      size: bpr * height,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const encoder = device.createCommandEncoder();
    encoder.copyTextureToBuffer(
      { texture: o._texs[o._front] },
      { buffer: buf, bytesPerRow: bpr, rowsPerImage: height },
      [width, height]
    );
    device.queue.submit([encoder.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const src = new Uint8Array(buf.getMappedRange());
    const out = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      out.set(src.subarray(y * bpr, y * bpr + width * 4), y * width * 4);
    }
    buf.unmap();
    buf.destroy();
    return new ImageData(out, width, height);
  }

  /** Hydra's screencap(): download the current frame as a PNG. */
  async screencap() {
    const img = await this.readPixels();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    c.getContext("2d").putImageData(img, 0, 0);
    const link = document.createElement("a");
    link.download = `zissl-${Date.now()}.png`;
    link.href = c.toDataURL("image/png");
    link.click();
  }

  /** Hydra mode: put the whole vocabulary on globalThis (or your own object). */
  install(target = globalThis) {
    this._installed = target;
    for (const def of DEFS) if (def[1] === "src") target[def[0]] = this[def[0]];
    target.swarm = this.swarm;
    for (const k of ["o0", "o1", "o2", "o3", "s0", "s1", "s2", "s3"]) target[k] = this[k];
    target.render = (o) => this.render(o);
    target.hush = () => this.hush();
    target.setResolution = (w, h) => this.setResolution(w, h);
    target.setFunction = (d) => this.setFunction(d);
    target.setTime = (fn) => this.setTime(fn);
    target.screencap = () => this.screencap();
    target.a = this.a;
    target.H = this.H;
    target.zissl = this;
    const z = this;
    for (const [k, get, set] of [
      ["time", () => z.time, (v) => (z.time = v)],
      ["speed", () => z.speed, (v) => (z.speed = v)],
      ["bpm", () => z.bpm, (v) => (z.bpm = v)],
      ["fps", () => z.fps, (v) => (z.fps = v)],
      // Hydra's per-frame hooks are PAGE globals you assign to — `update = (dt)
      // => {}` — so they have to write through to the instance, not shadow it.
      ["update", () => z.update, (v) => (z.update = typeof v === "function" ? v : null)],
      ["afterUpdate", () => z.afterUpdate, (v) => (z.afterUpdate = typeof v === "function" ? v : null)],
      ["stats", () => z.stats, undefined],
      ["mouse", () => z.mouse, undefined],
      ["width", () => z.width, undefined],
      ["height", () => z.height, undefined],
    ]) {
      try {
        Object.defineProperty(target, k, { get, set, configurable: true });
      } catch { /* target may have a non-configurable slot — skip it */ }
    }
    return this;
  }

  /** Stop the loop and free the device. */
  dispose() {
    this._running = false;
    cancelAnimationFrame(this._raf);
    window.removeEventListener("pointermove", this._onMouse);
    if (this.a._owns) this.a._ctx?.close?.().catch(() => {});
    this.a._canvas?.remove();
    this.device.destroy();
  }

  // ------------------------------------------------------------ internals

  _setOutput(output, chain) {
    const token = (output._token = (output._token ?? 0) + 1);
    const inflight = this._compile(chain, output)
      .then((program) => {
        if (program && output._token === token) output.program = program;
      })
      .catch((e) => {
        if (this.onerror) this.onerror(String(e));
        else console.error(e);
      })
      .finally(() => this._inflight.delete(inflight));
    (this._inflight ??= new Set()).add(inflight);
  }

  /** Resolves once every .out() issued so far has finished compiling —
   *  deterministic hosts (tests, offline renders) await this before tick(). */
  async ready() {
    while (this._inflight?.size) await Promise.all([...this._inflight]);
  }

  /** Chain → WGSL: walk transforms back-to-front so coord warps compose
   *  screen-first, then emit the source sample, then colors forward. */
  async _compile(chain, target) {
    const device = this.device;
    const params = [];
    const texRefs = [];
    const lines = [];
    let v = 0;

    const pslot = (val) => {
      const i = params.length;
      params.push(val);
      return `U.p[${i >> 2}].${"xyzw"[i & 3]}`;
    };
    const tref = (ref) => {
      let i = texRefs.indexOf(ref);
      if (i < 0) {
        i = texRefs.length;
        texRefs.push(ref);
      }
      return i;
    };
    const emitTex = (ref, stv) => {
      const samp = ref instanceof Source ? "zsampc" : "zsampr";
      return `zt_tex(ztex${tref(ref)}, ${samp}, ${stv})`;
    };
    // A CHAIN IN A NUMBER'S SLOT — Hydra's own conversion (format-arguments.js
    // turns a GlslSource in a float input into `sum([1,1,1,1])`), so
    // `osc(10).rotate(noise(3))` reads the picture as the angle. We do it in
    // WGSL at the same coordinate: sample the chain here, add its channels.
    const asScalar = (x, stv) => {
      const c = emitArg(x, stv);
      const s = `v${v++}`;
      // A chain that ALREADY ends in sum() has done the adding — zc_sum
      // broadcasts its scalar to every channel, so summing again would
      // quadruple it (`.rotate(noise().sum([1,1,1,1]))` vs `.rotate(noise())`
      // must be the same picture; the golden gate measures exactly that).
      const last = x instanceof Chain ? x.stack[x.stack.length - 1]?.def?.[0] : null;
      lines.push(last === "sum" ? `let ${s} = ${c}.r;` : `let ${s} = ${c}.r + ${c}.g + ${c}.b + ${c}.a;`);
      return s;
    };
    const isTexArg = (x) =>
      x instanceof Chain || x instanceof Output || x instanceof Source || x instanceof Swarm;
    // All of def's scalar specs, reading user args at argOffset+k — combine
    // kinds carry their texture as args[0], so their scalars start at 1.
    const scalars = (def, args, argOffset, stv) =>
      def[3]
        .map((spec, k) => {
          const arg = args[argOffset + k];
          return ", " + (isTexArg(arg) ? asScalar(arg, stv) : pslot(arg ?? spec[1]));
        })
        .join("");

    const emitArg = (x, stv) => {
      if (x instanceof Chain) return emitNode(x.stack, x.stack.length - 1, stv);
      if (x instanceof Output || x instanceof Source || x instanceof Swarm) {
        const c = `v${v++}`;
        lines.push(`let ${c} = ${emitTex(x, stv)};`);
        return c;
      }
      throw new Error("zissl: expected a chain, output or source as texture argument");
    };

    const emitNode = (stack, i, stv) => {
      const { def, args } = stack[i];
      const [name, kind, fn] = def;
      switch (kind) {
        case "src": {
          const c = `v${v++}`;
          if (name === "src" || name === "prev") {
            // prev() = this output's own last frame: the same ping-pong read
            // src(o0) does, without having to name the output you're in.
            const ref = name === "prev" ? (target ?? this.o0) : args[0];
            if (!(ref instanceof Output || ref instanceof Source || ref instanceof Swarm)) {
              throw new Error("zissl: src() takes an output (o0..o3), source (s0..s3) or the swarm");
            }
            lines.push(`let ${c} = ${emitTex(ref, stv)};`);
          } else if (name === "solid") {
            lines.push(
              `let ${c} = zs_solid(${def[3]
                .map((s, k) => (isTexArg(args[k]) ? asScalar(args[k], stv) : pslot(args[k] ?? s[1])))
                .join(", ")});`,
            );
          } else {
            lines.push(`let ${c} = ${fn}(${stv}${scalars(def, args, 0, stv)});`);
          }
          return c;
        }
        case "coord": {
          const s2 = `v${v++}`;
          lines.push(`let ${s2} = ${fn}(${stv}${scalars(def, args, 0, stv)});`);
          return emitNode(stack, i - 1, s2);
        }
        case "color": {
          const c0 = emitNode(stack, i - 1, stv);
          const c = `v${v++}`;
          lines.push(`let ${c} = ${fn}(${c0}${scalars(def, args, 0, stv)});`);
          return c;
        }
        case "combine": {
          const c0 = emitNode(stack, i - 1, stv);
          const c1 = emitArg(args[0] ?? this.o0, stv);
          const c = `v${v++}`;
          lines.push(`let ${c} = ${fn}(${c0}, ${c1}${scalars(def, args, 1, stv)});`);
          return c;
        }
        case "combineCoord": {
          const c1 = emitArg(args[0] ?? this.o0, stv);
          const s2 = `v${v++}`;
          lines.push(`let ${s2} = ${fn}(${stv}, ${c1}${scalars(def, args, 1, stv)});`);
          return emitNode(stack, i - 1, s2);
        }
      }
    };

    const cfinal = emitNode(chain.stack, chain.stack.length - 1, "st");
    const np = Math.max(1, Math.ceil(params.length / 4));
    const texDecls = texRefs
      .map((_, i) => `@group(0) @binding(${3 + i}) var ztex${i}: texture_2d<f32>;`)
      .join("\n");

    const code = `struct ZU {
  res: vec2f,
  time: f32,
  bpm: f32,
  mouse: vec2f,
  pad0: vec2f,
  p: array<vec4f, ${np}>,
}
@group(0) @binding(0) var<uniform> U: ZU;
@group(0) @binding(1) var zsampr: sampler;
@group(0) @binding(2) var zsampc: sampler;
${texDecls}
${LIB}
${this._userFns.join("\n")}
@vertex fn zvs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 3>(vec2f(-1.0, -3.0), vec2f(3.0, 1.0), vec2f(-1.0, 1.0));
  return vec4f(p[vi], 0.0, 1.0);
}
@fragment fn zfs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let st = vec2f(pos.x / U.res.x, pos.y / U.res.y);
${lines.map((l) => "  " + l).join("\n")}
  return ${cfinal};
}`;

    device.pushErrorScope("validation");
    const module = device.createShaderModule({ code });
    const bgl = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        ...texRefs.map((_, i) => ({
          binding: 3 + i,
          visibility: GPUShaderStage.FRAGMENT,
          texture: {},
        })),
      ],
    });
    const pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [bgl] }),
      vertex: { module, entryPoint: "zvs" },
      fragment: { module, entryPoint: "zfs", targets: [{ format: "rgba8unorm" }] },
      primitive: { topology: "triangle-list" },
    });
    const err = await device.popErrorScope();
    if (err) {
      throw new Error("zissl: shader failed to compile — " + err.message + "\n\n" + code);
    }

    const ubuf = device.createBuffer({
      size: 32 + np * 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    return { pipeline, bgl, ubuf, cpu: new Float32Array(8 + np * 4), params, texRefs, code };
  }

  _frame(tms) {
    if (!this._running) return;
    this._raf = requestAnimationFrame((t) => this._frame(t));
    // fps cap: skip the frame entirely; dt accrues so time stays truthful
    if (this.fps && this._last && tms - this._last < 1000 / this.fps - 0.5) return;
    const dtMs = this._last ? tms - this._last : 0;
    this._last = tms;
    this._step(dtMs);
  }

  /** Advance one frame by hand (autoLoop: false hosts). dt in milliseconds. */
  tick(dtMs = 16.666) {
    this._step(dtMs);
  }

  _step(dtMs) {
    const dt = dtMs / 1000;
    // A page global named `speed` is contested territory (Strudel stamps its
    // control function over it) — never let a non-number poison the clock.
    const sp = Number(this.speed);
    this.time += dt * (Number.isFinite(sp) ? sp : 1);
    if (!Number.isFinite(this.time)) this.time = 0;
    this.a._tick();
    this.stats.fps = dt > 0 ? Math.round(1 / dt) : this.stats.fps;
    // Hydra's per-frame hooks. They run user code — a throw here would kill the
    // rAF loop for the session, so they never escape their own frame.
    if (this.update) {
      try { this.update(dtMs); } catch (e) { this._hookError(e); }
    }

    const ctx = {
      time: this.time,
      bpm: this.bpm,
      width: this.width,
      height: this.height,
      mouse: this.mouse,
    };

    for (const s of this._sources) s._tick();

    const device = this.device;
    const encoder = device.createCommandEncoder();
    this._swarmSys._tick(encoder, dt); // compute first — chains sample fresh trail
    const drew = [];

    for (const o of this._outputs) {
      if (o._clear) {
        for (const view of o._views) {
          encoder
            .beginRenderPass({
              colorAttachments: [{ view, loadOp: "clear", storeOp: "store", clearValue: { r: 0, g: 0, b: 0, a: 0 } }],
            })
            .end();
        }
        o._clear = false;
      }
      const prog = o.program;
      if (!prog) continue;

      const cpu = prog.cpu;
      cpu[0] = this.width;
      cpu[1] = this.height;
      cpu[2] = this.time;
      cpu[3] = this.bpm;
      cpu[4] = this.mouse.x;
      cpu[5] = this.mouse.y;
      for (let i = 0; i < prog.params.length; i++) cpu[8 + i] = evalParam(prog.params[i], ctx);
      device.queue.writeBuffer(prog.ubuf, 0, cpu);

      const bind = device.createBindGroup({
        layout: prog.bgl,
        entries: [
          { binding: 0, resource: { buffer: prog.ubuf } },
          { binding: 1, resource: this.sampRepeat },
          { binding: 2, resource: this.sampSrc },
          ...prog.texRefs.map((ref, i) => ({
            binding: 3 + i,
            resource: ref.frontView ?? ref.view,
          })),
        ],
      });

      const pass = encoder.beginRenderPass({
        colorAttachments: [{ view: o.backView, loadOp: "clear", storeOp: "store", clearValue: { r: 0, g: 0, b: 0, a: 0 } }],
      });
      pass.setPipeline(prog.pipeline);
      pass.setBindGroup(0, bind);
      pass.draw(3);
      pass.end();
      drew.push(o);
    }
    // swap after everything rendered — every read this frame saw last frame,
    // so feedback is deterministic no matter which output reads which
    for (const o of drew) o._swap();

    const canvasView = this.gpuctx.getCurrentTexture().createView();
    const single = this._renderOut;
    const pipeline = single ? this._blitOne : this._blitFour;
    const entries = single
      ? [
          { binding: 0, resource: this.sampClamp },
          { binding: 1, resource: single.frontView },
        ]
      : [
          { binding: 0, resource: this.sampClamp },
          ...this._outputs.map((o, i) => ({ binding: 1 + i, resource: o.frontView })),
        ];
    const bind = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries });
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: canvasView, loadOp: "clear", storeOp: "store", clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bind);
    pass.draw(3);
    pass.end();

    device.queue.submit([encoder.finish()]);

    if (this.afterUpdate) {
      try { this.afterUpdate(dtMs); } catch (e) { this._hookError(e); }
    }
  }

  /** A throw inside update()/afterUpdate() must cost one frame, never the loop. */
  _hookError(e) {
    if (this.onerror) this.onerror(String(e));
    else console.error(e);
  }
}

export default Zissl;
