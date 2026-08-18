import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import process from "node:process";
import { build } from "vite";

async function bundle(contents, sourcefile) {
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
    .flatMap((output) => output.output)
    .filter((output) => output.type === "chunk")
    .map((output) => output.code)
    .join("\n");
}

function definitions(output) {
  return output.match(/customElements\.define\(/g)?.length ?? 0;
}

const [rootSwitch, subpathSwitch, sourceSwitch, registerAll] = await Promise.all([
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
]);

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
]) {
  assert.ok(output.length < 5_000, `${entry} pulled ${output.length} bytes for UISwitch`);
  assert.equal(definitions(output), 1, `${entry} registered unrelated custom elements`);
  assert.match(output, /ui-switch/, `${entry} omitted the requested element registration`);
}

assert.ok(definitions(registerAll) >= 80, "register-all import was incorrectly tree-shaken");
assert.match(registerAll, /ui-combobox/, "register-all output omitted ui-combobox");
assert.doesNotMatch(registerAll, /__perseusUI/, "register-all leaked a package global");

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
