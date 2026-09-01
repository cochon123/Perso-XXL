import { access, cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const playgroundRoot = path.join(repoRoot, "playground");

const contentFiles = [
  "logger.js",
  "schema.js",
  "openrouter-client.js",
  "picker.js",
  "dom-context.js",
  "executor.js",
  "ai-client.js",
  "direct-agent.js",
  "content.js",
  "tools-def.js",
  "base.css",
  "chat-interface.css"
];

const chatInterfaceFiles = [
  "main.js",
  "component.css",
  "embedded.css"
];

try {
  const contentOut = path.join(playgroundRoot, "content");
  const vendorOut = path.join(contentOut, "vendor");
  const chatOut = path.join(playgroundRoot, "chat-interface");

  await mkdir(contentOut, { recursive: true });
  await mkdir(vendorOut, { recursive: true });
  await mkdir(chatOut, { recursive: true });

  for (const fileName of contentFiles) {
    await cp(
      path.join(repoRoot, "content", fileName),
      path.join(contentOut, fileName)
    );
  }

  await cp(
    path.join(repoRoot, "content/vendor/gsap.min.js"),
    path.join(vendorOut, "gsap.min.js")
  );

  for (const fileName of chatInterfaceFiles) {
    await cp(
      path.join(repoRoot, "chat-interface", fileName),
      path.join(chatOut, fileName)
    );
  }

  const fontsSource = path.join(repoRoot, "chat-interface/fonts");
  try {
    await access(fontsSource);
    await cp(fontsSource, path.join(chatOut, "fonts"), { recursive: true });
  } catch (_error) {}

  console.log("playground engine copies updated");
} catch (error) {
  console.error("Failed to build playground copies:");
  console.error(error?.stack || error);
  process.exit(1);
}
