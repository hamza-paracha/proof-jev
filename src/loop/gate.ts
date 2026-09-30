/** One expensive operation per host process. Callers retry busy events; no growing queue. */
export class BusyError extends Error {
  readonly code = "busy";
  constructor() { super("A verification is already running; retry after it finishes."); }
}
export class RunGate {
  busy = false;
  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.busy) throw new BusyError();
    this.busy = true;
    try { return await operation(); } finally { this.busy = false; }
  }
}
