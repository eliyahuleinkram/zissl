/**
 * zissl — Hydra's synth language on a WebGPU renderer, in one file of WGSL.
 */

/** A parameter: a number, a per-frame function, or a Hydra-style sequence
 *  array (with .fast/.slow/.smooth/.ease/.offset/.fit modifiers). */
export type Param = number | number[] | ((ctx: FrameContext) => number);

export interface FrameContext {
  time: number;
  bpm: number;
  width: number;
  height: number;
  mouse: { x: number; y: number };
}

/** Anything a combine/modulate transform can take as its texture argument. */
export type TexInput = Chain | Output | Source;

export interface Chain {
  // geometry
  rotate(angle?: Param, speed?: Param): Chain;
  scale(amount?: Param, xMult?: Param, yMult?: Param, offsetX?: Param, offsetY?: Param): Chain;
  pixelate(pixelX?: Param, pixelY?: Param): Chain;
  repeat(repeatX?: Param, repeatY?: Param, offsetX?: Param, offsetY?: Param): Chain;
  repeatX(reps?: Param, offset?: Param): Chain;
  repeatY(reps?: Param, offset?: Param): Chain;
  kaleid(nSides?: Param): Chain;
  scroll(scrollX?: Param, scrollY?: Param, speedX?: Param, speedY?: Param): Chain;
  scrollX(scrollX?: Param, speed?: Param): Chain;
  scrollY(scrollY?: Param, speed?: Param): Chain;
  // color
  posterize(bins?: Param, gamma?: Param): Chain;
  shift(r?: Param, g?: Param, b?: Param, a?: Param): Chain;
  invert(amount?: Param): Chain;
  contrast(amount?: Param): Chain;
  brightness(amount?: Param): Chain;
  luma(threshold?: Param, tolerance?: Param): Chain;
  thresh(threshold?: Param, tolerance?: Param): Chain;
  color(r?: Param, g?: Param, b?: Param, a?: Param): Chain;
  saturate(amount?: Param): Chain;
  hue(hue?: Param): Chain;
  colorama(amount?: Param): Chain;
  r(scale?: Param, offset?: Param): Chain;
  g(scale?: Param, offset?: Param): Chain;
  b(scale?: Param, offset?: Param): Chain;
  a(scale?: Param, offset?: Param): Chain;
  // blend
  add(texture: TexInput, amount?: Param): Chain;
  sub(texture: TexInput, amount?: Param): Chain;
  layer(texture: TexInput): Chain;
  blend(texture: TexInput, amount?: Param): Chain;
  mult(texture: TexInput, amount?: Param): Chain;
  diff(texture: TexInput): Chain;
  mask(texture: TexInput): Chain;
  // modulate
  modulate(texture: TexInput, amount?: Param): Chain;
  modulateRepeat(texture: TexInput, repeatX?: Param, repeatY?: Param, offsetX?: Param, offsetY?: Param): Chain;
  modulateRepeatX(texture: TexInput, reps?: Param, offset?: Param): Chain;
  modulateRepeatY(texture: TexInput, reps?: Param, offset?: Param): Chain;
  modulateKaleid(texture: TexInput, nSides?: Param): Chain;
  modulateScrollX(texture: TexInput, scrollX?: Param, speed?: Param): Chain;
  modulateScrollY(texture: TexInput, scrollY?: Param, speed?: Param): Chain;
  modulateScale(texture: TexInput, multiple?: Param, offset?: Param): Chain;
  modulatePixelate(texture: TexInput, multiple?: Param, offset?: Param): Chain;
  modulateRotate(texture: TexInput, multiple?: Param, offset?: Param): Chain;
  modulateHue(texture: TexInput, amount?: Param): Chain;
  /** Compile and point an output (default o0) at this chain. */
  out(output?: Output): Chain;
  // custom transforms registered via setFunction land here too
  [key: string]: any;
}

export declare class Output {
  readonly i: number;
}

export declare class Source {
  readonly i: number;
  /** Bring your own media element / bitmap / canvas / MediaStream. */
  init(opts: { src: HTMLVideoElement | HTMLCanvasElement | ImageBitmap | HTMLImageElement | MediaStream; dynamic?: boolean }): void;
  initCam(deviceId?: string): Promise<void>;
  initVideo(url: string): Promise<void>;
  initImage(url: string): Promise<void>;
  initScreen(): Promise<void>;
  clear(): void;
}

/** A Strudel pattern: anything with queryArc (duck-typed, no dependency). */
export interface PatternLike {
  queryArc(begin: number, end: number): { value: unknown }[];
}

/** Hydra's `a` — audio reactivity via an AnalyserNode. */
export declare class Audio {
  /** Per-bin levels, 0..1. Use in params: `() => a.fft[0]`. */
  readonly fft: number[];
  /**
   * init() → microphone. init({ source }) → a MediaStream, an
   * HTMLMediaElement, or ANY AudioNode — e.g. zaltz's worklet node, so the
   * visuals react to the engine's actual output, no mic loopback.
   */
  init(opts?: { source?: MediaStream | HTMLMediaElement | AudioNode }): Promise<this>;
  setBins(n?: number): this;
  setCutoff(c?: number): this;
  setScale(s?: number): this;
  setSmooth(s?: number): this;
  /** Show / hide the little FFT bars overlay. */
  show(): this;
  hide(): this;
}

