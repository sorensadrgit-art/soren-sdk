import type { Clock } from "./types.js";

/**
 * Real system clock.
 */
export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }
}

/**
 * Deterministic test clock.
 */
export class FakeClock implements Clock {
  #current: number;

  constructor(startMs = 1_000_000) {
    this.#current = startMs;
  }

  now(): number {
    return this.#current;
  }

  advance(ms: number): void {
    this.#current += ms;
  }
}