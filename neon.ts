import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  // Declare your Neon services here
  preview: {
    realtime: true,
  },
  auth: true,
  aiGateway: true,
  functions: {
    hello: { name: "Hello World", source: "./hello.ts" },
  },
  buckets: {
    // Private: files are read back through /api/files/[...key], which keeps
    // stored attachment URLs stable instead of expiring presigned links.
    uploads: { access: "private" },
  },
  // Branch policy: per-branch tuning
  branch: (branch) => {
    if (branch.isDefault) {
      // Default branch: no overrides, uses project defaults
      return {};
    }
    if (!branch.exists) {
      // New non-default branches: auto-expire
      // Run `neon checkout <name>` to create a new branch with these settings
      return { ttl: "7d" };
    }
    // Existing branch: no changes
    return {};
  },
});
