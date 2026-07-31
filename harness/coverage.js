/**
 * THE COVERAGE CONTRACT — the zaltz treatment, applied to the picture.
 *
 * A golden gate that only measures the sketches someone remembered to write is
 * a gate with a hole in it. So nothing here is hand-maintained:
 *
 *   1. The ROSTER is derived from hydra-synth's OWN source of truth —
 *      src/glsl/glsl-functions.js, read as text at run time. If hydra adds an
 *      operator tomorrow, this gate starts failing tomorrow.
 *   2. What zissl SPEAKS is derived by probing the live engine (a source on the
 *      instance, a transform on a real chain) — never a list in a comment.
 *   3. What the CORPUS covers is derived by running every sketch against a
 *      recording proxy, so coverage can't drift from the sketches.
 *
 * Then the three sets are subtracted and the gate FAILS BY NAME: which operator
 * hydra has that zissl lacks, and which operator no sketch exercises.
 */

/** Parse hydra-synth's glsl-functions.js: every { name, type } it declares. */
export function hydraRoster(source) {
  const roster = new Map();
  const re = /\{\s*name:\s*'([A-Za-z0-9_]+)',\s*type:\s*'([A-Za-z]+)'/g;
  let m;
  while ((m = re.exec(source))) {
    const [, name, type] = m;
    // 'float' entries are the INPUTS of a function (osc's freq/sync/offset),
    // not functions themselves — the roster is the five real kinds.
    if (["src", "coord", "color", "combine", "combineCoord"].includes(type)) roster.set(name, type);
  }
  return roster;
}

/** What the live zissl engine actually speaks (probed, not declared). */
export function zisslRoster(z) {
  const speaks = new Set();
  const probe = z.osc();
  for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(probe))) {
    if (typeof probe[k] === "function") speaks.add(k);
  }
  for (const k of Object.keys(z)) {
    if (typeof z[k] === "function") speaks.add(k);
  }
  // sources hang off the instance, including ones defined on the class
  for (const k of ["osc", "noise", "voronoi", "shape", "gradient", "solid", "src", "prev"]) {
    if (typeof z[k] === "function") speaks.add(k);
  }
  return speaks;
}

/** Which operators the corpus actually calls — recorded by running each sketch
 *  against a proxy that answers to everything and remembers what it was asked. */
export function corpusCoverage(sketches) {
  const seen = new Set();
  const node = new Proxy(function () {}, {
    get(_t, key) {
      if (typeof key !== "string") return undefined;
      if (key === "then") return undefined; // never look thenable to await
      seen.add(key);
      return node;
    },
    apply() {
      return node;
    },
  });
  const synth = new Proxy(
    {},
    {
      get(_t, key) {
        if (typeof key !== "string") return undefined;
        if (key === "then") return undefined;
        if (/^[os][0-3]$/.test(key)) return node; // outputs and sources
        seen.add(key);
        return node;
      },
    },
  );
  for (const [, sketch] of sketches) {
    try {
      sketch(synth);
    } catch {
      /* a sketch that needs real state still contributes what it called first */
    }
  }
  return seen;
}

/** hydra's roster vs zissl's surface vs the corpus — the failures, by name. */
export function coverageVerdict({ roster, speaks, covered }) {
  const missing = [...roster.keys()].filter((n) => !speaks.has(n));
  const untested = [...roster.keys()].filter((n) => !covered.has(n));
  const extras = [...speaks].filter((n) => !roster.has(n) && !INTERNAL.has(n) && !n.startsWith("_"));
  return {
    total: roster.size,
    missing,
    untested,
    extras,
    pass: missing.length === 0 && untested.length === 0,
  };
}

/** zissl's own additions — not hydra's, so never counted as drift. */
const INTERNAL = new Set([
  "out", "swarm", "H", "render", "hush", "tick", "install", "dispose", "setTime",
  "setReify", "setResolution", "setFunction", "readPixels", "screencap", "ready",
  "constructor", "slow",
]);
