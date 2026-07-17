// Auth.js mounts all its endpoints (session, signin, signout, csrf, ...)
// under /api/auth/* through this single catch-all route.
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
