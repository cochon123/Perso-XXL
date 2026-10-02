import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

const rootDir = resolve(import.meta.dirname, "..");

describe("Perso content runtime in happy-dom", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    delete window.PersoDemo;
    delete window.PersoExtension;
    window.PersoLogger = {
      debug() {},
      info() {},
      warn() {},
      error() {}
    };
    loadContentScript("content/schema.js");
    loadContentScript("content/dom-context.js");
    loadContentScript("content/executor.js");
  });

  it("collects visible DOM context and builds a selection summary", () => {
    document.body.innerHTML = `
      <main>
        <article class="video-card" data-channel="Mark Rober">
          <a id="video-title" aria-label="World's Smallest Nerf Gun">World's Smallest Nerf Gun</a>
        </article>
        <article class="video-card sponsored-card" data-sponsored="true" data-channel="CloudDesk">
          <span class="sponsor-badge">Sponsored</span>
        </article>
        <button style="display: none" aria-label="Hidden menu">Menu</button>
      </main>
    `;
    installRectMock();

    const context = window.PersoDomContext.collectPageDom({ maxNodes: 20 });
    const selection = window.PersoDomContext.buildSelection(document.querySelector(".video-card"), "sel_1");
    const channelNode = context.nodes.find((node) => node.id === "video-title");
    const sponsoredNode = context.nodes.find((node) => node.dataSponsored === "true");

    expect(context.nodes.some((node) => node.classes.includes("video-card"))).toBe(true);
    expect(context.hiddenInteractiveNodes[0]).toMatchObject({ tag: "button", ariaLabel: "Hidden menu" });
    expect(channelNode.selectorHints).toContain("a[aria-label=\"World's Smallest Nerf Gun\"]");
    expect(channelNode.semanticContainer).toMatchObject({
      tag: "article",
      dataChannel: "Mark Rober"
    });
    expect(channelNode.semanticContainer.selectorHints).toContain("article[data-channel=\"Mark Rober\"]");
    expect(sponsoredNode.selectorHints).toContain("article[data-sponsored=\"true\"]");
    expect(selection).toMatchObject({
      id: "sel_1",
      tag: "article",
      elementKind: "text"
    });
    expect(selection.selectorHints).toContain("article.video-card");
  });

  it("walks through zero-size containers when collecting DOM context", () => {
    document.body.innerHTML = `
      <main class="app-shell">
        <section class="feed">
          <article class="video-card" data-channel="Ada">A visible card</article>
        </section>
      </main>
    `;
    installRectMock({
      zeroSizeSelectors: ["body", ".app-shell"]
    });

    const context = window.PersoDomContext.collectPageDom({ maxNodes: 20 });

    expect(context.nodes.some((node) => node.classes.includes("app-shell"))).toBe(false);
    expect(context.nodes.some((node) => node.classes.includes("feed"))).toBe(true);
    expect(context.nodes.some((node) => node.classes.includes("video-card"))).toBe(true);
  });

  it("does not collect children hidden by display none containers", () => {
    document.body.innerHTML = `
      <main style="display: none">
        <article class="hidden-card">Hidden card</article>
      </main>
    `;
    installRectMock();

    const context = window.PersoDomContext.collectPageDom({ maxNodes: 20 });

    expect(context.nodes.some((node) => node.classes.includes("hidden-card"))).toBe(false);
  });

  it("allows the landing demo to target its embedded ai input", () => {
    document.body.innerHTML = `
      <main>
        <section class="productivity-ai-wrap">
          <div class="preview-stack">
            <div class="ai-input" id="ai-input" data-state="idle">
              <div id="prompt-editor" role="textbox">Describe what you want to change</div>
            </div>
          </div>
        </section>
      </main>
    `;
    window.PersoDemo = { enabled: true };
    installRectMock();

    const context = window.PersoDomContext.collectPageDom({ maxNodes: 20 });

    expect(context.nodes.some((node) => node.id === "ai-input")).toBe(true);
  });

  it("keeps extension ai input chrome out of normal page context", () => {
    document.body.innerHTML = `
      <main>
        <article class="content-card">Page content</article>
        <div class="ai-input" id="ai-input" data-state="idle">
          <div id="prompt-editor" role="textbox">Extension prompt</div>
        </div>
      </main>
    `;
    installRectMock();

    const context = window.PersoDomContext.collectPageDom({ maxNodes: 20 });

    expect(context.nodes.some((node) => node.classes.includes("content-card"))).toBe(true);
    expect(context.nodes.some((node) => node.id === "ai-input")).toBe(false);
  });

  it("applies and reverts visibility, style, and inserted elements", () => {
    document.body.innerHTML = `
      <main>
        <article class="sponsored-card">Sponsored CloudDesk</article>
        <section class="toolbar"></section>
      </main>
    `;
    installRectMock();

    const plan = {
      site: { hostname: "fixture.local" },
      targetMap: {
        sponsored: { selectors: [".sponsored-card"] },
        toolbar: { selectors: [".toolbar"] }
      },
      rules: [
        { id: "hide-sponsored", type: "visibility", targetRef: "sponsored", action: "hide" },
        { id: "style-sponsored", type: "style", targetRef: "sponsored", styles: { opacity: "0.25" } },
        {
          id: "insert-toolbar-button",
          type: "capability",
          capability: "insertElement",
          targetRef: "toolbar",
          placement: "append",
          element: { tag: "button", text: "Focus" }
        }
      ]
    };

    const result = window.PersoExecutor.applyPlan(plan);

    expect(result.totalMatched).toBe(3);
    expect(document.querySelector(".sponsored-card").style.display).toBe("none");
    expect(document.querySelector(".sponsored-card").style.opacity).toBe("0.25");
    expect(document.querySelector(".toolbar button").textContent).toBe("Focus");

    window.PersoExecutor.revertPlan();

    expect(document.querySelector(".sponsored-card").getAttribute("style")).toBe(null);
    expect(document.querySelector(".toolbar button")).toBe(null);
  });

  it("normalizes visibility variants returned by the model", async () => {
    window.PersoEnv = {
      OPENROUTER_API_KEY: "test-key",
      OPENROUTER_MODEL: "test-model"
    };
    window.PersoOpenRouter = {
      buildReasoningConfig: () => ({}),
      chatCompletion: async () => ({
        ok: true,
        status: 200,
        content: JSON.stringify({
          site: { hostname: "fixture.local" },
          targetMap: {
            sponsored: { selectors: [".sponsored-card"] }
          },
          rules: [
            { id: "hide-visibility", type: "visibility", targetRef: "sponsored", visibility: "hidden" },
            { id: "hide-visible", type: "visibility", targetRef: "sponsored", visible: false },
            { id: "hide-style", type: "visibility", targetRef: "sponsored", styles: { display: "none" } }
          ]
        })
      })
    };
    loadContentScript("content/ai-client.js");

    const plan = await window.PersoAiClient.generateTransformPlan({
      prompt: "hide sponsored",
      pageContext: { hostname: "fixture.local", pathname: "/" },
      pageDom: { nodes: [] },
      selections: []
    });

    expect(plan.rules).toEqual([
      { id: "hide-visibility", type: "visibility", targetRef: "sponsored", action: "hide" },
      { id: "hide-visible", type: "visibility", targetRef: "sponsored", action: "hide" },
      { id: "hide-style", type: "visibility", targetRef: "sponsored", action: "hide" }
    ]);
    expect(window.PersoAiClient.validateTransformPlan(plan)).toEqual({ ok: true, errors: [] });
  });

  it("strips inline asset data from repair prompts", async () => {
    let requestMessages = null;
    window.PersoEnv = {
      OPENROUTER_API_KEY: "test-key",
      OPENROUTER_MODEL: "test-model"
    };
    window.PersoOpenRouter = {
      buildReasoningConfig: () => ({}),
      chatCompletion: async ({ messages }) => {
        requestMessages = messages;
        return {
          ok: true,
          status: 200,
          content: JSON.stringify({
            site: { hostname: "fixture.local" },
            targetMap: {
              page: { selectors: ["body"] }
            },
            rules: [
              {
                id: "set-background",
                type: "style",
                targetRef: "page",
                styles: {
                  backgroundImage: "asset:uploadedImage",
                  backgroundSize: "cover",
                  backgroundPosition: "center center",
                  backgroundRepeat: "no-repeat"
                }
              }
            ]
          })
        };
      }
    };
    loadContentScript("content/ai-client.js");

    await window.PersoAiClient.generateTransformPlan({
      prompt: "repair background image",
      pageContext: { hostname: "fixture.local", pathname: "/" },
      pageDom: { nodes: [] },
      selections: [],
      availableAssets: [{ assetId: "uploadedImage", name: "JapanSwans.jpg", type: "image/jpeg" }],
      previousPlan: {
        site: { hostname: "fixture.local" },
        assets: {
          uploadedImage: {
            type: "image/jpeg",
            name: "JapanSwans.jpg",
            dataUrl: "data:image/jpeg;base64,THIS_SHOULD_NOT_BE_SENT"
          }
        },
        targetMap: {
          page: { selectors: ["body"] }
        },
        rules: [
          {
            id: "bad-background",
            type: "style",
            targetRef: "page",
            styles: { backgroundImage: "JapanSwans.jpg" }
          }
        ]
      },
      validationErrors: ["Rule 0 backgroundImage must use asset:<assetId>."]
    });

    const serialized = JSON.stringify(requestMessages);
    expect(serialized).not.toContain("THIS_SHOULD_NOT_BE_SENT");
    expect(serialized).not.toContain("data:image/jpeg;base64");
    expect(serialized).toContain("JapanSwans.jpg");
    expect(serialized).toContain("uploadedImage");
  });

  it("normalizes multiple model modifications into separate titled plans", async () => {
    window.PersoEnv = {
      OPENROUTER_API_KEY: "test-key",
      OPENROUTER_MODEL: "test-model"
    };
    window.PersoOpenRouter = {
      buildReasoningConfig: () => ({}),
      chatCompletion: async () => ({
        ok: true,
        status: 200,
        content: JSON.stringify({
          modifications: [
            {
              title: "Hide sidebar",
              prompt: "Hide the sidebar",
              targetMap: {
                sidebar: { selectors: [".sidebar"] }
              },
              rules: [
                { id: "hide-sidebar", type: "visibility", targetRef: "sidebar", action: "hide" }
              ]
            },
            {
              title: "Blue button",
              prompt: "Make the button blue",
              targetMap: {
                button: { selectors: [".primary-button"] }
              },
              rules: [
                { id: "blue-button", type: "style", targetRef: "button", styles: { backgroundColor: "blue" } }
              ]
            }
          ]
        })
      })
    };
    loadContentScript("content/ai-client.js");

    const plans = await window.PersoAiClient.generateModificationPlans({
      prompt: "hide the sidebar and make the button blue",
      pageContext: { hostname: "fixture.local", pathname: "/" },
      pageDom: { nodes: [] },
      selections: []
    });

    expect(plans.map((plan) => plan.title)).toEqual(["Hide sidebar", "Blue button"]);
    expect(plans.map((plan) => plan.sourcePrompt)).toEqual(["Hide the sidebar", "Make the button blue"]);
    expect(plans.every((plan) => window.PersoAiClient.validateTransformPlan(plan).ok)).toBe(true);
  });

  it("loads runtime schema before scripts that consume it", () => {
    const chromiumScripts = readManifestScripts("manifest.json");
    const firefoxScripts = readManifestScripts("manifest-firefox.json");
    const background = readFileSync(resolve(rootDir, "background/service-worker.js"), "utf8");

    expectScriptOrder(chromiumScripts, "content/schema.js", "content/executor.js");
    expectScriptOrder(chromiumScripts, "content/schema.js", "content/ai-client.js");
    expectScriptOrder(firefoxScripts, "content/schema.js", "content/executor.js");
    expectScriptOrder(firefoxScripts, "content/schema.js", "content/ai-client.js");
    expect(background.indexOf('"content/schema.js"')).toBeLessThan(background.indexOf('"content/executor.js"'));
    expect(background.indexOf('"content/content.js"')).toBeLessThan(background.indexOf('"chat-interface/main.js"'));
  });
});

function loadContentScript(relativePath) {
  window.eval(readFileSync(resolve(rootDir, relativePath), "utf8"));
}

function readManifestScripts(relativePath) {
  const manifest = JSON.parse(readFileSync(resolve(rootDir, relativePath), "utf8"));
  return manifest.content_scripts[0].js;
}

function expectScriptOrder(scripts, first, second) {
  expect(scripts).toContain(first);
  expect(scripts).toContain(second);
  expect(scripts.indexOf(first)).toBeLessThan(scripts.indexOf(second));
}

function installRectMock(options = {}) {
  const zeroSizeSelectors = options.zeroSizeSelectors || [];

  for (const element of [document.body, ...document.body.querySelectorAll("*")]) {
    element.getBoundingClientRect = () => {
      const hidden = element.style.display === "none";
      const zeroSize = zeroSizeSelectors.some((selector) => element.matches(selector));
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: hidden || zeroSize ? 0 : 120,
        bottom: hidden || zeroSize ? 0 : 32,
        width: hidden || zeroSize ? 0 : 120,
        height: hidden || zeroSize ? 0 : 32
      };
    };
  }
}
