// zissl — Copyright (C) 2026 Eliyahu Moshe Leinkram
// SPDX-License-Identifier: AGPL-3.0-or-later
// Full notice: see LICENSE and NOTICE.md at the repo root.
//
// zissl — the whole video synthesizer in one file of WGSL.
//
// Every Hydra source and transform, re-implemented function-for-function
// against hydra-synth's glsl-functions.js as the reference oracle. The host
// (index.js) compiles a chain like osc(10).rotate(0.1).modulate(noise(3))
// into one straight-line fragment shader that calls into this library —
// no branches around samples, no per-frame recompiles, params live in a
// uniform slot array so functions and sequences animate for free.
//
// Conventions:
//   * st is Hydra's coordinate space: origin bottom-left, [0,1]².
//     The generated prelude derives it from @builtin(position) and zt_tex
//     un-flips on every sample, so feedback loops round-trip exactly.
//   * The prelude (generated per chain) declares:
//       U      — uniforms: res, time, bpm, mouse, p[] param slots
//       zsampr — repeat sampler (outputs o0..o3)
//       zsampc — clamp sampler (external sources s0..s3)
//       ztexN  — one texture_2d<f32> per referenced output/source
//   * Prefixes: zs_ source, zg_ geometry, zc_ color, zb_ blend,
//     zm_ modulate, z_ helpers.
//
// zissl is a derivative of hydra-synth (AGPL-3.0-or-later) — see NOTICE.md.

// ---------------------------------------------------------------- helpers

fn z_mod(x: f32, y: f32) -> f32 {
  // GLSL mod() — WGSL's % truncates toward zero; Hydra's math needs floor.
  return x - y * floor(x / y);
}

fn z_lum(c: vec3f) -> f32 {
  // Rec.709 weights — hydra's _luminance exactly (not the 601 constants).
  return dot(c, vec3f(0.2125, 0.7154, 0.0721));
}

