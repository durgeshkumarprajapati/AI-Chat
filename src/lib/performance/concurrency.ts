export interface ConcurrencyTaskOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface ConcurrencyResult<T> {
  status: 'fulfilled' | 'rejected';
  value?: T;
  reason?: any;
  index: number;
}

/**
  * Executes an array of item tasks with a strict bounded concurrency limit,
  * per-task timeouts, cancellation support via AbortSignal, task isolation, and deterministic result ordering.
  */
export async function runWithConcurrencyLimit<I, R>(
  items: I[],
  concurrencyLimit: number,
  taskFn: (_item: I, _index: number) => Promise<R>,
  options?: ConcurrencyTaskOptions
): Promise<ConcurrencyResult<R>[]> {
  if (!items || items.length === 0) {
    return [];
  }

  const limit = Math.max(1, Math.min(concurrencyLimit, items.length));
  const results: ConcurrencyResult<R>[] = new Array(items.length);
  let currentIndex = 0;

  const worker = async (): Promise<void> => {
    while (currentIndex < items.length) {
      if (options?.signal?.aborted) {
        break;
      }

      const index = currentIndex++;
      if (index >= items.length) break;
      const item = items[index]!;

      try {
        let taskPromise = taskFn(item, index);

        if (options?.timeoutMs && options.timeoutMs > 0) {
          let timerId: NodeJS.Timeout;
          const timeoutPromise = new Promise<never>((_, reject) => {
            timerId = setTimeout(() => {
              reject(new Error(`Task at index ${index} timed out after ${options.timeoutMs}ms`));
            }, options.timeoutMs);
          });

          try {
            const val = await Promise.race([taskPromise, timeoutPromise]);
            clearTimeout(timerId!);
            results[index] = { status: 'fulfilled', value: val, index };
          } catch (err) {
            clearTimeout(timerId!);
            results[index] = { status: 'rejected', reason: err, index };
          }
        } else {
          const val = await taskPromise;
          results[index] = { status: 'fulfilled', value: val, index };
        }
      } catch (err) {
        results[index] = { status: 'rejected', reason: err, index };
      }
    }
  };

  const workers = Array.from({ length: limit }, () => worker());
  await Promise.all(workers);

  // Fill any aborted or unexecuted items as rejected for deterministic output array length
  for (let i = 0; i < items.length; i++) {
    if (!results[i]) {
      results[i] = {
        status: 'rejected',
        reason: options?.signal?.aborted
          ? new Error('Operation cancelled by AbortSignal')
          : new Error('Task execution skipped'),
        index: i
      };
    }
  }

  return results;
}
