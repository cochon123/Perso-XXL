import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

const rootDir = resolve(import.meta.dirname, "..");

function loadScript(path) {
  window.eval(readFileSync(resolve(rootDir, path), "utf8"));
}

function installVisibleRects() {
  for (const [index, element] of Array.from(document.body.querySelectorAll("*")).entries()) {
    element.getBoundingClientRect = () => ({
      x: 20,
      y: 20 + index * 40,
      top: 20 + index * 40,
      left: 20,
      right: 620,
      bottom: 55 + index * 40,
      width: 600,
      height: 35,
      toJSON() { return this; }
    });
  }
}

function inspectHeading() {
  const snapshot = window.PersoDirectAgent.inspectPage({ query: "Web browser", maxTargets: 20 });
  const heading = snapshot.targets.find((target) => target.elementIdHint === "firstHeading");
  expect(heading).toBeTruthy();
  return { snapshot, heading };
}

describe("direct WebMCP agent plans", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <main id="content">
        <h1 id="firstHeading">Web browser</h1>
        <p id="lead">A web browser is an application for accessing websites.</p>
        <aside id="sidebar">Navigation</aside>
        <button id="menu">Menu</button>
      </main>
    `;
    installVisibleRects();
    window.PersoLogger = { debug() {}, info() {}, warn() {}, error() {} };
    loadScript("content/schema.js");
    loadScript("content/direct-agent.js");
  });

  it("returns opaque targets and compiles a safe direct style plan", () => {
    const { snapshot, heading } = inspectHeading();

    expect(snapshot.oneUse).toBe(true);
    expect(snapshot.expiresInSeconds).toBe(120);
    expect(snapshot.targets.every((target) => !("selector" in target) && !("selectors" in target))).toBe(true);
    expect(heading).toMatchObject({ tag: "h1", text: "Web browser" });

    const prepared = window.PersoDirectAgent.preparePlan({
      snapshotId: snapshot.snapshotId,
      title: "Purple heading",
      rationale: "Make the article title easier to distinguish.",
      rules: [{ type: "style", targetId: heading.targetId, styles: { color: "#7e22ce", fontSize: "32px" } }]
    });

    expect(prepared.risk).toMatchObject({ level: "low", requiresConfirmation: false });
    expect(prepared.plan.targetMap[heading.targetId].selectors).toContain("#firstHeading");
    expect(prepared.plan.rules[0]).toEqual({
      id: "direct_1",
      type: "style",
      targetRef: heading.targetId,
      styles: { color: "#7e22ce", fontSize: "32px" }
    });
  });

  it("makes inspection snapshots one-use", () => {
    const { snapshot, heading } = inspectHeading();
    const input = {
      snapshotId: snapshot.snapshotId,
      title: "Purple heading",
      rules: [{ type: "style", targetId: heading.targetId, styles: { color: "purple" } }]
    };

    window.PersoDirectAgent.preparePlan(input);
    expect(() => window.PersoDirectAgent.preparePlan(input)).toThrow(/already used/i);
  });

  it("rejects a target whose identity changed after inspection", () => {
    const { snapshot, heading } = inspectHeading();
    document.getElementById("firstHeading").textContent = "Changed by the page";

    expect(() => window.PersoDirectAgent.preparePlan({
      snapshotId: snapshot.snapshotId,
      title: "Purple heading",
      rules: [{ type: "style", targetId: heading.targetId, styles: { color: "purple" } }]
    })).toThrow(/changed after inspection/i);
  });

  it("revalidates targets again immediately before application", () => {
    const { snapshot, heading } = inspectHeading();
    const prepared = window.PersoDirectAgent.preparePlan({
      snapshotId: snapshot.snapshotId,
      title: "Purple heading",
      rules: [{ type: "style", targetId: heading.targetId, styles: { color: "purple" } }]
    });

    expect(() => prepared.revalidate()).not.toThrow();
    document.getElementById("firstHeading").textContent = "Page changed during confirmation";
    expect(() => prepared.revalidate()).toThrow(/changed after inspection/i);
  });

  it("rejects raw selectors, executable fields, and unsafe CSS values", () => {
    let inspected = inspectHeading();
    expect(() => window.PersoDirectAgent.preparePlan({
      snapshotId: inspected.snapshot.snapshotId,
      title: "Unsafe",
      rules: [{ type: "style", targetId: inspected.heading.targetId, selector: "body", styles: { color: "red" } }]
    })).toThrow(/blocked field "selector"/i);

    inspected = inspectHeading();
    expect(() => window.PersoDirectAgent.preparePlan({
      snapshotId: inspected.snapshot.snapshotId,
      title: "Unsafe",
      rules: [{ type: "style", targetId: inspected.heading.targetId, styles: { background: "url(https://tracker.test/pixel)" } }]
    })).toThrow(/unsafe value/i);

    inspected = inspectHeading();
    expect(() => window.PersoDirectAgent.preparePlan({
      snapshotId: inspected.snapshot.snapshotId,
      title: "Unsafe",
      rules: [{ type: "capability", capability: "insertElement", targetId: inspected.heading.targetId, element: { tag: "div", innerHTML: "<script>alert(1)</script>" } }]
    })).toThrow(/blocked field "innerHTML"/i);
  });

  it("rejects transport callbacks when they leak into agent-authored plan data", () => {
    const { snapshot, heading } = inspectHeading();
    expect(() => window.PersoDirectAgent.preparePlan({
      snapshotId: snapshot.snapshotId,
      title: "Unsafe callback",
      onProgress() {},
      rules: [{ type: "style", targetId: heading.targetId, styles: { color: "purple" } }]
    })).toThrow(/blocked field "onProgress"/i);
  });

  it("requires confirmation for structural plans", () => {
    const snapshot = window.PersoDirectAgent.inspectPage({ maxTargets: 30 });
    const heading = snapshot.targets.find((target) => target.elementIdHint === "firstHeading");
    const sidebar = snapshot.targets.find((target) => target.elementIdHint === "sidebar");

    const prepared = window.PersoDirectAgent.preparePlan({
      snapshotId: snapshot.snapshotId,
      title: "Move navigation",
      rules: [{
        type: "capability",
        capability: "moveElement",
        targetId: sidebar.targetId,
        placementTargetId: heading.targetId,
        placement: "after"
      }]
    });

    expect(prepared.risk.level).toBe("high");
    expect(prepared.risk.requiresConfirmation).toBe(true);
    expect(prepared.risk.reasons.join(" ")).toMatch(/structural/i);
  });

  it("allows only presentation-safe attributes", () => {
    let inspected = inspectHeading();
    expect(() => window.PersoDirectAgent.preparePlan({
      snapshotId: inspected.snapshot.snapshotId,
      title: "Unsafe link",
      rules: [{ type: "attribute", targetId: inspected.heading.targetId, attribute: "href", value: "https://example.test" }]
    })).toThrow(/aria-label, title, or role/i);

    inspected = inspectHeading();
    const prepared = window.PersoDirectAgent.preparePlan({
      snapshotId: inspected.snapshot.snapshotId,
      title: "Accessible title",
      rules: [{ type: "attribute", targetId: inspected.heading.targetId, attribute: "aria-label", value: "Web browser article" }]
    });
    expect(prepared.plan.rules[0].value).toBe("Web browser article");
  });
});
