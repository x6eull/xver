import { throwErr } from "./error";

export const alwaysMatch: RegExp = new RegExp(/^/);
alwaysMatch.test = () => true;
export const neverMatch: RegExp = new RegExp(/^[]/);
neverMatch.test = () => false;

export function toArray<T>(value: T | T[]): T[] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

export function toInt(from: unknown, defaultValue: number): number {
  if (from === undefined || from === null)
    return defaultValue;
  const num = Number(from);
  if (!Number.isSafeInteger(from))
    return defaultValue;
  else
    return num;
}

export type ElementOf<A extends any[]> = A extends (infer G)[] ? G : never;
export function removeProps<TObj extends Record<keyof any, any>, Tkey extends keyof TObj>(obj: TObj, keyToRemove: Tkey[]): Omit<TObj, Tkey> {
  const nObj: Partial<TObj> = { ...obj };
  for (const key of keyToRemove)
    delete nObj[key];
  return nObj as any;
}

/**Check whether arg **is** `undefined`, `null`, empty array or string consisted of whitespace only. */
export function isEmpty(target: string | undefined | null | Array<any>): target is '' | undefined | null | [] {
  if (!target)
    return true;
  if (Array.isArray(target))
    return target.length === 0;
  return target.isWhitespace();
}

/**Return a substring of `origin` that ends before the first appearance of `search`. */
export function subStringUntil<TOrigin extends string, TSearch extends string>(origin: TOrigin, search: TSearch, throwIfNotFound = false): string {
  let index: number | undefined = origin.indexOf(search);
  if (index < 0)
    if (throwIfNotFound) throwErr(`No valid substring. Expecting "${search}"`)
    else index = undefined;
  return origin.substring(0, index);
}

declare global {
  interface String {
    /**Return whether this string is consisted of whitespace only.  
     * Whitespace characters are defined in https://tc39.es/ecma262/multipage/ecmascript-language-lexical-grammar.html#sec-white-space.
     */
    isWhitespace(): boolean;
  }

  interface Array<T> {
    /**Return all indexes of the element in array.  
     * If the element never appears, return an empty array.
     */
    indexesOf(searchElement: T, fromIndex?: number): number[];
    /**Sort the array using a reference array.  
     * Each array may not contain a element twice or more times.  
     * Elements not appeared in reference array would be placed at the tail.
     */
    sortLike<TRef extends T[]>(reference: TRef, onUnknownElement?: (element: T, index: number, referenceArray: TRef) => void): this;
  }
}
Object.defineProperty(String.prototype, 'isWhitespace', { value() { return !(this.trim()) } } satisfies ThisType<string>);
Object.defineProperty(Array.prototype, 'indexesOf', {
  value(searchElement: any, fromIndex?: number): number[] {
    fromIndex ??= 0;
    const result: number[] = [];
    while (true) {
      const newIndex = this.indexOf(searchElement, fromIndex);
      if (newIndex < 0) return result;
      result.push(newIndex);
      fromIndex = newIndex + 1;
    }
  }
} satisfies ThisType<any[]>);
Object.defineProperty(Array.prototype, 'sortLike', {
  value(reference: any[], onUnknownElement?: (element: any, index: number, referenceArray: any[]) => void): any[] {
    reference = [...new Set(reference)];
    let sortedLength = 0;
    for (let i = 0; i < reference.length; i++) {
      const refEle = reference[i];
      const indexes = this.indexesOf(refEle, sortedLength);
      if (!indexes.length)
        onUnknownElement?.(refEle, i, reference);
      else indexes.forEach(i => {
        this.copyWithin(sortedLength + 1, sortedLength, i);
        this[sortedLength] = refEle;
        sortedLength++;
      });
    }
    return this;
  }
} satisfies ThisType<Array<unknown>>);

/**Return a function that will memorize the only parameter and result to avoid repeated calculations. */
export function memoFunction<A, R>(innerFunc: (arg: A) => R): (arg: A) => R {
  const memo: Map<A, R> = new Map();
  return (arg: A) => {
    if (memo.has(arg)) return memo.get(arg)!;
    else {
      const result = innerFunc(arg);
      memo.set(arg, result);
      return result;
    }
  };
}

/**
 * Return a new promise that will be resolved with a tuple of a boolean and the value of the promise.  
 * If the promise is resolved, the boolean will be `true` and the value will be the resolved value,  
 * otherwise the boolean will be `false` and the value will be the reason of rejection.
 */
export function asyncFinally<T>(promise: Promise<T>): Promise<[boolean, T]> {
  return promise.then(value => [true, value], reason => [false, reason]);
}