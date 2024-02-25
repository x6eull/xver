export class XverError extends Error {
  constructor(message?: string, cause?: unknown) { super(message, { cause }) }
}

export function throwErr(message?: string, cause?: unknown): never {
  throw new XverError(message, cause);
}