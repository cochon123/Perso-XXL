import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rootDir = resolve(import.meta.dirname, "..");

function loadScript(path) {
  window.eval(readFileSync(resolve(rootDir, path), "utf8"));
}

function makeHost(overrides = {}) {
  return {
    inspectPage: vi.fn(async () => ({ snapshotId: "snapshot-1", targets: [] })),
    applyDirectPlan: vi.fn(async () => ({ ok: true, modification: { id: "mod-direct" } })),
    personalize: vi.fn(async () => ({ summary: "Applied safely." })),
    listModifications: vi.fn(async () => []),
    setModificationEnabled: vi.fn(async (id, enabled) => ({ id, enabled, title: "Focus mode" })),
    removeModification: vi.fn(async () => ({ removed: "Focus mode" })),
    undoLast: vi.fn(async () => ({ undone: { id: "mod-1", title: "Focus mode" } })),
    invokeCapability: vi.fn(async () => ({ ok: true, message: "Clicked shortcut." })),
    getAllSiteRecords: vi.fn(async () => []),
    ...overrides
  };
}

describe("WebMCP tool definitions", () => {
  beforeEach(() => {
    delete window.PersoToolsDef;
    window.PersoLogger = { debug() {}, info() {}, warn() {}, error() {} };
    loadScript("content/tools-def.js");
  });

  it("defines the direct-agent and fallback core tools with valid object schemas", () => {
    const tools = window.PersoToolsDef.buildCoreTools(makeHost());

    expect(tools.map((tool) => tool.name)).toEqual([
      "inspect_page",
      "apply_page_plan",
      "personalize_page",
      "list_personalizations",
      "toggle_personalization",
      "undo_last",
      "remove_personalization",
      "get_style_profile",
      "apply_style_profile"
    ]);
    for (const tool of tools) {
      expect(tool.name).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(tool.inputSchema).toMatchObject({ type: "object", properties: expect.any(Object) });
      expect(tool.annotations).toBeTypeOf("object");
      expect(tool.execute).toBeTypeOf("function");
    }
    expect(tools.find((tool) => tool.name === "remove_personalization").annotations.destructiveHint).toBe(true);
    expect(tools.find((tool) => tool.name === "get_style_profile").annotations.readOnlyHint).toBe(true);
  });

  it("forwards personalization options, progress, and the WebMCP abort signal", async () => {
    const host = makeHost();
    const events = [];
    const tool = window.PersoToolsDef.buildCoreTools(host, { notify: (event) => events.push(event) })
      .find((entry) => entry.name === "personalize_page");
    const controller = new AbortController();

    await expect(tool.execute(
      { request: "Make it calmer", intensity: "subtle" },
      { signal: controller.signal }
    )).resolves.toBe("Applied safely.");

    const options = host.personalize.mock.calls[0][0];
    expect(options).toMatchObject({
      prompt: "Make it calmer",
      intensity: "subtle",
      requireConfirmation: true,
      signal: controller.signal
    });
    options.onProgress("validating");
    expect(events).toContainEqual({ tool: "personalize_page", phase: "progress", detail: "validating" });
  });

  it("creates only enabled dynamic tools with unique bounded safe names", () => {
    const tools = window.PersoToolsDef.buildDynamicTools(makeHost(), [
      {
        id: "enabled",
        title: "Enabled",
        enabled: true,
        capabilities: [
          { ruleId: "a", label: "Open newsletter archive!!!" },
          { ruleId: "b", label: "Open newsletter archive!!!" },
          { ruleId: "c", label: "A".repeat(100) }
        ]
      },
      {
        id: "disabled",
        title: "Disabled",
        enabled: false,
        capabilities: [{ ruleId: "d", label: "Must not register" }]
      }
    ]);

    expect(tools).toHaveLength(3);
    expect(new Set(tools.map((tool) => tool.name)).size).toBe(3);
    expect(tools[0].name).toBe("pxxl_open_newsletter_archive");
    expect(tools[1].name).toBe("pxxl_open_newsletter_archive_2");
    for (const tool of tools) {
      expect(tool.name.length).toBeLessThanOrEqual(48);
      expect(tool.name).toMatch(/^pxxl_[a-z0-9_]+$/);
    }
  });

  it("distills enabled cross-site preferences and ignores disabled changes", () => {
    const profile = window.PersoToolsDef.buildStyleProfile([
      {
        key: "site-a",
        record: {
          site: { hostname: "a.test" },
          modifications: [{
            enabled: true,
            plan: {
              targetMap: { page: { selectors: ["body"] }, sidebar: { selectors: [".sidebar"] } },
              rules: [
                { type: "style", targetRef: "page", styles: { backgroundColor: "#111", color: "#fff", fontSize: "20px", lineHeight: "1.6", fontFamily: "Atkinson Hyperlegible" } },
                { type: "visibility", targetRef: "sidebar", action: "hide" }
              ]
            }
          }]
        }
      },
      {
        key: "site-b",
        record: {
          site: { hostname: "b.test" },
          modifications: [{
            enabled: false,
            plan: { rules: [{ type: "style", styles: { fontFamily: "Ignored Font" } }] }
          }]
        }
      }
    ]);

    expect(profile).toMatchObject({
      siteCount: 2,
      modificationCount: 1,
      preferences: {
        colorScheme: "dark",
        textSize: "larger",
        lineSpacing: "roomy",
        fontFamily: "Atkinson Hyperlegible",
        hides: ["sidebars"]
      }
    });
  });

  it("registers tools with one shared signal and stops after abort", async () => {
    const controller = new AbortController();
    const registered = [];
    const modelContext = {
      registerTool: vi.fn(async (tool, options) => {
        registered.push([tool.name, options.signal]);
        controller.abort();
      })
    };

    const count = await window.PersoToolsDef.registerTools(modelContext, [
      { name: "one" },
      { name: "two" }
    ], { signal: controller.signal });

    expect(count).toBe(1);
    expect(registered).toEqual([["one", controller.signal]]);
  });

  it("returns a stable, non-throwing error message when a host call fails", async () => {
    const host = makeHost({ personalize: vi.fn(async () => { throw new Error("planner offline"); }) });
    const tool = window.PersoToolsDef.buildCoreTools(host).find((entry) => entry.name === "personalize_page");

    await expect(tool.execute({ request: "Make it blue" }, {})).resolves.toBe(
      "Could not apply that change: planner offline. Nothing was modified."
    );
  });

  it("serializes inspection results and forwards direct plans with cancellation context", async () => {
    const host = makeHost();
    const tools = window.PersoToolsDef.buildCoreTools(host);
    const inspect = tools.find((tool) => tool.name === "inspect_page");
    const apply = tools.find((tool) => tool.name === "apply_page_plan");
    const controller = new AbortController();

    await expect(inspect.execute({ query: "heading", maxTargets: 20 }, {})).resolves.toBe(
      JSON.stringify({ snapshotId: "snapshot-1", targets: [] })
    );
    expect(host.inspectPage).toHaveBeenCalledWith({ query: "heading", maxTargets: 20 });

    const input = { snapshotId: "snapshot-1", title: "Heading", rules: [{ type: "style", targetId: "target_1", styles: { color: "purple" } }] };
    await expect(apply.execute(input, { signal: controller.signal })).resolves.toContain("mod-direct");
    expect(host.applyDirectPlan.mock.calls[0][0]).toMatchObject({ ...input, signal: controller.signal });
    expect(host.applyDirectPlan.mock.calls[0][0].onProgress).toBeTypeOf("function");
  });
});
