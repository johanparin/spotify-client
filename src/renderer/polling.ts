export interface PollSchedulerOptions<T> {
  clearTimer(timer: number): void;
  hiddenDelayMs?: number;
  isVisible(): boolean;
  nextDelayMs?(value: T): number;
  onError(error: unknown): void;
  onResult(value: T): void;
  poll(): Promise<T>;
  setTimer(callback: () => void, delayMs: number): number;
  visibleDelayMs?: number;
}

export class PollScheduler<T> {
  private actionRevision = 0;
  private immediateAfterPending = false;
  private pending = false;
  private resultDelayMs: number | null = null;
  private running = false;
  private timer: number | null = null;

  constructor(private readonly options: PollSchedulerOptions<T>) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.schedule(0);
  }

  stop(): void {
    this.running = false;
    this.clearScheduled();
  }

  invalidate(): void {
    this.actionRevision += 1;
  }

  refreshNow(): void {
    if (!this.running) return;
    this.clearScheduled();
    if (this.pending) {
      this.immediateAfterPending = true;
      return;
    }
    this.schedule(0);
  }

  visibilityChanged(): void {
    if (!this.running) return;
    this.clearScheduled();
    if (this.pending) {
      this.immediateAfterPending = this.options.isVisible();
      return;
    }
    this.schedule(this.options.isVisible() ? 0 : this.hiddenDelay());
  }

  private clearScheduled(): void {
    if (this.timer === null) return;
    this.options.clearTimer(this.timer);
    this.timer = null;
  }

  private hiddenDelay(): number {
    return this.options.hiddenDelayMs ?? 15_000;
  }

  private schedule(delayMs: number): void {
    if (!this.running || this.timer !== null) return;
    this.timer = this.options.setTimer(() => {
      this.timer = null;
      void this.runPoll();
    }, delayMs);
  }

  private async runPoll(): Promise<void> {
    if (!this.running || this.pending) return;
    this.pending = true;
    const revision = this.actionRevision;
    try {
      const value = await this.options.poll();
      this.resultDelayMs = this.options.nextDelayMs?.(value) ?? null;
      if (revision === this.actionRevision) this.options.onResult(value);
    } catch (error) {
      if (revision === this.actionRevision) this.options.onError(error);
    } finally {
      this.pending = false;
      if (!this.running) return;
      const immediate = this.immediateAfterPending;
      this.immediateAfterPending = false;
      const delay = this.options.isVisible()
        ? this.options.visibleDelayMs ?? 1_000
        : this.hiddenDelay();
      const resultDelay = this.options.isVisible() &&
        this.resultDelayMs !== null
        ? this.resultDelayMs
        : delay;
      this.schedule(immediate ? 0 : resultDelay);
    }
  }
}
