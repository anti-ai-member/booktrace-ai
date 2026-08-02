import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const booksDir = path.resolve(rootDir, "books");

function serveShelfBooksPlugin() {
  return {
    name: "serve-shelf-books",
    configureServer(server) {
      server.middlewares.use("/shelf-books", (req, res, next) => {
        try {
          const raw = decodeURIComponent(String(req.url || "").replace(/^\//, "").split("?")[0] || "");
          if (!raw || raw.includes("..") || raw.includes("/") || raw.includes("\\")) {
            res.statusCode = 400;
            res.end("Bad request");
            return;
          }
          const filePath = path.resolve(booksDir, raw);
          if (!filePath.startsWith(booksDir) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
            res.statusCode = 404;
            res.end("Not found");
            return;
          }
          res.setHeader("Content-Type", "application/epub+zip");
          fs.createReadStream(filePath).pipe(res);
        } catch {
          next();
        }
      });
    },
  };
}

export default defineConfig({
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    proxy: {
      "/api": "http://127.0.0.1:8787",
    },
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react(), serveShelfBooksPlugin()],
});
