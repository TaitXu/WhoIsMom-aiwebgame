export function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${String(value)}`);
}

export function invariant(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
