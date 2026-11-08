(() => {
  async function mapLimit(items, limit, worker, onProgress) {
    const input = Array.from(items || []);
    const size = Math.max(1, Math.min(16, Number(limit) || 1));
    const output = new Array(input.length);
    let cursor = 0;
    let completed = 0;
    async function run() {
      while (true) {
        const index = cursor++;
        if (index >= input.length) return;
        try { output[index] = await worker(input[index], index); }
        catch (error) { if (error?.name === "AbortError") throw error; output[index] = { error: error?.message || String(error) }; }
        completed++;
        if (onProgress) await onProgress({ completed, total: input.length, index, result: output[index] });
      }
    }
    await Promise.all(Array.from({ length: Math.min(size, input.length) }, run));
    return output;
  }
  globalThis.ExtractorConcurrency = Object.freeze({ mapLimit });
})();
