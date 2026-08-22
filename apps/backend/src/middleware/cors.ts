import { cors } from "hono/cors";

const allowedOrigins = ["http://localhost:5173", "http://tauri.localhost"];

export const corsMiddleware = cors({
  origin: (origin) => {
    if (!origin) {
      return "*";
    }

    return allowedOrigins.includes(origin) ? origin : null;
  },
  allowHeaders: ["Authorization", "Content-Type"],
  allowMethods: ["GET", "POST", "OPTIONS"],
  maxAge: 86400,
});
