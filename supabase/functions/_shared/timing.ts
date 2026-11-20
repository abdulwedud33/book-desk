/**
 * Uniform timing helper to mitigate timing attacks on public endpoints (e.g., unknown slug enumeration).
 * Ensures that the response takes at least `minDurationMs` milliseconds.
 */
export async function withUniformTiming<T>(
  action: () => Promise<T>,
  minDurationMs = 80
): Promise<T> {
  const start = Date.now();
  try {
    return await action();
  } finally {
    const elapsed = Date.now() - start;
    if (elapsed < minDurationMs) {
      await new Promise((resolve) => setTimeout(resolve, minDurationMs - elapsed));
    }
  }
}
