import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`CREATE TABLE IF NOT EXISTS company_settings (singleton INTEGER PRIMARY KEY CHECK(singleton = 1), body TEXT NOT NULL)`;
  yield* sql`CREATE TABLE IF NOT EXISTS company_tasks (id TEXT PRIMARY KEY, body TEXT NOT NULL, updated_at TEXT NOT NULL)`;
  // Receipt, task transition and pending run are committed together before any external effect.
  yield* sql`CREATE TABLE IF NOT EXISTS company_receipts (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, created_at TEXT NOT NULL)`;
});
