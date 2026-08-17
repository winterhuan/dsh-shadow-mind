import { describe, expect, it } from "vitest";
import { createRandom } from "../src/random.js";

describe("createRandom", () => {
  it("is reproducible for the same seed", () => {
    const a = createRandom(42);
    const b = createRandom(42);
    expect(a()).toBe(b());
    expect(a()).toBe(b());
    expect(a()).toBe(b());
  });

  it("differs for different seeds in practice", () => {
    const a = createRandom(1);
    const b = createRandom(2);
    const values = Array.from({ length: 8 }, () => a() !== b());
    expect(values.some(Boolean)).toBe(true);
  });

  it("stays within [0, 1)", () => {
    const random = createRandom(7);
    for (let index = 0; index < 1000; index += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("returns Math.random without a seed", () => {
    expect(createRandom()).toBe(Math.random);
  });
});