import { describe, expect, it } from "vitest";
import { MockServer, MockService } from "./mock-gatt.js";
import { parseUuidInput } from "./uuid.js";

describe("parseUuidInput", () => {
  it("returns undefined for blank input", () => {
    expect(parseUuidInput("")).toBeUndefined();
  });
  it("returns undefined for whitespace-only input", () => {
    expect(parseUuidInput("   ")).toBeUndefined();
  });
  it("parses a 0x-prefixed short UUID as a number", () => {
    expect(parseUuidInput("0xfe59")).toBe(0xfe59);
  });
  it("is case-insensitive for short UUIDs", () => {
    expect(parseUuidInput("0xFE59")).toBe(0xfe59);
  });
  it("trims surrounding whitespace", () => {
    expect(parseUuidInput("  0xfe59  ")).toBe(0xfe59);
  });
  it("lowercases a full 128-bit UUID string", () => {
    expect(parseUuidInput("8EC90001-F315-4F60-9FB8-838830DAEA50")).toBe(
      "8ec90001-f315-4f60-9fb8-838830daea50",
    );
  });
  it("passes through an already-lowercase 128-bit UUID unchanged", () => {
    const uuid = "8ec90001-f315-4f60-9fb8-838830daea50";
    expect(parseUuidInput(uuid)).toBe(uuid);
  });
  it("throws a labeled error for a string that is neither short-hex nor a canonical UUID", () => {
    expect(() => parseUuidInput("not-a-uuid")).toThrow(/Invalid UUID/);
  });
  it("throws for hex digits missing the 0x short-form prefix", () => {
    expect(() => parseUuidInput("fe59")).toThrow(/Invalid UUID/);
  });
});

describe("parseUuidInput short-form output flows unstringified into a GATT resolver", () => {
  it("resolves a mock service keyed by the numeric short UUID", async () => {
    const service = new MockService(new Map(), String(0xfe59));
    const server = new MockServer(new Map([[String(0xfe59), service]]));
    const parsed = parseUuidInput("0xfe59");
    if (parsed === undefined) {
      throw new Error("expected a parsed UUID");
    }
    expect(typeof parsed).toBe("number");
    await expect(server.getPrimaryService(parsed)).resolves.toBe(service);
  });
});