fn z_rgb2hsv(c: vec3f) -> vec3f {
  let K = vec4f(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  let p = mix(vec4f(c.bg, K.wz), vec4f(c.gb, K.xy), step(c.b, c.g));
  let q = mix(vec4f(p.xyw, c.r), vec4f(c.r, p.yzx), step(p.x, c.r));
  let d = q.x - min(q.w, q.y);
  let e = 1.0e-10;
  return vec3f(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

fn z_hsv2rgb(c: vec3f) -> vec3f {
  let K = vec4f(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  let p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, vec3f(0.0), vec3f(1.0)), c.y);
}

// Every texture read goes through here. Hydra's st space runs TOP-DOWN on
// screen (st.y = 0 at the top — measured against hydra-synth's own render in
// harness/, not assumed), which is also raw texture space: no flip anywhere,
// and feedback loops, images and readbacks all round-trip identically.
fn zt_tex(t: texture_2d<f32>, s: sampler, st: vec2f) -> vec4f {
  return textureSample(t, s, st);
}

// Ashima 3D simplex noise — the same one Hydra ships via glsl-noise.
fn z_m289v3(x: vec3f) -> vec3f { return x - floor(x * (1.0 / 289.0)) * 289.0; }
fn z_m289v4(x: vec4f) -> vec4f { return x - floor(x * (1.0 / 289.0)) * 289.0; }
fn z_perm(x: vec4f) -> vec4f { return z_m289v4(((x * 34.0) + 1.0) * x); }
fn z_tisq(r: vec4f) -> vec4f { return 1.79284291400159 - 0.85373472095314 * r; }

fn z_snoise(v: vec3f) -> f32 {
  let C = vec2f(1.0 / 6.0, 1.0 / 3.0);
  let D = vec4f(0.0, 0.5, 1.0, 2.0);
  var i = floor(v + dot(v, C.yyy));
  let x0 = v - i + dot(i, C.xxx);
  let g = step(x0.yzx, x0.xyz);
  let l = 1.0 - g;
  let i1 = min(g.xyz, l.zxy);
  let i2 = max(g.xyz, l.zxy);
  let x1 = x0 - i1 + C.xxx;
  let x2 = x0 - i2 + C.yyy;
  let x3 = x0 - D.yyy;
  i = z_m289v3(i);
  let p = z_perm(z_perm(z_perm(
      i.z + vec4f(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4f(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4f(0.0, i1.x, i2.x, 1.0));
  let n_ = 0.142857142857;
  let ns = n_ * D.wyz - D.xzx;
  let j = p - 49.0 * floor(p * ns.z * ns.z);
  let x_ = floor(j * ns.z);
  let y_ = floor(j - 7.0 * x_);
  let x = x_ * ns.x + ns.yyyy;
  let y = y_ * ns.x + ns.yyyy;
  let h = 1.0 - abs(x) - abs(y);
  let b0 = vec4f(x.xy, y.xy);
  let b1 = vec4f(x.zw, y.zw);
  let s0 = floor(b0) * 2.0 + 1.0;
  let s1 = floor(b1) * 2.0 + 1.0;
  let sh = -step(h, vec4f(0.0));
  let a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  let a1 = b1.xzyw + s1.xzyw * sh.zzww;
  var p0 = vec3f(a0.xy, h.x);
  var p1 = vec3f(a0.zw, h.y);
  var p2 = vec3f(a1.xy, h.z);
  var p3 = vec3f(a1.zw, h.w);
  let norm = z_tisq(vec4f(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 = p0 * norm.x;
  p1 = p1 * norm.y;
  p2 = p2 * norm.z;
  p3 = p3 * norm.w;
  var m = max(0.6 - vec4f(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), vec4f(0.0));
  m = m * m;
  return 42.0 * dot(m * m, vec4f(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

// ---------------------------------------------------------------- sources

fn zs_noise(st: vec2f, scale: f32, offset: f32) -> vec4f {
  return vec4f(vec3f(z_snoise(vec3f(st * scale, offset * U.time))), 1.0);
}

fn zs_voronoi(st0: vec2f, scale: f32, speed: f32, blending: f32) -> vec4f {
  var color = vec3f(0.0);
  let st = st0 * scale;
  let i_st = floor(st);
  let f_st = fract(st);
  var m_dist = 10.0;
  var m_point = vec2f(0.0);
  for (var j: i32 = -1; j <= 1; j++) {
    for (var i: i32 = -1; i <= 1; i++) {
      let neighbor = vec2f(f32(i), f32(j));
      let p = i_st + neighbor;
      var point = fract(sin(vec2f(dot(p, vec2f(127.1, 311.7)), dot(p, vec2f(269.5, 183.3)))) * 43758.5453);
      point = 0.5 + 0.5 * sin(U.time * speed + 6.2831 * point);
      let diff = neighbor + point - f_st;
      let dist = length(diff);
      if (dist < m_dist) {
        m_dist = dist;
        m_point = point;
      }
    }
  }
  color = color + dot(m_point, vec2f(0.3, 0.6));
  color = color * (1.0 - blending * m_dist);
  return vec4f(color, 1.0);
}

fn zs_osc(st: vec2f, freq: f32, sync: f32, offset: f32) -> vec4f {
  let r = sin((st.x - offset / freq + U.time * sync) * freq) * 0.5 + 0.5;
  let g = sin((st.x + U.time * sync) * freq) * 0.5 + 0.5;
  let b = sin((st.x + offset / freq + U.time * sync) * freq) * 0.5 + 0.5;
  return vec4f(r, g, b, 1.0);
}

fn zs_shape(st0: vec2f, sides: f32, radius: f32, smoothing: f32) -> vec4f {
  let st = st0 * 2.0 - 1.0;
  let a = atan2(st.x, st.y) + 3.1416;
  let r = 6.2832 / sides;
  let d = cos(floor(0.5 + a / r) * r - a) * length(st);
  return vec4f(vec3f(1.0 - smoothstep(radius, radius + smoothing + 0.0000001, d)), 1.0);
}

fn zs_gradient(st: vec2f, speed: f32) -> vec4f {
  return vec4f(st.x, st.y, sin(U.time * speed), 1.0);
}

fn zs_solid(r: f32, g: f32, b: f32, a: f32) -> vec4f {
  return vec4f(r, g, b, a);
}

// --------------------------------------------------------------- geometry

fn zg_rotate(st: vec2f, angle: f32, speed: f32) -> vec2f {
  var xy = st - vec2f(0.5);
  let ang = angle + speed * U.time;
  xy = mat2x2f(cos(ang), -sin(ang), sin(ang), cos(ang)) * xy;
  return xy + vec2f(0.5);
}

fn zg_scale(st: vec2f, amount: f32, xMult: f32, yMult: f32, offsetX: f32, offsetY: f32) -> vec2f {
  var xy = st - vec2f(offsetX, offsetY);
  xy = xy * (1.0 / vec2f(amount * xMult, amount * yMult));
  return xy + vec2f(offsetX, offsetY);
}

fn zg_pixelate(st: vec2f, pixelX: f32, pixelY: f32) -> vec2f {
  let xy = vec2f(pixelX, pixelY);
  return (floor(st * xy) + 0.5) / xy;
}

fn zg_repeat(st0: vec2f, repeatX: f32, repeatY: f32, offsetX: f32, offsetY: f32) -> vec2f {
  var st = st0 * vec2f(repeatX, repeatY);
  st.x = st.x + step(1.0, z_mod(st.y, 2.0)) * offsetX;
  st.y = st.y + step(1.0, z_mod(st.x, 2.0)) * offsetY;
  return fract(st);
}

fn zg_repeatX(st0: vec2f, reps: f32, offset: f32) -> vec2f {
  var st = st0 * vec2f(reps, 1.0);
  st.y = st.y + step(1.0, z_mod(st.x, 2.0)) * offset;
  return fract(st);
}

fn zg_repeatY(st0: vec2f, reps: f32, offset: f32) -> vec2f {
  var st = st0 * vec2f(1.0, reps);
  st.x = st.x + step(1.0, z_mod(st.y, 2.0)) * offset;
  return fract(st);
}

fn zg_kaleid(st0: vec2f, nSides: f32) -> vec2f {
  let st = st0 - vec2f(0.5);
  let r = length(st);
  var a = atan2(st.y, st.x);
  let pi = 2.0 * 3.1416;
  a = z_mod(a, pi / nSides);
  a = abs(a - pi / nSides / 2.0);
  return r * vec2f(cos(a), sin(a));
}

fn zg_scroll(st0: vec2f, scrollX: f32, scrollY: f32, speedX: f32, speedY: f32) -> vec2f {
  var st = st0;
  st.x = st.x + scrollX + U.time * speedX;
  st.y = st.y + scrollY + U.time * speedY;
  return fract(st);
}

fn zg_scrollX(st0: vec2f, scrollX: f32, speed: f32) -> vec2f {
  var st = st0;
  st.x = st.x + scrollX + U.time * speed;
  return fract(st);
}

fn zg_scrollY(st0: vec2f, scrollY: f32, speed: f32) -> vec2f {
  var st = st0;
  st.y = st.y + scrollY + U.time * speed;
  return fract(st);
}

// ------------------------------------------------------------------ color

fn zc_posterize(c0: vec4f, bins: f32, gamma: f32) -> vec4f {
  var c2 = pow(c0, vec4f(gamma));
  c2 = c2 * vec4f(bins);
  c2 = floor(c2);
  c2 = c2 / vec4f(bins);
  c2 = pow(c2, vec4f(1.0 / gamma));
  return vec4f(c2.rgb, c0.a);
}

fn zc_shift(c0: vec4f, r: f32, g: f32, b: f32, a: f32) -> vec4f {
  // hydra fracts the PARAMETER, not the sum — the color itself never wraps.
  var c2 = c0;
  c2.r = c2.r + fract(r);
  c2.g = c2.g + fract(g);
  c2.b = c2.b + fract(b);
  c2.a = c2.a + fract(a);
  return c2;
}

fn zc_invert(c0: vec4f, amount: f32) -> vec4f {
  return vec4f((1.0 - c0.rgb) * amount + c0.rgb * (1.0 - amount), c0.a);
}

fn zc_contrast(c0: vec4f, amount: f32) -> vec4f {
  let c = (c0 - vec4f(0.5)) * amount + vec4f(0.5);
  return vec4f(c.rgb, c0.a);
}

fn zc_brightness(c0: vec4f, amount: f32) -> vec4f {
  return vec4f(c0.rgb + vec3f(amount), c0.a);
}

fn zc_luma(c0: vec4f, threshold: f32, tolerance: f32) -> vec4f {
  let a = smoothstep(threshold - (tolerance + 0.0000001), threshold + (tolerance + 0.0000001), z_lum(c0.rgb));
  return vec4f(c0.rgb * a, a);
}

fn zc_thresh(c0: vec4f, threshold: f32, tolerance: f32) -> vec4f {
  return vec4f(vec3f(smoothstep(threshold - (tolerance + 0.0000001), threshold + (tolerance + 0.0000001), z_lum(c0.rgb))), c0.a);
}

fn zc_color(c0: vec4f, r: f32, g: f32, b: f32, a: f32) -> vec4f {
  let c = vec4f(r, g, b, a);
  let pos = step(vec4f(0.0), c);
  // negative args invert that channel — Hydra's little secret handshake
  return mix((1.0 - c0) * abs(c), c * c0, pos);
}

fn zc_saturate(c0: vec4f, amount: f32) -> vec4f {
  let W = vec3f(0.2125, 0.7154, 0.0721);
  let intensity = vec3f(dot(c0.rgb, W));
  return vec4f(mix(intensity, c0.rgb, amount), c0.a);
}

fn zc_hue(c0: vec4f, hue: f32) -> vec4f {
  var c = z_rgb2hsv(c0.rgb);
  c.x = c.x + hue;
  return vec4f(z_hsv2rgb(c), c0.a);
}

fn zc_colorama(c0: vec4f, amount: f32) -> vec4f {
  var c = z_rgb2hsv(c0.rgb);
  c = c + vec3f(amount);
  c = z_hsv2rgb(c);
  c = fract(c);
  return vec4f(c, c0.a);
}

fn zc_r(c0: vec4f, scale: f32, offset: f32) -> vec4f { return vec4f(c0.r * scale + offset); }
fn zc_g(c0: vec4f, scale: f32, offset: f32) -> vec4f { return vec4f(c0.g * scale + offset); }
fn zc_b(c0: vec4f, scale: f32, offset: f32) -> vec4f { return vec4f(c0.b * scale + offset); }
fn zc_a(c0: vec4f, scale: f32, offset: f32) -> vec4f { return vec4f(c0.a * scale + offset); }

// Hydra's sum(): the channels, scaled and added. In Hydra it returns a bare
// float — its whole job is turning a chain into a number, which is what the
// host does when a chain lands in a scalar slot. Called as a colour op it
// broadcasts, the same liberty zc_r/g/b/a take.
fn zc_sum(c0: vec4f, r: f32, g: f32, b: f32, a: f32) -> vec4f {
  let v = c0 * vec4f(r, g, b, a);
  return vec4f(v.r + v.g + v.b + v.a);
}

// ------------------------------------------------------------------ blend

fn zb_add(c0: vec4f, c1: vec4f, amount: f32) -> vec4f {
  return (c0 + c1) * amount + c0 * (1.0 - amount);
}

fn zb_sub(c0: vec4f, c1: vec4f, amount: f32) -> vec4f {
  return (c0 - c1) * amount + c0 * (1.0 - amount);
}

fn zb_layer(c0: vec4f, c1: vec4f) -> vec4f {
  return vec4f(mix(c0.rgb, c1.rgb, c1.a), clamp(c0.a + c1.a, 0.0, 1.0));
}

fn zb_blend(c0: vec4f, c1: vec4f, amount: f32) -> vec4f {
  return c0 * (1.0 - amount) + c1 * amount;
}

fn zb_mult(c0: vec4f, c1: vec4f, amount: f32) -> vec4f {
  return c0 * (1.0 - amount) + (c0 * c1) * amount;
}

fn zb_diff(c0: vec4f, c1: vec4f) -> vec4f {
  return vec4f(abs(c0.rgb - c1.rgb), max(c0.a, c1.a));
}

fn zb_mask(c0: vec4f, c1: vec4f) -> vec4f {
  let a = z_lum(c1.rgb);
  return vec4f(c0.rgb * a, a * c0.a);
}

// --------------------------------------------------------------- modulate

fn zm_modulate(st: vec2f, c1: vec4f, amount: f32) -> vec2f {
  return st + c1.xy * amount;
}

fn zm_modulateRepeat(st0: vec2f, c1: vec4f, repeatX: f32, repeatY: f32, offsetX: f32, offsetY: f32) -> vec2f {
  var st = st0 * vec2f(repeatX, repeatY);
  st.x = st.x + step(1.0, z_mod(st.y, 2.0)) + c1.r * offsetX;
  st.y = st.y + step(1.0, z_mod(st.x, 2.0)) + c1.g * offsetY;
  return fract(st);
}

fn zm_modulateRepeatX(st0: vec2f, c1: vec4f, reps: f32, offset: f32) -> vec2f {
  var st = st0 * vec2f(reps, 1.0);
  st.y = st.y + step(1.0, z_mod(st.x, 2.0)) + c1.r * offset;
  return fract(st);
}

fn zm_modulateRepeatY(st0: vec2f, c1: vec4f, reps: f32, offset: f32) -> vec2f {
  // hydra's Y variant scales x by reps, same as X — a reference quirk we
  // keep bug-for-bug (the harness measures against hydra, not against taste).
  var st = st0 * vec2f(reps, 1.0);
  st.x = st.x + step(1.0, z_mod(st.y, 2.0)) + c1.r * offset;
  return fract(st);
}

fn zm_modulateKaleid(st0: vec2f, c1: vec4f, nSides: f32) -> vec2f {
  let st = st0 - vec2f(0.5);
  let r = length(st);
  var a = atan2(st.y, st.x);
  let pi = 2.0 * 3.1416;
  a = z_mod(a, pi / nSides);
  a = abs(a - pi / nSides / 2.0);
  return (c1.r + r) * vec2f(cos(a), sin(a));
}

fn zm_modulateScrollX(st0: vec2f, c1: vec4f, scrollX: f32, speed: f32) -> vec2f {
  var st = st0;
  st.x = st.x + c1.r * scrollX + U.time * speed;
  return fract(st);
}

fn zm_modulateScrollY(st0: vec2f, c1: vec4f, scrollY: f32, speed: f32) -> vec2f {
  var st = st0;
  st.y = st.y + c1.r * scrollY + U.time * speed;
  return fract(st);
}

fn zm_modulateScale(st: vec2f, c1: vec4f, multiple: f32, offset: f32) -> vec2f {
  var xy = st - vec2f(0.5);
  xy = xy * (1.0 / vec2f(offset + multiple * c1.r, offset + multiple * c1.g));
  return xy + vec2f(0.5);
}

fn zm_modulatePixelate(st: vec2f, c1: vec4f, multiple: f32, offset: f32) -> vec2f {
  let xy = vec2f(offset + c1.x * multiple, offset + c1.y * multiple);
  return (floor(st * xy) + 0.5) / xy;
}

fn zm_modulateRotate(st: vec2f, c1: vec4f, multiple: f32, offset: f32) -> vec2f {
  var xy = st - vec2f(0.5);
  let ang = offset + c1.x * multiple;
  xy = mat2x2f(cos(ang), -sin(ang), sin(ang), cos(ang)) * xy;
  return xy + vec2f(0.5);
}

fn zm_modulateHue(st: vec2f, c1: vec4f, amount: f32) -> vec2f {
  return st + (vec2f(c1.g - c1.r, c1.b - c1.g) * amount) / U.res;
}

// ---------------------------------------------------------------- compute
// THE SWARM — the part Hydra's WebGL could never do. A physarum colony:
// up to two million agents living in a storage buffer, each one sensing the
// trail field AND the picture itself (any output/source, in `steer`), turning
// toward light, depositing as it walks. A blur/decay pass turns the deposits
// into glowing filaments; the trail texture then feeds back into the language
// as an ordinary source — swarm(...).color(...).blend(src(o0)).out(o1).
//
// These bindings live at @group(1) and are referenced only by the kernels, so
// every render pipeline compiled from this same file ignores them entirely.

struct ZAgent { x: f32, y: f32, ang: f32, seed: f32 }

struct ZSwarmU {
  countf: f32, w: f32, h: f32, dt: f32,
  speed: f32, turn: f32, senseAng: f32, senseDist: f32,
  decay: f32, deposit: f32, steerAmt: f32, t: f32,
}

@group(1) @binding(0) var<uniform> SU: ZSwarmU;
@group(1) @binding(1) var<storage, read_write> zsw_agents: array<ZAgent>;
@group(1) @binding(2) var<storage, read_write> zsw_field: array<atomic<u32>>;
@group(1) @binding(3) var zsw_trailIn: texture_2d<f32>;
@group(1) @binding(4) var zsw_trailOut: texture_storage_2d<rgba8unorm, write>;
@group(1) @binding(5) var zsw_steer: texture_2d<f32>;

fn z_hashf(n0: u32) -> f32 {
  var n = n0;
  n = n ^ (n << 13u);
  n = n * 0x5bd1e995u;
  n = n ^ (n >> 15u);
  return f32(n & 0xffffffu) / 16777216.0;
}

// What an agent smells at p (pixel space): its own kind's trail, plus the
// living picture underneath, weighted by steerAmt.
fn zsw_sense(p: vec2f) -> f32 {
  let w = SU.w;
  let h = SU.h;
  let x = i32(p.x - w * floor(p.x / w));
  let y = i32(p.y - h * floor(p.y / h));
  let trail = textureLoad(zsw_trailIn, vec2i(x, y), 0).r;
  let sd = vec2f(textureDimensions(zsw_steer));
  let sp = clamp(vec2f(f32(x), f32(y)) / vec2f(w, h) * sd, vec2f(0.0), sd - 1.0);
  let food = z_lum(textureLoad(zsw_steer, vec2i(sp), 0).rgb);
  return trail + food * SU.steerAmt;
}

@compute @workgroup_size(256)
fn zk_move(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (f32(i) >= SU.countf) { return; }
  var a = zsw_agents[i];
  let pos = vec2f(a.x, a.y);
  let d = SU.senseDist;
  let ahead = zsw_sense(pos + vec2f(cos(a.ang), sin(a.ang)) * d);
  let left = zsw_sense(pos + vec2f(cos(a.ang + SU.senseAng), sin(a.ang + SU.senseAng)) * d);
  let right = zsw_sense(pos + vec2f(cos(a.ang - SU.senseAng), sin(a.ang - SU.senseAng)) * d);
  let rnd = z_hashf(i * 747796405u + u32(SU.t * 6000.0));
  var ang = a.ang;
  let ta = SU.turn * SU.dt * 9.0;
  if (ahead >= left && ahead >= right) {
    // keep going — jitter only
  } else if (left > right) {
    ang += ta;
  } else if (right > left) {
    ang -= ta;
  } else {
    ang += (rnd - 0.5) * 2.0 * ta;
  }
  // constant exploration jitter — NOT scaled by turn, so even a docile
  // colony keeps wandering instead of freezing onto one attractor
  ang += (rnd - 0.5) * (0.25 * ta + 0.05 * SU.dt * 60.0);
  var np = pos + vec2f(cos(ang), sin(ang)) * SU.speed * SU.dt * 60.0;
  np.x = np.x - SU.w * floor(np.x / SU.w);
  np.y = np.y - SU.h * floor(np.y / SU.h);
  // REBIRTH — ~0.15% of the colony re-seeds each frame (mean life ≈ 11 s).
  // Without it the swarm eventually collapses into the brightest point of
  // the food field and the picture starves; with it, the field is forever
  // being re-explored and the filament network stays alive indefinitely.
  let r2 = z_hashf(i * 2654435761u + u32(SU.t * 977.0) * 668265263u);
  if (r2 < 0.0015 * SU.dt * 60.0) {
    np.x = z_hashf(i * 3266489917u + u32(SU.t * 1409.0)) * SU.w;
    np.y = z_hashf(i * 1274126177u + u32(SU.t * 2003.0)) * SU.h;
    ang = z_hashf(i * 2246822519u + u32(SU.t * 3571.0)) * 6.2832;
  }
  a.x = np.x;
  a.y = np.y;
  a.ang = ang;
  zsw_agents[i] = a;
  let px = u32(clamp(np.x, 0.0, SU.w - 1.0));
  let py = u32(clamp(np.y, 0.0, SU.h - 1.0));
  atomicAdd(&zsw_field[py * u32(SU.w) + px], u32(SU.deposit * 256.0));
}

@compute @workgroup_size(8, 8)
fn zk_blur(@builtin(global_invocation_id) gid: vec3u) {
  let w = i32(SU.w);
  let h = i32(SU.h);
  let x = i32(gid.x);
  let y = i32(gid.y);
  if (x >= w || y >= h) { return; }
  var sum = 0.0;
  for (var j: i32 = -1; j <= 1; j++) {
    for (var k: i32 = -1; k <= 1; k++) {
      let xx = (x + k + w) % w;
      let yy = (y + j + h) % h;
      sum = sum + textureLoad(zsw_trailIn, vec2i(xx, yy), 0).r;
    }
  }
  let dep = f32(atomicExchange(&zsw_field[u32(y * w + x)], 0u)) / 256.0;
  let v = clamp((sum / 9.0) * SU.decay + dep, 0.0, 1.0);
  textureStore(zsw_trailOut, vec2i(x, y), vec4f(v, v, v, 1.0));
}
