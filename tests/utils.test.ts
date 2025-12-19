import { describe, expect, test } from "bun:test";
import { formatDuration, ms, msPrecise, msToFriendly } from "../src/utils";

describe("ms", () => {
  test("parses milliseconds", () => {
    expect(ms("1ms")).toBe(1);
    expect(ms("100ms")).toBe(100);
    expect(ms("1000ms")).toBe(1000);
  });

  test("parses seconds", () => {
    expect(ms("1s")).toBe(1000);
    expect(ms("5s")).toBe(5000);
    expect(ms("60s")).toBe(60000);
  });

  test("parses minutes", () => {
    expect(ms("1m")).toBe(60000);
    expect(ms("5m")).toBe(300000);
    expect(ms("60m")).toBe(3600000);
  });

  test("parses hours", () => {
    expect(ms("1h")).toBe(3600000);
    expect(ms("24h")).toBe(86400000);
  });

  test("parses days", () => {
    expect(ms("1d")).toBe(86400000);
    expect(ms("7d")).toBe(604800000);
  });

  test("handles space between number and unit", () => {
    expect(ms("1 s")).toBe(1000);
    expect(ms("5 m")).toBe(300000);
    expect(ms("2 h")).toBe(7200000);
    expect(ms("1 d")).toBe(86400000);
    expect(ms("500 ms")).toBe(500);
  });

  test("handles negative values", () => {
    expect(ms("-1s")).toBe(-1000);
    expect(ms("-5m")).toBe(-300000);
  });

  test("throws on invalid input", () => {
    // @ts-expect-error - testing invalid input
    expect(() => ms("invalid")).toThrow();
    // @ts-expect-error - testing invalid input
    expect(() => ms("1x")).toThrow();
    // @ts-expect-error - testing invalid input
    expect(() => ms("abc")).toThrow();
    // @ts-expect-error - testing invalid input
    expect(() => ms("")).toThrow();
  });
});

describe("msPrecise", () => {
  test("sums multiple durations", () => {
    expect(msPrecise(["1s", "1ms"])).toBe(1001);
    expect(msPrecise(["1h", "30m"])).toBe(5400000);
    expect(msPrecise(["1d", "12h"])).toBe(129600000);
  });

  test("handles single duration", () => {
    expect(msPrecise(["1s"])).toBe(1000);
    expect(msPrecise(["500ms"])).toBe(500);
  });

  test("handles empty array", () => {
    expect(msPrecise([])).toBe(0);
  });

  test("handles mixed units", () => {
    expect(msPrecise(["1d", "2h", "30m", "45s", "500ms"])).toBe(
      86400000 + 7200000 + 1800000 + 45000 + 500
    );
  });
});

describe("msToFriendly", () => {
  test("converts to seconds by default for small values", () => {
    expect(msToFriendly(1000)).toBe("1s");
    expect(msToFriendly(5000)).toBe("5s");
    expect(msToFriendly(30000)).toBe("30s");
  });

  test("converts to minutes for medium values", () => {
    expect(msToFriendly(60000)).toBe("1m");
    expect(msToFriendly(300000)).toBe("5m");
  });

  test("converts to hours for larger values", () => {
    expect(msToFriendly(3600000)).toBe("1h");
    expect(msToFriendly(7200000)).toBe("2h");
  });

  test("converts to days for very large values", () => {
    expect(msToFriendly(86400000)).toBe("1d");
    expect(msToFriendly(172800000)).toBe("2d");
  });

  test("respects explicit unit parameter", () => {
    expect(msToFriendly(3600000, "ms")).toBe("3600000ms");
    expect(msToFriendly(3600000, "s")).toBe("3600s");
    expect(msToFriendly(3600000, "m")).toBe("60m");
    expect(msToFriendly(3600000, "h")).toBe("1h");
    expect(msToFriendly(86400000, "d")).toBe("1d");
  });

  test("handles negative values", () => {
    expect(msToFriendly(-1000)).toBe("-1s");
    expect(msToFriendly(-60000)).toBe("-1m");
    expect(msToFriendly(-3600000)).toBe("-1h");
  });

  test("handles zero", () => {
    expect(msToFriendly(0)).toBe("0s");
  });

  test("rounds values appropriately", () => {
    expect(msToFriendly(1500)).toBe("2s");
    expect(msToFriendly(90000)).toBe("2m");
  });
});

describe("formatDuration", () => {
  test("formats with default units (dhms)", () => {
    expect(formatDuration(ms("25h"))).toBe("1d 1h 0m 0s");
    expect(formatDuration(ms("1d"))).toBe("1d 0h 0m 0s");
    expect(formatDuration(ms("1h"))).toBe("0d 1h 0m 0s");
  });

  test("formats with specific units", () => {
    expect(formatDuration(ms("90m"), "hm")).toBe("1h 30m");
    expect(formatDuration(ms("2h"), "m")).toBe("120m");
    expect(formatDuration(ms("1d"), "h")).toBe("24h");
  });

  test("includes milliseconds when MS is specified", () => {
    expect(formatDuration(1500, "sMS")).toBe("1s 500ms");
    expect(formatDuration(1001, "sMS")).toBe("1s 1ms");
  });

  test("handles negative values", () => {
    expect(formatDuration(-3600000, "hm")).toBe("-1h 0m");
    expect(formatDuration(-90000, "ms")).toBe("-1m 30s");
  });

  test("handles zero", () => {
    expect(formatDuration(0, "hms")).toBe("0h 0m 0s");
  });

  test("handles complex durations", () => {
    const duration = ms("1d") + ms("2h") + ms("30m") + ms("45s");
    expect(formatDuration(duration, "dhms")).toBe("1d 2h 30m 45s");
  });

  test("handles only days", () => {
    expect(formatDuration(ms("3d"), "d")).toBe("3d");
  });

  test("handles only seconds", () => {
    expect(formatDuration(ms("2m"), "s")).toBe("120s");
  });
});

