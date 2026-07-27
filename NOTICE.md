# Notices

zissl is a derivative work of **[hydra-synth](https://github.com/hydra-synth/hydra-synth)**,
the live-coding video synthesizer by Olivia Jack and contributors
(AGPL-3.0-or-later). The engine re-implements Hydra's synth language in WGSL —
every source and transform (osc, noise, voronoi, the geometry warps, the color
maps, blends and modulators) was ported function-for-function from
hydra-synth's `glsl-functions.js`, keeping its parameter names, defaults and
math so that patches written for Hydra mean the same thing here. zissl is
therefore licensed AGPL-3.0-or-later, the same terms as its ancestor.

zissl contains no Hydra editor or runtime code — the language surface stays
upstream, the renderer is new — but the vocabulary it speaks is Hydra's,
with gratitude.

zissl is the sweet counterpart of **[zaltz](https://github.com/eliyahuleinkram/zaltz)**
(zaltz un tsuker — salt and sugar): zaltz rebuilt Strudel's sound engine in C
on the audio thread; zissl rebuilds Hydra's picture engine in WGSL on the GPU.
