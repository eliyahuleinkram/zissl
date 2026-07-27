/**
 * THE GOLDEN GATE'S CORPUS — every source and transform, exercised feature by
 * feature against hydra-synth's own render, the way zaltz was measured against
 * superdough. Each sketch is written instance-style — (s) => s.osc(...).out(s.o0)
 * — so the same code runs verbatim against BOTH synth surfaces (zissl's
 * instance and hydra's synth object) with no global collisions.
 *
 * Ground rules for determinism:
 *  - time is pinned by the harness (same warmup tick sequence on both engines)
 *  - no arrays (sequencing clocks differ by design), no mouse, no audio
 *  - single-output chains only (cross-output reads have 1-frame skew semantics)
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
];
