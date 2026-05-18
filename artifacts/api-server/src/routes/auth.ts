import { Router, type Request, type Response } from "express";
import { auth } from "~/server/auth";

const router = Router();

router.all("/auth/*path", async (req: Request, res: Response) => {
  try {
    const url = new URL(req.originalUrl, `http://localhost`);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === "string") {
        headers.set(key, value);
      } else if (Array.isArray(value)) {
        headers.set(key, value.join(", "));
      }
    }

    const body =
      req.method !== "GET" && req.method !== "HEAD"
        ? JSON.stringify(req.body)
        : undefined;

    const request = new Request(url.toString(), {
      method: req.method,
      headers,
      body,
    });

    const response = await auth.handler(request);

    res.status(response.status);
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    const text = await response.text();
    res.send(text || undefined);
  } catch (err) {
    console.error("[auth] handler error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
