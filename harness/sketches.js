// zissl — Copyright (C) 2026 Eliyahu Moshe Leinkram
// SPDX-License-Identifier: AGPL-3.0-or-later
// Full notice: see LICENSE and NOTICE.md at the repo root.

/**
 * THE GOLDEN GATE'S CORPUS — every source and transform, exercised feature by
 * feature against hydra-synth's own render, the way zaltz was measured against
 * superdough. Each sketch is written instance-style — (s) => s.osc(...).out(s.o0)
 * — so the same code runs verbatim against BOTH synth surfaces (zissl's
 * instance and hydra's synth object) with no global collisions.
 *
 * Ground rules for determinism:
 *  - time is pinned by the harness (same warmup tick sequence on both engines)
 *  - no mouse, no audio, no wall clock
 *  - arrays ARE measured: both engines read index = time·speed·(bpm/60)+offset
 *    off the SAME patched Array.prototype, and the harness pins bpm
 *  - cross-output reads are MEASURED, moving content and all (2026-09-24):
 *    hydra draws o0…o3 in turn and src(oX) reads X's OTHER ping-pong buffer, so
 *    an output rendering LATER this frame is read two frames old and an earlier
 *    one (or itself) as of last frame. zissl reads exactly that way now — the
 *    "one-frame lag" this corpus used to step around was a real difference.
 */
