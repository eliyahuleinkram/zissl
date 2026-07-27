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

function evalParam(v, ctx) {
  if (typeof v === "number") return v;
  if (typeof v === "function") return Number(v(ctx)) || 0;
  if (Array.isArray(v)) return seqValue(v, ctx);
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
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
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
  /** Bring your own media: init({ src: videoOrCanvasOrBitmap, dynamic: true }). */
  init({ src, dynamic = true } = {}) {
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
    this.width = opts.width ?? canvas.width ?? 1280;
    this.height = opts.height ?? canvas.height ?? 720;
    canvas.width = this.width;
    canvas.height = this.height;

    this.time = 0;
    this.speed = 1;
    this.bpm = 30;
    this.mouse = { x: 0, y: 0 };
    this.update = null; // per-frame hook: (dt seconds) => {}
    this.onerror = null;
    this._userFns = [];
    this._defs = new Map(DEFS.map((d) => [d[0], d]));

    this.gpuctx = canvas.getContext("webgpu");
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.gpuctx.configure({ device, format: this.format, alphaMode: "opaque" });

    this.sampRepeat = device.createSampler({
      addressModeU: "repeat", addressModeV: "repeat", magFilter: "linear", minFilter: "linear",
    });
    this.sampClamp = device.createSampler({
      addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge", magFilter: "linear", minFilter: "linear",
    });

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
    this._raf = requestAnimationFrame((t) => this._frame(t));
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
  }

  setResolution(width, height) {
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
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

  /** Hydra mode: put the whole vocabulary on globalThis (or your own object). */
  install(target = globalThis) {
    this._installed = target;
    for (const def of DEFS) if (def[1] === "src") target[def[0]] = this[def[0]];
    for (const k of ["o0", "o1", "o2", "o3", "s0", "s1", "s2", "s3"]) target[k] = this[k];
    target.render = (o) => this.render(o);
    target.hush = () => this.hush();
    target.setResolution = (w, h) => this.setResolution(w, h);
    target.setFunction = (d) => this.setFunction(d);
    target.zissl = this;
    const z = this;
    for (const [k, get, set] of [
      ["time", () => z.time, (v) => (z.time = v)],
      ["speed", () => z.speed, (v) => (z.speed = v)],
      ["bpm", () => z.bpm, (v) => (z.bpm = v)],
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
    this.device.destroy();
  }

  // ------------------------------------------------------------ internals

  _setOutput(output, chain) {
    const token = (output._token = (output._token ?? 0) + 1);
    this._compile(chain)
      .then((program) => {
        if (program && output._token === token) output.program = program;
      })
      .catch((e) => {
        if (this.onerror) this.onerror(String(e));
        else console.error(e);
      });
  }

  /** Chain → WGSL: walk transforms back-to-front so coord warps compose
   *  screen-first, then emit the source sample, then colors forward. */
  async _compile(chain) {
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
    // All of def's scalar specs, reading user args at argOffset+k — combine
    // kinds carry their texture as args[0], so their scalars start at 1.
    const scalars = (def, args, argOffset) =>
      def[3].map((spec, k) => ", " + pslot(args[argOffset + k] ?? spec[1])).join("");

    const emitArg = (x, stv) => {
      if (x instanceof Chain) return emitNode(x.stack, x.stack.length - 1, stv);
      if (x instanceof Output || x instanceof Source) {
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
          if (name === "src") {
            const ref = args[0];
            if (!(ref instanceof Output || ref instanceof Source)) {
              throw new Error("zissl: src() takes an output (o0..o3) or source (s0..s3)");
            }
            lines.push(`let ${c} = ${emitTex(ref, stv)};`);
          } else if (name === "solid") {
            lines.push(`let ${c} = zs_solid(${def[3].map((s, k) => pslot(args[k] ?? s[1])).join(", ")});`);
          } else {
            lines.push(`let ${c} = ${fn}(${stv}${scalars(def, args, 0)});`);
          }
          return c;
        }
        case "coord": {
          const s2 = `v${v++}`;
          lines.push(`let ${s2} = ${fn}(${stv}${scalars(def, args, 0)});`);
          return emitNode(stack, i - 1, s2);
        }
        case "color": {
          const c0 = emitNode(stack, i - 1, stv);
          const c = `v${v++}`;
          lines.push(`let ${c} = ${fn}(${c0}${scalars(def, args, 0)});`);
          return c;
        }
        case "combine": {
          const c0 = emitNode(stack, i - 1, stv);
          const c1 = emitArg(args[0] ?? this.o0, stv);
          const c = `v${v++}`;
          lines.push(`let ${c} = ${fn}(${c0}, ${c1}${scalars(def, args, 1)});`);
          return c;
        }
        case "combineCoord": {
          const c1 = emitArg(args[0] ?? this.o0, stv);
          const s2 = `v${v++}`;
          lines.push(`let ${s2} = ${fn}(${stv}, ${c1}${scalars(def, args, 1)});`);
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
  let st = vec2f(pos.x / U.res.x, 1.0 - pos.y / U.res.y);
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

    const dt = this._last ? (tms - this._last) / 1000 : 0;
    this._last = tms;
    this.time += dt * this.speed;
    if (this.update) this.update(dt);

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
          { binding: 2, resource: this.sampClamp },
          ...prog.texRefs.map((ref, i) => ({
            binding: 3 + i,
            resource: ref instanceof Source ? ref.view : ref.frontView,
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
  }
}

export default Zissl;
