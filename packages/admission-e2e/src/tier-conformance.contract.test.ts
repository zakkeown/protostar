import { strict as assert } from "node:assert";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TIERS = new Set(["pure", "fs", "network", "orchestration", "test-only"]);

// AUTH-12 (D-12): AGENTS.md `## Authority Tiers` table parsed into a map of pkg name → manifest tier.
// Manifest is canonical (D-11); AGENTS.md mirror + authority-boundary rules are derived assertions.
const AGENTS_TIER_TO_MANIFEST: Readonly<Record<string, string>> = Object.freeze({
  "orchestration": "orchestration",
  "filesystem": "fs",
  "domain network": "network",
  "pure": "pure",
  "test-only": "test-only"
});
const EXPECTED_AGENTS_TIER_LABELS = Object.freeze(Object.keys(AGENTS_TIER_TO_MANIFEST));

const TIER_LINE_PATTERN = /^-\s+\*\*([^(*]+?)\b[^:]*:\*\*\s+(.+)$/gm;
const PKG_NAME_PATTERN = /(?:@protostar\/[\w\-]+|apps\/[\w\-]+|packages\/[\w\-]+)/g;

// AUTH-12 (D-12): Hardcoded mirror of authority-boundary.contract.test.ts PACKAGE_RULES tier derivation.
// Update when authority-boundary.contract.test.ts rules change. See packages/admission-e2e/src/contracts/authority-boundary.contract.test.ts.
const AUTHORITY_BOUNDARY_DERIVED_TIERS: Readonly<Record<string, string>> = Object.freeze({
  "@protostar/admission-e2e": "test-only",
  "@protostar/artifacts": "pure",
  "@protostar/authority": "pure",
  "@protostar/delivery": "pure",
  "@protostar/delivery-runtime": "network",
  "@protostar/dogpile-adapter": "network",
  "@protostar/dogpile-types": "pure",
  "@protostar/evaluation": "pure",
  "@protostar/evaluation-runner": "network",
  "@protostar/execution": "pure",
  "@protostar/fixtures": "pure",
  "@protostar/intent": "pure",
  "@protostar/lmstudio-adapter": "network",
  "@protostar/mechanical-checks": "pure",
  "@protostar/paths": "fs",
  "@protostar/planning": "pure",
  "@protostar/policy": "pure",
  "@protostar/repair": "pure",
  "@protostar/repo": "fs",
  "@protostar/review": "pure"
});

const ACCEPTED_AUTHORITY_EDGES = new Set([
  "@protostar/authority -> @protostar/repo",
  "@protostar/execution -> @protostar/repo",
  "@protostar/mechanical-checks -> @protostar/repo",
  "@protostar/review -> @protostar/repo",
  "@protostar/review -> @protostar/dogpile-adapter",
  "@protostar/review -> @protostar/delivery",
  "@protostar/review -> @protostar/repair",
  "@protostar/delivery-runtime -> @protostar/review",
  "@protostar/lmstudio-adapter -> @protostar/repo"
]);

interface WorkspacePackage {
  readonly name: string;
  readonly dir: string;
  readonly manifest: Record<string, any>;
  readonly tier: string | undefined;
  readonly deps: readonly string[];
  readonly refs: readonly string[];
}

describe("tier-conformance contract", () => {
  it("every workspace package declares a known protostar.tier", async () => {
    const packages = await loadPackages();
    const offenders = packages
      .filter((pkg) => typeof pkg.tier !== "string" || !TIERS.has(pkg.tier))
      .map((pkg) => `${pkg.name}: ${String(pkg.tier)}`);

    assert.deepEqual(offenders, []);
  });

  it("preserves explicit tier sentinels", async () => {
    const packages = await packageMap();

    assert.equal(packages.get("@protostar/paths")?.tier, "fs");
    assert.equal(packages.get("@protostar/repo")?.tier, "fs");
    assert.equal(packages.get("@protostar/hosted-llm-adapter")?.tier, "network");
    assert.equal(packages.get("@protostar/factory-cli")?.tier, "orchestration");
    assert.equal(packages.get("@protostar/admission-e2e")?.tier, "test-only");
  });

  it("keeps manifest dependencies and tsconfig references aligned", async () => {
    const packages = await loadPackages();
    const offenders: string[] = [];

    for (const pkg of packages) {
      if (!await exists(resolve(pkg.dir, "tsconfig.json"))) continue;
      const deps = [...pkg.deps].sort();
      const refs = [...pkg.refs].sort();
      if (JSON.stringify(deps) !== JSON.stringify(refs)) {
        offenders.push(`${pkg.name}: deps=[${deps.join(", ")}] refs=[${refs.join(", ")}]`);
      }
    }

    assert.deepEqual(offenders, []);
  });

  it("keeps package dependency graph acyclic", async () => {
    const packages = await loadPackages();
    const graph = new Map(packages.map((pkg) => [pkg.name, new Set(pkg.deps)]));
    const indegree = new Map(packages.map((pkg) => [pkg.name, 0]));

    for (const deps of graph.values()) {
      for (const dep of deps) indegree.set(dep, (indegree.get(dep) ?? 0) + 1);
    }

    const queue = [...indegree.entries()]
      .filter(([, count]) => count === 0)
      .map(([name]) => name);
    let visited = 0;
    while (queue.length > 0) {
      const name = queue.shift() ?? "";
      visited += 1;
      for (const dep of graph.get(name) ?? []) {
        const next = (indegree.get(dep) ?? 0) - 1;
        indegree.set(dep, next);
        if (next === 0) queue.push(dep);
      }
    }

    assert.equal(visited, packages.length, "workspace package graph contains a cycle");
  });

  it("enforces tier dependency direction with documented bridge exceptions", async () => {
    const packages = await packageMap();
    const offenders: string[] = [];

    for (const pkg of packages.values()) {
      for (const depName of pkg.deps) {
        const dep = packages.get(depName);
        if (!dep) continue;
        const edge = `${pkg.name} -> ${dep.name}`;
        if (ACCEPTED_AUTHORITY_EDGES.has(edge)) continue;

        if (dep.tier === "test-only") {
          offenders.push(`${edge}: nothing may depend on test-only packages`);
        }
        if (pkg.tier === "pure" && (dep.tier === "network" || dep.tier === "fs" || dep.tier === "orchestration")) {
          offenders.push(`${edge}: pure packages may not depend on ${dep.tier} packages`);
        }
        if (pkg.tier === "network" && dep.tier === "fs") {
          offenders.push(`${edge}: network packages may not depend on fs packages`);
        }
      }
    }

    assert.deepEqual(offenders, []);
  });

  it("network-tier packages ship local no-fs contracts", async () => {
    const packages = await loadPackages();
    const offenders: string[] = [];

    for (const pkg of packages) {
      if (pkg.tier !== "network") continue;
      const contract = resolve(pkg.dir, "src/no-fs.contract.test.ts");
      if (!await exists(contract)) offenders.push(`${pkg.name}: missing src/no-fs.contract.test.ts`);
    }

    assert.deepEqual(offenders, []);
  });

  it("pure-tier packages ship local no-net contracts", async () => {
    const packages = await loadPackages();
    const offenders: string[] = [];

    for (const pkg of packages) {
      if (pkg.tier !== "pure") continue;
      const contract = resolve(pkg.dir, "src/no-net.contract.test.ts");
      if (!await exists(contract)) offenders.push(`${pkg.name}: missing src/no-net.contract.test.ts`);
    }

    assert.deepEqual(offenders, []);
  });

  it("pure and test-only packages declare sideEffects false", async () => {
    const packages = await loadPackages();
    const offenders = packages
      .filter((pkg) => pkg.tier === "pure" || pkg.tier === "test-only")
      .filter((pkg) => pkg.manifest.sideEffects !== false)
      .map((pkg) => pkg.name);

    assert.deepEqual(offenders, []);
  });

  it("three-way tier conformance: manifest == AGENTS.md == authority-boundary contract", async () => {
    const packages = await loadPackages();
    const agentsTiers = await parseAgentsMdTiers();
    const offenders: string[] = [];

    // Test B: manifest == AGENTS.md per package.
    for (const pkg of packages) {
      const agentsTier = agentsTiers.get(pkg.name);
      if (agentsTier === undefined) {
        offenders.push(`${pkg.name}: missing from AGENTS.md ## Authority Tiers table`);
        continue;
      }
      if (pkg.tier !== agentsTier) {
        offenders.push(`${pkg.name}: manifest=${String(pkg.tier)} but AGENTS.md=${agentsTier}`);
      }
    }

    // Test C: authority-boundary derived tier == manifest tier.
    const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
    for (const [name, derivedTier] of Object.entries(AUTHORITY_BOUNDARY_DERIVED_TIERS)) {
      const pkg = byName.get(name);
      if (!pkg) {
        offenders.push(`${name}: in AUTHORITY_BOUNDARY_DERIVED_TIERS but no manifest found`);
        continue;
      }
      if (pkg.tier !== derivedTier) {
        offenders.push(`${name}: authority-boundary derived=${derivedTier} but manifest=${String(pkg.tier)}`);
      }
    }

    // Test D: factory-cli orchestration sanity.
    const factoryCli = byName.get("@protostar/factory-cli");
    assert.equal(factoryCli?.tier, "orchestration", "@protostar/factory-cli manifest tier must be orchestration");
    assert.equal(agentsTiers.get("@protostar/factory-cli"), "orchestration", "AGENTS.md must list apps/factory-cli as orchestration");

    assert.deepEqual(offenders, []);
  });

  it("AGENTS.md tier labels are recognized (Pitfall 6 — fail loud on drift)", async () => {
    // parseAgentsMdTiers() throws on unknown tier labels.
    await parseAgentsMdTiers();
  });

  it("published packages declare the Node 22 engine floor", async () => {
    const packages = await loadPackages();
    const offenders = packages
      .filter((pkg) => pkg.manifest.private !== true)
      .filter((pkg) => pkg.manifest.engines?.node !== ">=22")
      .map((pkg) => pkg.name);

    assert.deepEqual(offenders, []);
  });
});

async function parseAgentsMdTiers(): Promise<Map<string, string>> {
  // RED stub: returns empty map; GREEN will implement AGENTS.md parser.
  return new Map();
}

async function packageMap(): Promise<Map<string, WorkspacePackage>> {
  const packages = await loadPackages();
  return new Map(packages.map((pkg) => [pkg.name, pkg]));
}

async function loadPackages(): Promise<WorkspacePackage[]> {
  const repoRoot = await findRepoRoot(__dirname);
  const packageDirs = [
    ...(await childDirs(resolve(repoRoot, "packages"))),
    resolve(repoRoot, "apps/factory-cli")
  ];
  const manifests = await Promise.all(packageDirs.map(readPackage));
  const packages = manifests.filter((pkg): pkg is WorkspacePackage => pkg !== null);
  const byDir = new Map(packages.map((pkg) => [pkg.dir, pkg.name]));

  return Promise.all(
    packages.map(async (pkg) => ({
      ...pkg,
      refs: await tsconfigRefs(pkg.dir, byDir)
    }))
  );
}

async function readPackage(dir: string): Promise<WorkspacePackage | null> {
  const manifestPath = resolve(dir, "package.json");
  if (!await exists(manifestPath)) return null;
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (typeof manifest.name !== "string" || !manifest.name.startsWith("@protostar/")) return null;

  return {
    name: manifest.name,
    dir,
    manifest,
    tier: manifest.protostar?.tier,
    deps: Object.keys(manifest.dependencies ?? {}).filter((dep) => dep.startsWith("@protostar/")).sort(),
    refs: []
  };
}

async function tsconfigRefs(dir: string, byDir: Map<string, string>): Promise<string[]> {
  const tsconfigPath = resolve(dir, "tsconfig.json");
  if (!await exists(tsconfigPath)) return [];
  const raw = stripJsonComments(await readFile(tsconfigPath, "utf8"));
  const tsconfig = JSON.parse(raw);
  const refs: string[] = [];
  for (const ref of tsconfig.references ?? []) {
    if (typeof ref.path !== "string") continue;
    const refDir = resolve(dir, ref.path);
    const packageName = byDir.get(refDir);
    if (packageName?.startsWith("@protostar/")) refs.push(packageName);
  }
  return refs.sort();
}

async function childDirs(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => resolve(dir, entry.name));
}

async function findRepoRoot(start: string): Promise<string> {
  let current = start;
  while (current !== dirname(current)) {
    if (await exists(resolve(current, "pnpm-workspace.yaml"))) return current;
    current = dirname(current);
  }
  throw new Error(`could not locate repo root from ${start}`);
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function stripJsonComments(value: string): string {
  return value.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
