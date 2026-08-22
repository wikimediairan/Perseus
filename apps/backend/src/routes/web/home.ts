import { Hono } from "hono";
import type { AppEnv } from "@/honoTypes";
import { LandingPage } from "@/views/pages/LandingPage";

export const homeRoute = new Hono<AppEnv>();

homeRoute.get("/", (c) => {
  return c.html(`<!doctype html>${LandingPage({}).toString()}`);
});
