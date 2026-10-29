declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    WORKBENCH_BRIDGE_SECRET?: string;
    WORKBENCH_OWNER_ID?: string;
    WORKBENCH_OWNER_EMAIL?: string;
    WORKBENCH_OWNER_NAME?: string;
  }
}
