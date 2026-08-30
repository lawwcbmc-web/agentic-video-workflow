import {createServer, type IncomingMessage, type ServerResponse} from "node:http";
import {readFile, mkdir, writeFile, access} from "node:fs/promises";
import {spawn} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {generateJob, type PromptRequest} from "./generator.js";
import type {VideoJob} from "./types.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");
const outDir = path.join(root, "out");
const port = Number(process.env.PORT || 3000);
const send = (res: ServerResponse, status: number, body: unknown, type = "application/json; charset=utf-8") => {
  res.writeHead(status, {"content-type": type, "cache-control": "no-store"});
  res.end(type.startsWith("application/json") ? JSON.stringify(body) : String(body));
};
const readJson = async <T>(req: IncomingMessage): Promise<T> => {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) {size += chunk.length; if (size > 100_000) throw new Error("Request is too large."); chunks.push(chunk);}
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
};
const render = async (job: VideoJob): Promise<string> => {
  if (job.approvals.brief !== "approved") throw new Error("Approve the brief before rendering.");
  const safeId = job.id.replace(/[^a-z0-9-]/g, "");
  if (!safeId) throw new Error("Invalid job ID.");
  await mkdir(path.join(outDir, "jobs"), {recursive: true});
  const jobPath = path.join(outDir, "jobs", `${safeId}.json`);
  const videoPath = path.join(outDir, `${safeId}.mp4`);
  await writeFile(jobPath, JSON.stringify(job, null, 2));
  await new Promise<void>((resolve, reject) => {
    const command = process.platform === "win32" ? "npx.cmd" : "npx";
    const child = spawn(command, ["remotion", "render", "src/remotion/index.ts", "MainVideo", videoPath, `--props=${jobPath}`], {cwd: root, stdio: "inherit"});
    child.on("error", reject); child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Render failed with exit code ${code}.`)));
  });
  return safeId;
};
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (req.method === "POST" && url.pathname === "/api/generate") return send(res, 200, await generateJob(await readJson<PromptRequest>(req)));
    if (req.method === "POST" && url.pathname === "/api/render") {
      const id = await render(await readJson<VideoJob>(req)); return send(res, 200, {downloadUrl: `/videos/${id}.mp4`});
    }
    if (req.method === "GET" && url.pathname.startsWith("/videos/")) {
      const name = path.basename(url.pathname);
      if (!/^[a-z0-9-]+\.mp4$/.test(name)) return send(res, 400, {error: "Invalid video path."});
      const file = path.join(outDir, name); await access(file);
      res.writeHead(200, {"content-type": "video/mp4", "content-disposition": `attachment; filename="${name}"`});
      return res.end(await readFile(file));
    }
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) return send(res, 200, await readFile(path.join(publicDir, "index.html"), "utf8"), "text/html; charset=utf-8");
    return send(res, 404, {error: "Not found"});
  } catch (error) {return send(res, 400, {error: error instanceof Error ? error.message : "Unexpected error"});}
});
server.listen(port, "127.0.0.1", () => console.log(`Prompt-to-video interface: http://127.0.0.1:${port}`));
