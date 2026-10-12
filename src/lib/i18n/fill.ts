/**
 * Substitute {named} placeholders in a translated string.
 *
 * Lives in its own file, free of next/headers, so a client component can use
 * it. Importing it from the i18n entry point pulls in cookies() and headers(),
 * which are server-only, and the build fails on a file that never needed them.
 */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? `{${key}}`));
}
