import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readAll, walkAllTypeScriptFiles } from "./_helpers/barrel-walker.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const authoritySrcRoot = resolve(__dirname, "../../authority/src");

describe("@protostar/authority - authority boundary lock", () => {
  it("no node:fs imports anywhere in src/", async () => {
    const offenders: string[] = [];
    const forbidden = [
      /from\s+["']node:fs["']/,
      /from\s+["']node:fs\/promises["']/,
      /from\s+["']fs["']/
    ];

    for await (const file of walkAllTypeScriptFiles(authoritySrcRoot)) {
      const contents = await readAll(file);
      const code = contents
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      if (forbidden.some((pattern) => pattern.test(code))) {
        offenders.push(file);
      }
    }

    assert.deepEqual(
      offenders,
      [],
      `node:fs imports forbidden in @protostar/authority. Offenders:\n${offenders.join("\n")}`
    );
  });

  it("node:crypto is permitted for signature hashing", async () => {
    let foundCrypto = false;
    for await (const file of walkAllTypeScriptFiles(authoritySrcRoot)) {
      const contents = await readAll(file);
      if (/from\s+["']node:crypto["']/.test(contents)) {
        foundCrypto = true;
        break;
      }
    }

    assert.equal(foundCrypto, true, "expected node:crypto usage somewhere in @protostar/authority");
  });
});