export const SKETCHES = [
  // ------------------------------------------------------------- sources
  ["osc", (s) => s.osc(12, 0.1, 1.2).out(s.o0)],
  ["osc-defaults", (s) => s.osc().out(s.o0)],
  ["noise", (s) => s.noise(6, 0.2).out(s.o0)],
  ["voronoi", (s) => s.voronoi(7, 0.4, 0.6).out(s.o0)],
  ["shape", (s) => s.shape(5, 0.35, 0.08).out(s.o0)],
  ["gradient", (s) => s.gradient(0.4).out(s.o0)],
  ["solid", (s) => s.solid(0.25, 0.5, 0.75, 1).out(s.o0)],

  // ------------------------------------------------------------ geometry
  ["rotate", (s) => s.osc(10, 0.1, 1).rotate(0.8, 0.1).out(s.o0)],
  ["scale", (s) => s.osc(10, 0.1, 1).scale(1.6, 1.2, 0.8, 0.3, 0.6).out(s.o0)],
  ["pixelate", (s) => s.noise(4, 0.1).pixelate(24, 14).out(s.o0)],
  ["repeat", (s) => s.shape(4, 0.5, 0.02).repeat(3, 2, 0.2, 0.1).out(s.o0)],
  ["repeatX", (s) => s.shape(3, 0.5, 0.02).repeatX(4, 0.3).out(s.o0)],
  ["repeatY", (s) => s.shape(3, 0.5, 0.02).repeatY(4, 0.3).out(s.o0)],
  ["kaleid", (s) => s.osc(9, 0.1, 1.5).kaleid(5).out(s.o0)],
  ["scroll", (s) => s.gradient(0).scroll(0.3, 0.2, 0.1, 0.05).out(s.o0)],
  ["scrollX", (s) => s.osc(8, 0, 1).scrollX(0.25, 0.1).out(s.o0)],
  ["scrollY", (s) => s.osc(8, 0, 1).scrollY(0.25, 0.1).out(s.o0)],

  // --------------------------------------------------------------- color
  ["posterize", (s) => s.gradient(0.2).posterize(5, 0.8).out(s.o0)],
  // a NEGATIVE base (noise is negative half the time) through posterize: hydra's
  // GLSL compiler folds pow() for a LITERAL exponent (x^1 = x, x^(2k) = (x·x)^k),
  // so the value survives into invert(); a function exponent is a uniform, never folded
  ["posterize-negative", (s) => s.noise(3, 0.1).posterize(3, 1).invert().out(s.o0)],
  ["posterize-negative-even", (s) => s.noise(3, 0.1).posterize(4, 2).invert().out(s.o0)],
  ["posterize-negative-dynamic", (s) => s.noise(3, 0.1).posterize(3, () => 1).invert().out(s.o0)],
  ["shift", (s) => s.osc(10, 0.1, 1).shift(0.3, 0.1, 0.2, 0).out(s.o0)],
  ["invert", (s) => s.osc(10, 0.1, 1).invert(0.8).out(s.o0)],
  ["contrast", (s) => s.osc(10, 0.1, 1).contrast(1.8).out(s.o0)],
  ["brightness", (s) => s.osc(10, 0.1, 1).brightness(0.25).out(s.o0)],
  ["luma", (s) => s.osc(10, 0.1, 1).luma(0.45, 0.15).out(s.o0)],
  ["thresh", (s) => s.noise(5, 0.1).thresh(0.4, 0.08).out(s.o0)],
  ["color", (s) => s.osc(10, 0.1, 1).color(0.9, 0.4, 1.2, 1).out(s.o0)],
  ["color-negative", (s) => s.osc(10, 0.1, 1).color(-1, 0.7, 1).out(s.o0)],
  ["saturate", (s) => s.osc(10, 0.1, 1.4).saturate(2.5).out(s.o0)],
  ["hue", (s) => s.osc(10, 0.1, 1.4).hue(0.35).out(s.o0)],
  ["colorama", (s) => s.osc(10, 0.1, 1.4).colorama(0.15).out(s.o0)],
  ["r-channel", (s) => s.osc(10, 0.1, 1.4).r(1.5, 0.1).out(s.o0)],
  ["g-channel", (s) => s.osc(10, 0.1, 1.4).g(1.5, 0.1).out(s.o0)],
  ["b-channel", (s) => s.osc(10, 0.1, 1.4).b(1.5, 0.1).out(s.o0)],
  ["a-channel", (s) => s.osc(10, 0.1, 1.4).a(1.5, 0.1).out(s.o0)],
  ["sum-colour", (s) => s.osc(10, 0.1, 1.4).sum([0.5, 0.25, 0.25, 0]).out(s.o0),
    { beyond: "hydra's sum() returns a float — as a colour op its shader does not compile" }],

  // --------------------------------------------------------------- blend
  ["add", (s) => s.osc(10, 0.1, 1).add(s.noise(4, 0.1), 0.6).out(s.o0)],
  ["sub", (s) => s.osc(10, 0.1, 1).sub(s.noise(4, 0.1), 0.6).out(s.o0)],
  ["layer", (s) => s.osc(10, 0.1, 1).layer(s.shape(4, 0.4, 0.02).luma(0.3, 0.1)).out(s.o0)],
  ["blend", (s) => s.osc(10, 0.1, 1).blend(s.voronoi(5, 0.3, 0.3), 0.45).out(s.o0)],
  ["mult", (s) => s.osc(10, 0.1, 1).mult(s.shape(64, 0.6, 0.4), 0.9).out(s.o0)],
  ["diff", (s) => s.osc(10, 0.1, 1).diff(s.voronoi(5, 0.3, 0.3)).out(s.o0)],
  ["mask", (s) => s.osc(10, 0.1, 1).mask(s.shape(4, 0.6, 0.2)).out(s.o0)],

  // ------------------------------------------------------------ modulate
  ["modulate", (s) => s.osc(10, 0.1, 1).modulate(s.noise(3, 0.1), 0.25).out(s.o0)],
  ["modulateRepeat", (s) => s.shape(4, 0.5, 0.02).modulateRepeat(s.osc(3, 0.1, 0), 2, 2, 0.4, 0.3).out(s.o0)],
  ["modulateRepeatX", (s) => s.shape(4, 0.5, 0.02).modulateRepeatX(s.osc(3, 0.1, 0), 3, 0.4).out(s.o0)],
  ["modulateRepeatY", (s) => s.shape(4, 0.5, 0.02).modulateRepeatY(s.osc(3, 0.1, 0), 3, 0.4).out(s.o0)],
  ["modulateKaleid", (s) => s.osc(9, 0.1, 1).modulateKaleid(s.osc(11, 0.2, 0), 5).out(s.o0)],
  ["modulateScrollX", (s) => s.osc(8, 0, 1).modulateScrollX(s.noise(3, 0.1), 0.3, 0.05).out(s.o0)],
  ["modulateScrollY", (s) => s.osc(8, 0, 1).modulateScrollY(s.noise(3, 0.1), 0.3, 0.05).out(s.o0)],
  ["modulateScale", (s) => s.osc(9, 0.1, 1).modulateScale(s.osc(4, 0.2, 0), 0.6, 1).out(s.o0)],
  ["modulatePixelate", (s) => s.noise(4, 0.1).modulatePixelate(s.osc(5, 0.2, 0), 16, 8).out(s.o0)],
  ["modulateRotate", (s) => s.osc(9, 0.1, 1).modulateRotate(s.osc(2, 0.15, 0), 0.7, 0.2).out(s.o0)],
  ["modulateHue", (s) => s.osc(9, 0.1, 1.2).modulateHue(s.noise(3, 0.1), 4).out(s.o0)],

  // ----------------------------------------------------- combined chains
  ["feedback", (s) => s.osc(10, 0.1, 1.4).kaleid(5).blend(s.src(s.o0), 0.7).out(s.o0)],
  // COORDINATE feedback is chaotic by construction: each frame re-samples the
  // noise field at recursively warped positions, so any engine pair's float
  // rounding diverges exponentially with depth. Shallow recursion (warm: 6)
  // still proves the path while the butterfly stays in its jar.
  ["feedback-warp", (s) => s.noise(3, 0.1).modulate(s.src(s.o0), 0.2).contrast(1.3).out(s.o0), { warm: 6 }],
  ["classic-1", (s) => s.osc(10, 0.1, 1.4).kaleid(5).rotate(0.4, 0.1).modulate(s.noise(3, 0.1), 0.1).out(s.o0)],
  ["classic-2", (s) => s.voronoi(6, 0.3, 0.3).modulate(s.noise(3, 0.1), 0.2).color(0.55, 0.75, 1.1).contrast(1.4).out(s.o0)],
  ["classic-3", (s) => s.shape(64, 0.3, 0.5).scale(1.2, 1, 1).diff(s.osc(6, 0.08, 0)).kaleid(4).mult(s.shape(64, 0.7, 0.4)).out(s.o0)],

  // ------------------------------------------------- the rest of the surface
  // (2026-07-31: the parity pass. Everything below was reachable in hydra and
  // unmeasured here — which is exactly how a gap survives a green gate.)

  // prev() — this output's own last frame, without naming the output.
  // DELIBERATE DIVERGENCE, measured and named rather than hidden: hydra's
  // prev() samples the framebuffer it is CURRENTLY WRITING (regl flips the
  // ping-pong index before binding the uniform) — undefined behaviour in GL and
  // flatly illegal in WebGPU, and in practice it reads two frames back. Ours is
  // the previous frame, which is what every sketch using it means. Proven here:
  // in hydra, prev() and src(o0) differ by MAE ~148; in zissl they are the same
  // picture, and zissl's src(o0) matches hydra's src(o0) exactly.
  ["prev", (s) => s.osc(10, 0.1, 1.4).kaleid(5).blend(s.prev(), 0.7).out(s.o0),
    { divergence: "hydra's prev() samples its own render target (undefined in GL, illegal in WebGPU); ours is the previous frame — identical to src(o0)",
      twin: (s) => s.osc(10, 0.1, 1.4).kaleid(5).blend(s.src(s.o0), 0.7).out(s.o0) }],

  // A WHOLE CHAIN IN A NUMBER'S SLOT — `osc(9).rotate(noise(3))`.
  // BEYOND HYDRA, measured: hydra DOCUMENTS this conversion (format-arguments
  // DEFAULT_CONVERSIONS: vec4 → sum([1,1,1,1])) but 1.4.0 never applies it —
  // it emits `rotate(st, <vec4>, 0.)` against a `float` parameter, the shader
  // fails to compile, and the output goes silently BLACK. We implement what
  // hydra means: the channels, added, at the same coordinate. The gate asserts
  // hydra is black, zissl is not, and zissl's implicit and explicit spellings
  // agree — the check that caught our own quadrupled sum.
  ["chain-as-float", (s) => s.osc(9, 0.1, 1).rotate(s.noise(3, 0.1)).out(s.o0),
    { beyond: "hydra-synth 1.4.0 emits a vec4 into a float slot; the shader never compiles",
      twin: (s) => s.osc(9, 0.1, 1).rotate(s.noise(3, 0.1).sum([1, 1, 1, 1])).out(s.o0) }],
  ["chain-as-float-nested", (s) => s.shape(4, 0.4, 0.05).scale(s.osc(3, 0.1, 0), 1, 1).out(s.o0),
    { beyond: "same conversion, in a scale() slot",
      twin: (s) => s.shape(4, 0.4, 0.05).scale(s.osc(3, 0.1, 0).sum([1, 1, 1, 1]), 1, 1).out(s.o0) }],
  ["sum-scaled", (s) => s.osc(9, 0.1, 1).scale(s.gradient(0).sum([0.5, 0.25, 0.25, 0]), 1, 1).out(s.o0),
    { beyond: "sum()'s own vec4 scale, in a float slot hydra can't fill" }],

  // FUNCTION params — both engines hand the thunk {time, bpm}
  ["fn-param", (s) => s.osc(({ time }) => 10 + Math.sin(time) * 4, 0.1, 1).out(s.o0)],
  ["fn-param-color", (s) => s.osc(10, 0.1, 1).color(({ time }) => 0.5 + 0.4 * Math.cos(time), 0.6, 1).out(s.o0)],

  // ARRAY sequencing — the shared Array.prototype, the shared bpm clock
  ["array-param", (s) => s.osc([10, 20, 40], 0.1, 1).out(s.o0)],
  ["array-fast", (s) => s.osc([10, 20, 40].fast(2), 0.1, 1).out(s.o0)],
  ["array-smooth", (s) => s.osc([8, 24].smooth(1), 0.1, 1).out(s.o0)],
  ["array-offset", (s) => s.shape([3, 5, 7].offset(0.5), 0.4, 0.05).out(s.o0)],
  ["array-fit", (s) => s.osc([1, 2, 3, 4].fit(8, 24), 0.1, 1).out(s.o0)],

  // MULTI-OUTPUT wiring (static content — see the header note)
  ["multi-output", (s) => { s.shape(4, 0.4, 0.02).out(s.o1); s.src(s.o1).kaleid(4).out(s.o0); }],
  ["multi-output-blend", (s) => {
    s.solid(0.8, 0.2, 0.4, 1).out(s.o1);
    s.shape(3, 0.5, 0.05).out(s.o2);
    s.src(s.o1).mask(s.src(s.o2)).out(s.o0);
  }],
  ["cross-output-later", (s) => {
    s.osc(10, 0.5, 0).out(s.o1);
    s.src(s.o1).out(s.o0);
  }],
  ["cross-output-chain", (s) => {
    s.osc(10, 0.5, 0).out(s.o2);
    s.src(s.o2).rotate(0.3).out(s.o1);
    s.src(s.o1).out(s.o0);
  }],
  ["cross-output-feedback", (s) => {
    s.noise(8, 0.4).thresh(0.6, 0.05).add(s.src(s.o1).brightness(-0.05), 0.9).out(s.o1);
    s.src(s.o1).out(s.o0);
  }],

  // EXTERNAL SOURCE — s0 fed a canvas the harness paints identically for both
  ["external-source", (s) => s.src(s.s0).out(s.o0), { needsSource: true }],
  ["external-source-warped", (s) => s.src(s.s0).kaleid(4).contrast(1.2).out(s.o0), { needsSource: true }],

  // .out() with no argument — hydra defaults to o0; so must we
  ["out-default", (s) => s.osc(11, 0.1, 1).out()],

  // EDGE VALUES — where two float pipelines are most likely to disagree.
  // (osc(0,…) is NOT here: hydra's osc divides offset by frequency, so zero
  // frequency is 0/0 — undefined in GLSL and in WGSL alike. A reference that
  // is itself undefined can't be a golden one.)
  ["tiny-params", (s) => s.osc(0.001, 0, 0).out(s.o0)],
  ["negative-scale", (s) => s.osc(10, 0.1, 1).scale(-1.4, 1, 1).out(s.o0)],
  ["huge-kaleid", (s) => s.osc(9, 0.1, 1).kaleid(64).out(s.o0)],
  ["thresh-hard", (s) => s.noise(5, 0.1).thresh(0.5, 0).out(s.o0)],
  ["hue-wrap", (s) => s.osc(10, 0.1, 1.4).hue(1.85).out(s.o0)],
  ["deep-chain", (s) =>
    s.osc(8, 0.05, 1)
      .rotate(0.3, 0)
      .kaleid(6)
      .modulate(s.noise(2, 0.05), 0.15)
      .colorama(0.08)
      .contrast(1.2)
      .saturate(1.4)
      .scale(1.1, 1, 1)
      .luma(0.2, 0.3)
      .out(s.o0)],
];
