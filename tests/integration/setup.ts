// Runs before each integration test file, before the file's own imports: points the app at the test database.
import "dotenv/config";

if (!process.env.DATABASE_URL_TEST) {
  throw new Error("DATABASE_URL_TEST is not set. Integration tests never run against the dev database.");
}
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
