// Keep external updates bounded and wait for every started update before reporting results.
export async function syncProductTargets<T>(targets: T[], sync: (target: T) => Promise<unknown>) {
  let cursor = 0;
  const errors: unknown[] = [];
  await Promise.all(Array.from({ length: Math.min(3, targets.length) }, async () => {
    while (cursor < targets.length) {
      const target = targets[cursor++];
      try { await sync(target); } catch (error) { errors.push(error); }
    }
  }));
  if (errors.length) throw errors[0];
}
