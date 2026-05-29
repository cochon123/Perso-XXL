import { readFile, writeFile } from "node:fs/promises";

const manifest = JSON.parse(
  await readFile(new URL("../manifest.json", import.meta.url), "utf8")
);

const firefox = structuredClone(manifest);

firefox.background = {
  scripts: [manifest.background.service_worker]
};

await writeFile(
  new URL("../manifest-firefox.json", import.meta.url),
  JSON.stringify(firefox, null, 2) + "\n"
);

console.log("manifest-firefox.json generated");
