import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import process from "node:process";
import { build } from "vite";

async function bundle(contents: string, sourcefile: string) {
  const virtualId = `virtual:${sourcefile}`;
  const resolvedId = `\0${virtualId}`;
  const result = await build({
    configFile: false,
    logLevel: "silent",
    root: process.cwd(),
    plugins: [
      {
        name: "package-consumer-fixture",
        resolveId(id) {
          if (id === virtualId) return resolvedId;
        },
        load(id) {
          if (id === resolvedId) return contents;
        },
      },
    ],
    build: {
      minify: true,
      rollupOptions: {
        input: virtualId,
        output: { codeSplitting: false, format: "es" },
      },
      target: "esnext",
      write: false,
    },
  });
  const builds = Array.isArray(result) ? result : [result];
  return builds
    .flatMap((output) => ("output" in output ? output.output : []))
    .filter((output) => output.type === "chunk")
    .map((output) => output.code)
    .join("\n");
}

// Registrations go through the shared `define()` helper, so the literal
// `customElements.define(` appears once per bundle regardless of how many
// elements register. Count call sites instead: a `("ui-…",` argument pair is
// the helper's (minified) signature and unique to registration calls.
function definitions(output: string) {
  return output.match(/\(["'`]ui-[a-z-]+["'`],/g)?.length ?? 0;
}

const [rootSwitch, subpathSwitch, sourceSwitch, registerAll, sourceRegisterAll] = await Promise.all(
  [
    bundle(
      'import { UISwitch } from "@chr33s/base-wc"; document.body.append(new UISwitch());',
      "root-switch.js",
    ),
    bundle(
      'import { UISwitch } from "@chr33s/base-wc/switch"; document.body.append(new UISwitch());',
      "subpath-switch.js",
    ),
    bundle(
      'import { UISwitch } from "@chr33s/base-wc/src"; document.body.append(new UISwitch());',
      "source-switch.js",
    ),
    bundle('import "@chr33s/base-wc/elements";', "register-all.js"),
    bundle('import "@chr33s/base-wc/src/elements";', "source-register-all.js"),
  ],
);

assert.match(
  import.meta.resolve("@chr33s/base-wc/styles.css"),
  /\/dist\/styles\.css$/,
  "stylesheet export does not resolve to the emitted file",
);
assert.match(
  import.meta.resolve("@chr33s/base-wc/src"),
  /\/src\/index\.ts$/,
  "source export does not resolve to the TypeScript barrel",
);

for (const [entry, output] of [
  ["root barrel", rootSwitch],
  ["component subpath", subpathSwitch],
  ["source barrel", sourceSwitch],
] as const) {
  assert.ok(output.length < 5_000, `${entry} pulled ${output.length} bytes for UISwitch`);
  assert.equal(definitions(output), 1, `${entry} registered unrelated custom elements`);
  assert.match(output, /ui-switch/, `${entry} omitted the requested element registration`);
}

// The exact roster size, not a floor: a floor cannot catch a *single* element
// omitted from `elements.ts`'s roster (or dropped by tree-shaking), which is
// precisely the drift that ships a silently unregistered component.
const rosterSize = ((await readFile("src/elements.ts", "utf8")).match(/\bui\.UI\w+/g) ?? []).length;
assert.ok(rosterSize >= 80, `elements.ts roster looks truncated (${rosterSize} entries)`);

assert.equal(
  definitions(registerAll),
  rosterSize,
  "register-all bundle registered a different number of elements than the roster lists",
);
assert.match(registerAll, /ui-combobox/, "register-all output omitted ui-combobox");
assert.doesNotMatch(registerAll, /__perseusUI/, "register-all leaked a package global");
// The source variant is a side-effect-only import too: it must be pinned by
// package.json `sideEffects` ("./src/elements.ts") or bundlers drop it whole.
assert.equal(
  definitions(sourceRegisterAll),
  rosterSize,
  "source register-all bundle registered a different number of elements than the roster lists",
);
assert.match(
  import.meta.resolve("@chr33s/base-wc/src/styles.css"),
  /\/src\/styles\.css$/,
  "source stylesheet export does not resolve",
);

const distFiles = new Set(await readdir("dist"));
const missingTypes = [...distFiles]
  .filter((file) => file.endsWith(".js"))
  .filter((file) => !distFiles.has(file.replace(/\.js$/, ".d.ts")));
assert.deepEqual(
  missingTypes,
  [],
  `public JS subpaths without declarations: ${missingTypes.join(", ")}`,
);

console.log(
  `package checks passed (root ${rootSwitch.length} B, subpath ${subpathSwitch.length} B, source ${sourceSwitch.length} B, register-all ${registerAll.length} B)`,
);
