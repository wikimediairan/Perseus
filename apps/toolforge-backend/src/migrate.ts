import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";
import { loadConfig } from "./config.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const migrationsDir = path.resolve(process.cwd(), "migrations");
  const files = (await readdir(migrationsDir))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    throw new Error(`No migrations found in ${migrationsDir}`);
  }

  const connection = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    charset: "utf8mb4",
    timezone: "Z",
    multipleStatements: false,
  });

  try {
    await connection.execute(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         version VARCHAR(128) NOT NULL PRIMARY KEY,
         applied_at DATETIME(3) NOT NULL
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );

    const [appliedRows] = await connection.query<
      (mysql.RowDataPacket & { version: string })[]
    >(`SELECT version FROM schema_migrations`);
    const applied = new Set(appliedRows.map((row) => row.version));

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`skip ${file}`);
        continue;
      }

      const sql = await readFile(path.join(migrationsDir, file), "utf8");
      const statements = sql
        .split(";")
        .map((statement) => statement.trim())
        .filter((statement) => statement.length > 0);

      await connection.beginTransaction();
      try {
        for (const statement of statements) {
          await connection.query(statement);
        }
        await connection.execute(
          `INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)`,
          [file, new Date()],
        );
        await connection.commit();
        console.log(`applied ${file}`);
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    }
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
