import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = join(process.cwd(), "public");
const DEFAULT_BOMIST_URL = process.env.BOMIST_API_URL || "http://localhost:3333";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function sendJson(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(body));
}

function getBomistBase(reqUrl) {
  const configured = reqUrl.searchParams.get("baseUrl") || DEFAULT_BOMIST_URL;
  return configured.replace(/\/+$/, "");
}

async function proxyBomist(req, res, reqUrl) {
  const baseUrl = getBomistBase(reqUrl);
  const path = reqUrl.searchParams.get("path") || "/";

  if (!path.startsWith("/")) {
    sendJson(res, 400, { error: "Parametr path musi zaczynac sie od /." });
    return;
  }

  let body;
  if (!["GET", "HEAD"].includes(req.method || "GET")) {
    body = await new Promise((resolve, reject) => {
      const chunks = [];
      req.on("data", chunk => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", reject);
    });
  }

  try {
    const target = new URL(path, `${baseUrl}/`);
    const upstream = await fetch(target, {
      method: req.method,
      headers: {
        "accept": "application/json",
        "content-type": req.headers["content-type"] || "application/json"
      },
      body
    });
    const text = await upstream.text();
    res.writeHead(upstream.status, {
      "content-type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
      "cache-control": "no-store"
    });
    res.end(text);
  } catch (error) {
    sendJson(res, 502, {
      error: "Cannot connect to the BOMist API.",
      details: error instanceof Error ? error.message : String(error),
      baseUrl
    });
  }
}

async function serveStatic(req, res, reqUrl) {
  const requestedPath = reqUrl.pathname === "/" ? "/index.html" : reqUrl.pathname;
  const safePath = normalize(decodeURIComponent(requestedPath)).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const data = await readFile(filePath);
    res.writeHead(200, {
      "content-type": contentTypes[extname(filePath)] || "application/octet-stream"
    });
    res.end(data);
  } catch {
    const fallback = await readFile(join(PUBLIC_DIR, "index.html"));
    res.writeHead(200, { "content-type": contentTypes[".html"] });
    res.end(fallback);
  }
}

createServer(async (req, res) => {
  const reqUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (reqUrl.pathname === "/api/bomist") {
    await proxyBomist(req, res, reqUrl);
    return;
  }

  await serveStatic(req, res, reqUrl);
}).listen(PORT, "127.0.0.1", () => {
  console.log(`BOMist Helper: http://localhost:${PORT}`);
  console.log(`Domyslne API BOMist: ${DEFAULT_BOMIST_URL}`);
});
