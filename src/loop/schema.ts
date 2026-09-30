import { z } from "zod";

const requirement = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  description: z.string().min(1).max(1000),
  check: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/).optional(),
}).strict();
export const taskEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start"), request: z.string().min(1).max(8000),
    base: z.string().min(1).max(200).default("HEAD"),
    requirements: z.array(requirement).max(20).default([]),
    confirmCodeExecution: z.literal(true).optional(),
  }).strict(),
  z.object({ type: z.literal("checkpoint"), runTests: z.boolean().default(false) }).strict(),
  z.object({ type: z.literal("requirements"), requirements: z.array(requirement).max(20) }).strict(),
  z.object({ type: z.literal("complete") }).strict(),
  z.object({ type: z.literal("status") }).strict(),
  z.object({ type: z.literal("cancel") }).strict(),
]);
export const taskToolSchema = z.object({ event: taskEventSchema }).strict();
export const taskMessageSchema = taskToolSchema.extend({ id: z.string().min(1).max(100) }).strict();
export type TaskEvent = z.infer<typeof taskEventSchema>;
export type TaskInput = z.input<typeof taskEventSchema>;
export type Requirement = z.infer<typeof requirement>;
