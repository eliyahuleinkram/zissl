#!/usr/bin/env bash
# zissl → dist. The engine already ships in its shipping language (WGSL);
# "building" is just wrapping it as an ES module so hosts can import it with
# no fetch, no bundler config, no CORS story. Any node ≥ 14 will do.
set -e
cd "$(dirname "$0")"
node --input-type=module -e '
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const src = readFileSync("zissl.wgsl", "utf8");
mkdirSync("../dist", { recursive: true });
writeFileSync(
  "../dist/zissl.wgsl.js",
  "// GENERATED from engine/zissl.wgsl — do not edit. Run engine/build.sh.\n" +
  "export const LIB = " + JSON.stringify(src) + ";\n"
);
console.log("dist/zissl.wgsl.js ←", src.length, "chars of WGSL");
'
