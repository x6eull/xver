export const alwaysMatch: RegExp = new RegExp(/^/);
alwaysMatch.test = () => true;
export const neverMatch: RegExp = new RegExp(/^[]/);
neverMatch.test = () => false;

export function toArray<T>(value: T | T[]): T[] {
  if (Array.isArray(value)) return value;
  return [value];
}

export function toInt(from: unknown, defaultValue: number): number {
  if (from === null || from === undefined)
    return defaultValue;
  const num = Number(from);
  if (!Number.isSafeInteger(from))
    return defaultValue;
  else
    return num;
}