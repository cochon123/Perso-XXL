import { readFile, writeFile, mkdir } from "node:fs/promises";

const envText = await readFile(new URL("../.env", import.meta.url), "utf8");
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    })
);

await mkdir(new URL("../config", import.meta.url), { recursive: true });

await writeFile(
  new URL("../config/env.js", import.meta.url),
  `window.PersoEnv = ${JSON.stringify(
    {
      OPENROUTER_API_KEY: env.OPENROUTER_API_KEY || "",
      OPENROUTER_MODEL: env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash",
      OPENROUTER_REASONING_ENABLED: env.OPENROUTER_REASONING_ENABLED !== "false",
      OPENROUTER_REASONING_EFFORT: env.OPENROUTER_REASONING_EFFORT || "low",
      OPENROUTER_REASONING_EXCLUDE: env.OPENROUTER_REASONING_EXCLUDE !== "false",
      DEV_LOGS: env.DEV_LOGS !== "false"
    },
    null,
    2
  )};\n`
);
