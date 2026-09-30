/** Redact values before serialization so quotes/backslashes in secrets cannot corrupt JSON. */
export function redact<T>(value: T, extraSecrets: readonly string[] = []): T {
  const secrets = [...extraSecrets, process.env.TYPESAFE_API_KEY, process.env.OPENROUTER_API_KEY].filter((s): s is string => !!s);
  function walk(item: unknown): unknown {
    if (typeof item === "string") {
      for (const secret of secrets) item = (item as string).split(secret).join("[REDACTED]");
      return (item as string).replace(/((?:authorization|password|api[_-]?key|access[_-]?token)\s*[=:]\s*)(?:Bearer\s+)?[^\s"<,}]+/gi, "$1[REDACTED]");
    }
    if (Array.isArray(item)) return item.map(walk);
    if (item && typeof item === "object") return Object.fromEntries(Object.entries(item).map(([k, v]) => [k, walk(v)]));
    return item;
  }
  return walk(value) as T;
}

/** Source and command output share the same best-effort credential scrubbing. */
export function scrubSource(text: string): string {
  return redact(text).replace(/-----BEGIN [^-\r\n]*PRIVATE KEY-----[\s\S]*?-----END [^-\r\n]*PRIVATE KEY-----/g, "[REDACTED PRIVATE KEY]")
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{16,}|github_pat_[A-Za-z0-9_]{16,}|sk-[A-Za-z0-9_-]{16,}|AKIA[A-Z0-9]{16})\b/g, "[REDACTED]")
    .replace(/((?:password|secret|token|api[_-]?key|authorization)[\w-]*\s*["']?\s*[:=]\s*["'])([^"'\r\n]+)(["'])/gi, "$1[REDACTED]$3");
}
