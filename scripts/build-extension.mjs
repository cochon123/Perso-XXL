import { access, cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const targets = {
  chromium: {
    manifest: "manifest.json",
    outDir: "dist/chromium"
  },
  firefox: {
    manifest: "manifest-firefox.json",
    outDir: "dist/firefox"
  }
};

const extensionPaths = [
  "background",
  "chat-interface",
  "config",
  "content",
  "dashboard"
];

const requestedTarget = process.argv[2];
const selectedTargets = requestedTarget
  ? [[requestedTarget, targets[requestedTarget]]]
  : Object.entries(targets);

if (requestedTarget && !targets[requestedTarget]) {
  console.error(`Unknown browser target: ${requestedTarget}`);
  console.error(`Expected one of: ${Object.keys(targets).join(", ")}`);
  process.exit(1);
}

for (const [browser, target] of selectedTargets) {
  const outPath = path.join(repoRoot, target.outDir);

  try {
    await rm(outPath, { recursive: true, force: true });
    await mkdir(outPath, { recursive: true });

    for (const relativePath of extensionPaths) {
      await cp(path.join(repoRoot, relativePath), path.join(outPath, relativePath), {
        recursive: true
      });
    }

    await cp(path.join(repoRoot, target.manifest), path.join(outPath, "manifest.json"));
    await ensureRuntimeEnv(outPath);
    await writeFile(path.join(outPath, "BROWSER_TARGET"), `${browser}\n`);

    console.log(`${browser} extension built at ${target.outDir}`);
  } catch (error) {
    console.error(
      `Failed to build ${browser} extension from ${target.manifest} to ${target.outDir}:`
    );
    console.error(error?.stack || error);
    process.exit(1);
  }
}

async function ensureRuntimeEnv(outPath) {
  const outputEnvPath = path.join(outPath, "config/env.js");

  try {
    await access(outputEnvPath);
  } catch (_error) {
    await cp(
      path.join(repoRoot, "config/env.example.js"),
      outputEnvPath
    );
  }
}
