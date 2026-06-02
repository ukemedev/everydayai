import express, { type Express, type Request, type Response, type NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";
import pinoHttp from "pino-http";
import { v4 as uuidv4 } from "uuid";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import router from "./routes";
import { logger } from "./lib/logger";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Allowed origins ───────────────────────────────────────────────────────────
const extraOrigins = process.env.ALLOWED_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean) ?? [];

// Derive Replit dev domain origins dynamically from REPLIT_DOMAINS
const replitDomains = process.env.REPLIT_DOMAINS?.split(",").map((d) => d.trim()).filter(Boolean) ?? [];
const replitOrigins = replitDomains.map((d) => `https://${d}`);

const allowedOrigins = [
  "http://localhost:5000",
  "http://localhost:3000",
  "http://localhost:5173",
  ...replitOrigins,
  ...extraOrigins,
];

// ── CSP connect-src allowlist ─────────────────────────────────────────────────
// Supabase and other external APIs the frontend must connect to.
// Read from env so the same code works for dev, staging, and production.
const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const supabaseHost = supabaseUrl ? new URL(supabaseUrl).host : "";
const supabaseConnect = supabaseHost ? `https://${supabaseHost}` : "";
const extraConnect = process.env.CSP_CONNECT_SRC?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
const connectSrc = ["'self'", "https:", "wss:", "ws:", supabaseConnect, ...extraConnect].filter(Boolean);

// ── App ───────────────────────────────────────────────────────────────────────
const app: Express = express();

// Trust the reverse proxy so express-rate-limit can read the real client IP
app.set("trust proxy", 1);

// ── Security headers (first middleware) ───────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc:     ["'self'"],
        scriptSrc:      ["'self'"],
        styleSrc:       ["'self'", "'unsafe-inline'"],
        imgSrc:         ["'self'", "data:", "https:"],
        fontSrc:        ["'self'", "data:"],
        connectSrc:     connectSrc,
        frameSrc:       ["'none'"],
        objectSrc:      ["'none'"],
        baseUri:        ["'self'"],
        formAction:     ["'self'"],
        frameAncestors: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,      // needed for Supabase Storage files to load
    crossOriginResourcePolicy: { policy: "cross-origin" }, // needed for embedded widgets and public chat page
  }),
);

// ── Request ID (before pinoHttp so the logger picks it up) ───────────────────
app.use((req: Request, res: Response, next: NextFunction) => {
  req.id = uuidv4();
  res.setHeader("X-Request-ID", req.id as string);
  next();
});

// ── Structured logging ────────────────────────────────────────────────────────
app.use(
  pinoHttp({
    logger,
    genReqId: (req) => req.id as string,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin(origin, callback) {
      // Allow requests with no origin (mobile apps, Postman, curl, server-to-server)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn("CORS blocked:", origin);
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
  }),
);

// ── Body parsing ──────────────────────────────────────────────────────────────
// Capture raw body buffer on the request so Meta webhook routes can verify
// HMAC-SHA256 signatures from X-Hub-Signature-256 headers.
app.use(express.json({
  limit: "100kb",
  verify: (req: Request, _res: Response, buf: Buffer) => {
    (req as Request & { rawBody?: Buffer }).rawBody = buf;
  },
}));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));

// ── Static files ──────────────────────────────────────────────────────────────
app.use(express.static(join(__dirname, "../public")));

// ── API routes ────────────────────────────────────────────────────────────────
app.use("/api", router);

// ── CORS error handler ────────────────────────────────────────────────────────
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  if (err.message === "Not allowed by CORS") {
    logger.warn({ origin: req.headers.origin, ip: req.ip }, "CORS request blocked");
    res.status(403).json({ error: "Origin not allowed" });
    return;
  }
  logger.error({ err, url: req.url }, "Unhandled error");
  res.status(500).json({ error: "Internal server error" });
});

export default app;
