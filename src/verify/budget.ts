import { readLedger, updateLedger, type LedgerState } from "./ledger.ts";

export class VerificationStop extends Error {
  constructor(readonly status: "abstained" | "budget_exhausted" | "failed" | "error", message: string) { super(message); }
}


/** Shared across tool calls, and across processes when backed by a ledger. Attempts are not refunded. */
export class ModelBudget {
  usedCalls = 0;
  reservedUsd = 0;
  constructor(readonly maxCalls = 0, readonly maxEstimatedUsd = 0, readonly estimatePerCallUsd = 0, readonly ledgerPath?: string) {
    if (!Number.isInteger(maxCalls) || maxCalls < 0 || maxCalls > 20 ||
      !Number.isFinite(maxEstimatedUsd) || maxEstimatedUsd < 0 ||
      !Number.isFinite(estimatePerCallUsd) || estimatePerCallUsd < 0 ||
      (maxCalls > 0 && (maxEstimatedUsd <= 0 || estimatePerCallUsd <= 0))) {
      throw new Error("Jev requires 1–20 total calls, a positive estimated budget and a positive per-call estimate");
    }
    if (ledgerPath) {
      const state = readLedger(ledgerPath);
      this.usedCalls = state.calls;
      this.reservedUsd = state.reservedUsd;
    }
  }
  reserve(): number {
    const reserve = (state: LedgerState): LedgerState => {
      if (state.calls >= this.maxCalls || state.reservedUsd + this.estimatePerCallUsd > this.maxEstimatedUsd + 1e-10) {
        throw new VerificationStop("budget_exhausted", "Model call/estimated-spend limit reached; no further call was attempted");
      }
      return { version: 1, calls: state.calls + 1, reservedUsd: state.reservedUsd + this.estimatePerCallUsd };
    };
    const state = this.ledgerPath ? updateLedger(this.ledgerPath, reserve) : reserve({ version: 1, calls: this.usedCalls, reservedUsd: this.reservedUsd });
    this.usedCalls = state.calls;
    this.reservedUsd = state.reservedUsd;
    return this.estimatePerCallUsd;
  }
}
