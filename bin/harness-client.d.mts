import type { TaskLoop } from "../src/loop/engine.ts";
import type { TaskInput } from "../src/loop/schema.ts";
export type TaskResult = Awaited<ReturnType<TaskLoop["handle"]>>;
export interface ProofClient {
  send(event: TaskInput): Promise<TaskResult>;
  close(): Promise<void>;
}
export function createProofClient(options: {
  project: string; allowExecution?: boolean; review?: boolean; watch?: boolean; maxMutants?: number;
  onFeedback?: (message: { event: string; result?: TaskResult; error?: { code: string; message: string } }) => void;
}): ProofClient;
