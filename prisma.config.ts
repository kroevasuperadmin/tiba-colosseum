import { defineConfig } from "prisma/config";
import "dotenv/config";
import { migrateDatasourceUrl } from "./src/lib/migrate-url.ts";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: { url: migrateDatasourceUrl() }
});
