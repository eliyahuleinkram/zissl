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

## The golden gate

Like zaltz, zissl is measured against the thing it replaces — and the
measurement runs itself:

```sh
npm test              # headless Chrome, both engines, the whole corpus
npm run gate:watch    # the same run, in a window you can watch
```

[`harness/`](harness/) renders a 79-sketch corpus on hydra-synth (WebGL) and on
zissl (WebGPU) under the same pinned clock and pixel-diffs the frames — every
source and transform feature by feature, plus feedback, function params, array
sequencing, multi-output wiring, external sources, and the edge values where two
float pipelines are most likely to part ways. **74/74 comparable sketches match
pixel for pixel — worst MAE 0.00/255.**

Three things keep it honest:

- **A coverage contract.** The roster is parsed out of hydra-synth's own
  `glsl-functions.js` at run time, what zissl speaks is probed off the live
  engine, and what the corpus exercises is recorded by running every sketch past
  a proxy. The three sets are subtracted and the gate fails **by name** — an
  operator that exists but is untested, or is tested but missing, is a red build,
  not a comment someone forgot to update. Today: all 52 of hydra's operators are
  here and all 52 are exercised.
- **A self-test.** Every run re-renders one sketch with a small deliberate nudge
  and requires the gate to catch it. A gate that cannot fail proves nothing.
- **Named divergences.** Where we knowingly differ, the run says so out loud
  rather than passing quietly: `prev()` (hydra samples the framebuffer it is
  currently writing — undefined in GL, illegal in WebGPU; ours is the previous
  frame, identical to `src(o0)`), and the whole-chain-in-a-number's-slot
  conversion that hydra documents but never applies (its shader doesn't compile
  and the output goes black; ours renders). Those are asserted too: ours must
  paint, and must match the spelling that says the same thing out loud.

The gate has caught real bugs every time it has been widened — orientation,
`shift`'s fract semantics, `modulateRepeatY`'s reference quirk (kept
bug-for-bug), Rec.709 luminance, nearest+clamp output sampling, a quadrupled
`sum`, external-source filtering. That is the whole point of having one.

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

…and a fourth Hydra allows and never delivers: **a whole chain in a number's
slot** — `osc(9).rotate(noise(3))`, the picture read as the value (its channels,
added, at the same coordinate). Hydra documents that conversion and then emits a
`vec4` into a `float` parameter, so the shader never compiles and the frame goes
black; here it renders. `sum([1,1,1,1])` spells it out loud if you prefer.

Outputs and sources match too: `o0…o3` with `render()` showing one output or
the 2×2 grid, `prev()` for the output's own last frame, `s0…s3` with `initCam` /
`initVideo` / `initImage` / `initScreen`, `hush()`, `speed`, `bpm`, `time`,
`mouse`, `stats.fps`, and the per-frame hooks `update` / `afterUpdate` (dt in
milliseconds, Hydra's signature) — as page globals under `makeGlobal`, so
`update = (dt) => { … }` works exactly as it reads.

External sources sample **nearest**, like Hydra's own textures; pass
`Zissl.create({ sourceFilter: "linear" })` to trade that parity for smoother
video under a coordinate warp.

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

**Mini-notation** — `H("<0!4 1!8>")`, the natural way to gate a section — needs
a parser, and zissl deliberately doesn't carry one. Hand it Strudel's:

```js
import { reify } from "@strudel/core";
z.setReify(reify);                  // now H("<6 8 12 16>") is a real pattern
```

Without it a string is just a string, and `H` reads a flat 0 — silently, which
is the worst kind of quiet. One line, and the whole notation is in scope.

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
