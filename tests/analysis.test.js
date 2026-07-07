import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { buildAnalysisQueue } from "../js/analysis.js";
import { state } from "../js/state.js";

function makeCard(overrides = {}) {
  return {
    id: "x",
    displayName: "Name",
    analysis: { status: "idle" },
    ...overrides
  };
}

describe("buildAnalysisQueue", () => {
  beforeEach(() => {
    state.cards = [];
  });

  it("queues every eligible card in 'all' mode", () => {
    state.cards = [makeCard({ id: "a", displayName: "Alpha" })];
    const queue = buildAnalysisQueue("all");
    assert.equal(queue.length, 1);
    assert.deepEqual(queue[0], {
      cardId: "a",
      label: "Alpha",
      type: "analyze",
      status: "queued",
      attempts: 0,
      maxAttempts: 2,
      reason: ""
    });
  });

  it("uses the folder-analyze type in 'folder' mode", () => {
    state.cards = [makeCard({ id: "b", displayName: "Beta" })];
    const queue = buildAnalysisQueue("folder");
    assert.equal(queue[0].type, "folder-analyze");
    assert.equal(queue[0].status, "queued");
    assert.equal(queue[0].maxAttempts, 2);
  });

  it("skips cards whose analysis status is already 'done'", () => {
    state.cards = [makeCard({ id: "c", displayName: "Gamma", analysis: { status: "done" } })];
    const queue = buildAnalysisQueue("all");
    assert.deepEqual(queue[0], {
      cardId: "c",
      label: "Gamma",
      type: "analyze",
      status: "skipped",
      attempts: 0,
      maxAttempts: 0,
      reason: "Skipped because organizer analysis already exists."
    });
  });

  it("handles a mix of done and pending cards", () => {
    state.cards = [
      makeCard({ id: "p1", displayName: "Pending1", analysis: { status: "idle" } }),
      makeCard({ id: "d1", displayName: "Done1", analysis: { status: "done" } }),
      makeCard({ id: "p2", displayName: "Pending2", analysis: { status: "error" } })
    ];
    const queue = buildAnalysisQueue("all");
    assert.equal(queue.length, 3);
    const byId = Object.fromEntries(queue.map((item) => [item.cardId, item]));
    assert.equal(byId.p1.status, "queued");
    assert.equal(byId.p2.status, "queued");
    assert.equal(byId.d1.status, "skipped");
    assert.equal(byId.d1.maxAttempts, 0);
    assert.equal(byId.p1.maxAttempts, 2);
  });

  it("returns an empty array when there are no cards", () => {
    state.cards = [];
    assert.deepEqual(buildAnalysisQueue("all"), []);
  });
});