export interface ZisslOptions {
  /** Target canvas; one is created and appended to <body> if omitted. */
  canvas?: HTMLCanvasElement;
  width?: number;
  height?: number;
  /** Install the Hydra globals (osc, noise, o0…, render, hush…) on globalThis. */
  makeGlobal?: boolean;
  /** false hands the render loop to the host — drive frames with tick(dtMs). */
  autoLoop?: boolean;
}

/** The deeper swarm knobs, set via swarm.tune({...}). */
export interface SwarmTuning {
  deposit?: number;
  decay?: number;
  senseAng?: number;
  senseDist?: number;
  steerAmt?: number;
  speed?: number;
  turn?: number;
}

/** swarm(count, steer, speed, turn) — a physarum colony on compute shaders:
 *  agents sense the trail field AND `steer`'s picture, deposit as they walk;
 *  the trail feeds back into the language as an ordinary source. */
export interface SwarmFn {
  (count?: number, steer?: Output | Source | null, speed?: number, turn?: number): Chain;
  tune(opts: SwarmTuning): SwarmFn;
}

export interface CustomFunction {
  name: string;
  type: "src" | "coord" | "color" | "combine" | "combineCoord";
  inputs?: { name: string; default?: number }[];
  /** Full WGSL function definition, named exactly `name`. */
  wgsl: string;
}

export declare class Zissl {
  static create(opts?: ZisslOptions): Promise<Zissl>;

  readonly canvas: HTMLCanvasElement;
  width: number;
  height: number;
  /** Synth time in seconds (advanced by `speed` each frame). */
  time: number;
  /** Time multiplier, Hydra's `speed` global. */
  speed: number;
  /** Sequence tempo for array params, Hydra's `bpm` global (default 30). */
  bpm: number;
  mouse: { x: number; y: number };
  /** Cap the render rate (frames per second); undefined = every RAF. */
  fps: number | undefined;
  /** Audio reactivity — Hydra's `a` (a.fft, setBins, show()…). */
  a: Audio;
  /** Per-frame hook, called with dt in MILLISECONDS (Hydra's signature). */
  update: ((dt: number) => void) | null;
  /** Same, but after the frame is queued — Hydra's afterUpdate. */
  afterUpdate: ((dt: number) => void) | null;
  /** Hydra's stats object; fps is the measured frame rate. */
  readonly stats: { fps: number };
  onerror: ((message: string) => void) | null;

  o0: Output; o1: Output; o2: Output; o3: Output;
  s0: Source; s1: Source; s2: Source; s3: Source;

  // sources
  osc(frequency?: Param, sync?: Param, offset?: Param): Chain;
  noise(scale?: Param, offset?: Param): Chain;
  voronoi(scale?: Param, speed?: Param, blending?: Param): Chain;
  shape(sides?: Param, radius?: Param, smoothing?: Param): Chain;
  gradient(speed?: Param): Chain;
  solid(r?: Param, g?: Param, b?: Param, a?: Param): Chain;
  src(input: Output | Source): Chain;
  /** This output's own last frame — src(oN) without naming the output. */
  prev(): Chain;
  /** The compute layer — see SwarmFn. */
  swarm: SwarmFn;

  /** Advance one frame by hand (autoLoop: false hosts). dt in milliseconds. */
  tick(dtMs?: number): void;

  /** Show one output on the canvas, or the 2×2 grid of all four if omitted. */
  render(output?: Output): void;
  /** Black, everywhere, now. */
  hush(): void;
  setResolution(width: number, height: number): void;
  /** Register a custom transform; the body is WGSL. */
  setFunction(fn: CustomFunction): void;
  /**
   * The Strudel bridge: set H's transport, in CYCLES — the same clock your
   * audio engine plays from (e.g. `() => scheduler.now()`). Unset, H uses
   * zissl's own clock (time · bpm/60).
   */
  setTime(fn: (() => number) | null): this;
  /** Teach H to read mini-notation strings: hand it Strudel's `reify`. */
  setReify(fn: ((s: string) => PatternLike) | null): this;
  /** Strudel pattern → per-frame param, sampled on the setTime transport.
   *  Mini-notation strings work once setReify has been called.
   *  (@strudel/hydra's H also works against zissl unchanged.) */
  H(p: PatternLike | string | number | ((cycle: number) => number)): () => number;
  /** Read an output's current frame as ImageData (defaults to the on-screen output). */
  readPixels(output?: Output): Promise<ImageData>;
  /** Hydra's screencap(): download the current frame as a PNG. */
  screencap(): Promise<void>;
  /** Install the Hydra vocabulary on globalThis (or a target of your choice). */
  install(target?: object): this;
  dispose(): void;
}

export default Zissl;
