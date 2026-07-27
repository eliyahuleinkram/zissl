<img src="zissl-icon.svg" alt="" width="88" align="left" />

# zissl

**The whole video synthesizer is one file of WGSL. Your patch compiles to a
single fragment shader in milliseconds, and it runs on WebGPU.**

[Hydra](https://hydra.ojack.xyz)'s synth language is one of the loveliest
ideas in live coding: video as signal chains — `osc().rotate().modulate()` —
with feedback for free. But the renderer under it is WebGL: an aging API the
browsers have stopped investing in, GLSL strings stitched at runtime, implicit
state, context-loss roulette, and a hard ceiling the moment you want compute,
storage buffers, or float precision end to end.

zissl keeps the language and replaces the machine. Every Hydra source and
transform — oscillators, noise, voronoi, the geometry warps, the color maps,
blends, modulators — lives in [one file of WGSL](engine/zissl.wgsl), ported
function-for-function from hydra-synth's `glsl-functions.js` with the same
names, defaults and math. A patch written for Hydra means the same thing here;
it just renders on the API the browsers are actually building for the next
twenty years.

## The sweet counterpart

zissl is the sister of [zaltz](https://github.com/eliyahuleinkram/zaltz)
(*zaltz un tsuker* — salt and sugar). zaltz rebuilt Strudel's sound engine as
one file of C on the audio thread; zissl rebuilds Hydra's picture engine as
one file of WGSL on the GPU. Same shape both times: one engine file, a thin
typed host, and the language stays upstream — zaltz is the sound, zissl is
the picture.

zissl is young (v0.1). zaltz shipped after a golden-gate harness measured it
against superdough until they were indistinguishable; zissl's equivalent —
pixel-diffing against Hydra's own renders, patch by patch — is the roadmap,
not yet the record. What it does today: the full transform set, all four
feedback outputs, external sources, sequences, and function params, faithfully
enough to run classic Hydra sketches unchanged.

## What's in the box

- [`engine/zissl.wgsl`](engine/zissl.wgsl) — the synthesizer: every source
  and transform, plus the simplex noise, HSV and luminance helpers they lean
  on. Coordinate space is Hydra's (origin bottom-left), and every texture
  read round-trips the flip so feedback loops land pixel-true.
- [`index.js`](index.js) — the thin host: a compiler that walks a chain
  back-to-front into straight-line WGSL (coord warps compose screen-first,
  then the source samples, then color forward — Hydra's exact semantics), the
  o0–o3 ping-pong feedback buffers, s0–s3 external sources (camera, video,
  image, screen), and per-frame param evaluation into uniform slots — numbers,
  `() => time` functions and `[1,2,3].fast(2)` sequences all animate with zero
  recompiles.
- [`dist/zissl.wgsl.js`](dist/zissl.wgsl.js) — the engine wrapped as an ES
  module. No fetch, no bundler config, no build step for consumers.

```js
import Zissl from "zissl";

const z = await Zissl.create({ canvas, makeGlobal: true });

// a classic Hydra feedback patch, verbatim
osc(10, 0.1, 1.4)
  .kaleid(5)
  .rotate(0, 0.1)
  .modulate(noise(3), 0.05)
  .blend(src(o0), 0.4)
  .out(o0);
render(o0);
```

Prefer no globals? Skip `makeGlobal` and speak through the instance:
`z.osc(10).rotate(() => z.time / 4).out(z.o1); z.render(z.o1)`.

## Speaking Hydra

Params speak Hydra's language — same names, same defaults, same trio of
dynamic forms:

- **numbers** — `osc(40)`
- **functions** — `osc(() => 20 + mouse.x / 30)`, evaluated every frame
- **sequences** — `osc([10, 40, 80].fast(2).smooth())`, stepped on the bpm
  clock with `.fast` / `.slow` / `.smooth` / `.ease` / `.offset` / `.fit`

Outputs and sources match too: `o0…o3` with `render()` showing one output or
the 2×2 grid, `s0…s3` with `initCam` / `initVideo` / `initImage` /
`initScreen`, `hush()`, `speed`, `bpm`, `time`, `mouse`.

Custom transforms are `setFunction`, same shape as Hydra's — except the body
is WGSL now, which is the honest price of the new machine:

```js
z.setFunction({
  name: "vignette",
  type: "color",
  inputs: [{ name: "amount", default: 1 }],
  wgsl: `fn vignette(c0: vec4f, amount: f32) -> vec4f {
    return c0; // your math here — U.time, U.res and the z_ helpers are in scope
  }`,
});
```

Audio reactivity is Hydra's `a`, with one upgrade: `a.init()` listens to the
microphone like Hydra, but `a.init({ source })` taps **any** MediaStream,
media element, or WebAudio node — hand it your engine's output node and the
visuals react to what's actually playing, no mic loopback:

```js
a.init({ source: zaltzEngine.node }); // zaltz's AudioWorkletNode — or any AudioNode
osc(10).brightness(() => a.fft[0]).out(o0);
a.setBins(6).setSmooth(0.7); a.show(); // the familiar knobs + bars overlay
```

Also aboard: `fps` (render-rate cap), `screencap()` (PNG of the current
frame), `readPixels()` (honest ImageData readback — WebGPU canvases don't
readback through 2d `drawImage`; this is also the future pixel-diff harness
against Hydra's renders).

Not here yet, said plainly: the p5/GLSL extension ecosystem — `setFunction`
speaks WGSL, not GLSL. The language core is complete.

## Strudel — the H method

This is the pairing zissl was born for. In
[Klappn](https://klappn.com)'s live sets, *all* motion comes from `H(pat)` —
a Strudel pattern sampled on the transport clock, in cycles, so the picture
is locked to the music's own time, not the wall's. zissl builds that bridge
in:

```js
const z = await Zissl.create({ canvas, makeGlobal: true });

z.setTime(() => scheduler.now());   // your transport, in CYCLES —
                                    // the same clock zaltz plays from

osc(4, 0, 1)                        // Hydra's own clocks frozen (explicit 0s)…
  .rotate(H(saw.slow(8)))           // …ALL motion rides the pattern
  .scale(H("<1 1.5 2>"))            // works with anything that has queryArc
  .out(o0);
```

`H()` duck-types: a Strudel pattern (anything with `queryArc`), a plain
function of cycle time, or a number. No `@strudel/*` dependency — and if you
already use `@strudel/hydra`, its `H` works against zissl **unchanged**,
because zissl params accept the same zero-arg thunks. Strudel's `feedStrudel`
trick works too: `s0.init({ src: strudelDrawCanvas })`.

## Try it

```bash
python3 -m http.server 8095 -d .
# → http://localhost:8095/example/
```

Any browser with WebGPU (Chrome/Edge 113+, Safari 26+, Firefox 141+). There
is deliberately no WebGL fallback — Hydra itself is the WebGL path, and it's
a good one.

## License

AGPL-3.0-or-later, inherited with gratitude from
[hydra-synth](https://github.com/hydra-synth/hydra-synth) — see
[NOTICE.md](NOTICE.md).
