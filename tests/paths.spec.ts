import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveDshHome, resolveShadowMindRoot } from "../src/paths.js";

describe("resolveDshHome", () => {
  it("prefers a non-blank DSH_HOME", () => {
    expect(resolveDshHome({ DSH_HOME: "/tmp/custom-home" })).toBe("/tmp/custom-home");
  });

  it("treats a blank DSH_HOME as unset", () => {
    expect(resolveDshHome({ DSH_HOME: "   " })).toBe(join(homedir(), ".dsh"));
  });

  it("defaults to ~/.dsh", () => {
    expect(resolveDshHome({})).toBe(join(homedir(), ".dsh"));
  });
});

describe("resolveShadowMindRoot", () => {
  it("places shadow data under $DSH_HOME/agent", () => {
    expect(resolveShadowMindRoot({ DSH_HOME: "/tmp/home" })).toBe("/tmp/home/agent");
  });
});