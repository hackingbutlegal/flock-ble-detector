export type Verdict = "confirmed" | "refuted" | "inconclusive";

export interface RawFrame {
  readonly label: string;
  readonly hex: string;
}

export interface CheckResult {
  readonly id: "F1" | "CH-1" | "F2" | "F4" | "F5";
  readonly title: string;
  readonly verdict: Verdict;
  readonly s4ref: string;
  readonly evidence: string;
  readonly limits: string;
  readonly raw?: readonly RawFrame[];
}
