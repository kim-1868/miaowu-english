// Offline operator utility: emits private inventory CSV and D1 import SQL.
// DO NOT commit its output, send codes to a chat, or use preview DEMO codes.
import { randomBytes, randomUUID, createHmac } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {assertIssuableCategory} from "./voucher-catalog.mjs";

const secret = process.env.ACTIVATION_PEPPER || "";
const category = process.env.CATEGORY_ID || "";
const count = Number(process.env.COUNT || 0);
if (secret.length < 32 || !Number.isInteger(count) || count < 1 || count > 1000) {
  throw new Error("Require ACTIVATION_PEPPER (32+ characters), CATEGORY_ID and COUNT=1..1000");
}
// No issuance of future categories before their explicit sales approval.
assertIssuableCategory(category);
const folder = path.resolve("private-output");
await mkdir(folder, { recursive: true, mode: 0o700 });
const prefix = category.toUpperCase();
const inventory = ["code,category_id"];
const sql = ["-- Import ONLY after the category seed. Contains irreversible HMAC fingerprints, no raw codes."];
for (let i = 0; i < count; i++) {
  const raw = randomBytes(20).toString("hex").toUpperCase();
  const code = "MW-" + prefix + "-" + raw.match(/.{1,8}/g).join("-");
  const normalized = code.replace(/[\s-]/g, "").toUpperCase();
  const hash = createHmac("sha256", secret).update("code:" + normalized).digest("hex");
  inventory.push(code + "," + category);
  sql.push("INSERT INTO activation_codes(id,code_hash,category_id,status) VALUES ('" +
    randomUUID() + "','" + hash + "','" + category + "','unused');");
}
const stamp = Date.now();
await writeFile(path.join(folder, "inventory-" + category + "-" + stamp + ".csv"),
  inventory.join("\n") + "\n", { encoding: "utf8", mode: 0o600 });
await writeFile(path.join(folder, "import-" + category + "-" + stamp + ".sql"),
  sql.join("\n") + "\n", { encoding: "utf8", mode: 0o600 });
process.stdout.write("Generated " + count + " private activation codes for " + category +
  " in private-output/. Do NOT upload the raw CSV to public sites.\n");
