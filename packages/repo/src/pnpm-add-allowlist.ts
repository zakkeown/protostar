export interface PnpmAddAllowlistEntry {
  readonly name: string;
  readonly spec: string;
  readonly dev: boolean;
}

export const PNPM_ADD_ALLOWLIST: readonly PnpmAddAllowlistEntry[] = Object.freeze([
  Object.freeze({ name: "@playwright/test", spec: "^1.59.1", dev: true }),
  Object.freeze({ name: "fast-check", spec: "^4.7.0", dev: true }),
  Object.freeze({ name: "clsx", spec: "^2.1.1", dev: false }),
  Object.freeze({ name: "zustand", spec: "^5.0.8", dev: false }),
  Object.freeze({ name: "react-aria-components", spec: "^1.13.0", dev: false })
]);

export function formatPnpmAddAllowlistSpec(entry: PnpmAddAllowlistEntry): string {
  return `${entry.name}@${entry.spec}`;
}
