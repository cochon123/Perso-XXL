import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

const rootDir = resolve(import.meta.dirname, "..");

describe("Perso content runtime in happy-dom", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    window.PersoLogger = {
      debug() {},
      info() {},
      warn() {},
      error() {}
    };
    loadContentScript("content/dom-context.js");
    loadContentScript("content/executor.js");
  });

  it("collects visible DOM context and builds a selection summary", () => {
    document.body.innerHTML = `
      <main>
        <article class="video-card" data-channel="Mark Rober">
          <a id="video-title" aria-label="World's Smallest Nerf Gun">World's Smallest Nerf Gun</a>
        </article>
        <button style="display: none" aria-label="Hidden menu">Menu</button>
      </main>
    `;
    installRectMock();

    const context = window.PersoDomContext.collectPageDom({ maxNodes: 20 });
    const selection = window.PersoDomContext.buildSelection(document.querySelector(".video-card"), "sel_1");

    expect(context.nodes.some((node) => node.classes.includes("video-card"))).toBe(true);
    expect(context.hiddenInteractiveNodes[0]).toMatchObject({ tag: "button", ariaLabel: "Hidden menu" });
    expect(selection).toMatchObject({
      id: "sel_1",
      tag: "article",
      elementKind: "text"
    });
    expect(selection.selectorHints).toContain("article.video-card");
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
});

function loadContentScript(relativePath) {
  window.eval(readFileSync(resolve(rootDir, relativePath), "utf8"));
}

function installRectMock() {
  for (const element of [document.body, ...document.body.querySelectorAll("*")]) {
    element.getBoundingClientRect = () => {
      const hidden = element.style.display === "none";
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: hidden ? 0 : 120,
        bottom: hidden ? 0 : 32,
        width: hidden ? 0 : 120,
        height: hidden ? 0 : 32
      };
    };
  }
}
