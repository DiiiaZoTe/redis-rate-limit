export type Unit = "ms" | "s" | "m" | "h" | "d";
export type Duration = `${number} ${Unit}` | `${number}${Unit}`;

/**
 * Convert a human readable duration to milliseconds
 * @param d The duration string to convert.
 * @example ms("1d") // 86400000
 * @note "ms" | "s" | "m" | "h" | "d" are the only valid units
 */
export function ms(d: Duration): number {
  const match = d.match(/^(-?\d+)\s?(ms|s|m|h|d)$/);
  if (!match || !match[1] || !match[2]) {
    throw new Error(`Unable to parse window size: ${d}`);
  }
  const time = Number.parseInt(match[1], 10);
  const unit = match[2] as Unit;

  switch (unit) {
    case "ms":
      return time;
    case "s":
      return time * 1000;
    case "m":
      return time * 1000 * 60;
    case "h":
      return time * 1000 * 60 * 60;
    case "d":
      return time * 1000 * 60 * 60 * 24;

    default:
      throw new Error(`Unable to parse window size: ${d}`);
  }
}

/**
 * Sum durations expressed in an array of strings, returning total milliseconds.
 * Useful for creating 1h30m from `["1h", "30m"]` instead of `"90m"`
 * @param durations Array of duration strings.
 * @example msPrecise(["1s", "1ms"]) // 1001
 */
export function msPrecise(durations: Duration[]): number {
  return durations.reduce((acc, duration) => acc + ms(duration), 0);
}

/**
 * Convert milliseconds to the specified or most appropriate human-readable unit.
 * @param ms The duration in milliseconds.
 * @param unit Optional parameter to specify the output unit.
 */
export function msToFriendly(ms: number, unit?: Unit): string {
  const absMs = Math.abs(ms);
  const sign = ms < 0 ? "-" : "";

  // Decide which unit to use either based on input or by determining the best fit
  const defaultUnit = () => {
    if (absMs < 1000 * 60) return "s";
    if (absMs < 1000 * 60 * 60) return "m";
    if (absMs < 1000 * 60 * 60 * 24) return "h";
    return "d";
  };

  const finalUnit = unit || defaultUnit();

  switch (finalUnit) {
    case "ms":
      return `${sign}${absMs}ms`;
    case "s":
      return `${sign}${Math.round(absMs / 1000)}s`;
    case "m":
      return `${sign}${Math.round(absMs / (1000 * 60))}m`;
    case "h":
      return `${sign}${Math.round(absMs / (1000 * 60 * 60))}h`;
    case "d":
      return `${sign}${Math.round(absMs / (1000 * 60 * 60 * 24))}d`;
  }
}

/**
 * Convert milliseconds to a formatted duration based on the specified units,
 * ensuring that each unit contributes to the total in sequence.
 * @param ms The duration in milliseconds.
 * @param units A string representing the units to include, e.g., "dhMS" for days, hours, and milliseconds.
 * @example formatDuration(ms("25h"), "dhms") // "1d 1h 0m 0s"
 * @note The valid units are "d", "h", "m", "s", and "MS" (milliseconds).
 * @note The result will be sorted by magnitude, e.g., "1d 1h" instead of "1h 1d".
 */
export function formatDuration(ms: number, units: string = "dhms"): string {
  const absMs = Math.abs(ms);
  const sign = ms < 0 ? "-" : "";

  const result = [];
  let remainingMs = absMs;

  // Processing each unit in the order of magnitude
  if (units.includes("d")) {
    const days = Math.floor(remainingMs / (1000 * 60 * 60 * 24));
    remainingMs -= days * 1000 * 60 * 60 * 24;
    result.push(`${days}d`);
  }
  if (units.includes("h")) {
    const hours = Math.floor(remainingMs / (1000 * 60 * 60));
    remainingMs -= hours * 1000 * 60 * 60;
    result.push(`${hours}h`);
  }
  if (units.includes("m")) {
    const minutes = Math.floor(remainingMs / (1000 * 60));
    remainingMs -= minutes * 1000 * 60;
    result.push(`${minutes}m`);
  }
  if (units.includes("s")) {
    const seconds = Math.floor(remainingMs / 1000);
    remainingMs -= seconds * 1000;
    result.push(`${seconds}s`);
  }
  if (units.includes("MS")) {
    const milliseconds = Math.round(remainingMs * 100) / 100;
    result.push(`${milliseconds}ms`);
  }

  // Ensuring the order from the largest to the smallest unit
  const unitOrder = ["d", "h", "m", "s", "MS"];
  result.sort(
    (a, b) =>
      unitOrder.indexOf(a[a.length - 1]) - unitOrder.indexOf(b[b.length - 2] || b[b.length - 1]),
  );

  return sign + (result.length > 0 ? result.join(" ") : `0${units[units.length - 1]}`);
}
