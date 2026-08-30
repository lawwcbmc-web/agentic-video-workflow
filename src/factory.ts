import {mkdir, readFile, writeFile} from "node:fs/promises";
import {spawn} from "node:child_process";
import path from "node:path";
import {generateJob} from "./generator.js";
import {assertRequiredReviews} from "./review.js";
import type {VideoJob} from "./types.js";

const args = process.argv.slice(2);
const has = (flag: string) => args.includes(flag);
const value = (prefix: string) => args.find((arg) => arg.startsWith(`${prefix}=`))?.slice(prefix.length + 1);
const jobInput = value("--job");
const topic = args.find((arg) => !arg.startsWith("--"));

if (!jobInput && !topic) {
  throw new Error('Usage: npm run create -- "your topic" [--ai] OR npm run create -- --job=out/jobs/<job>.json [approval/render flags]');
}

const durationSeconds = Number(value("--duration") || 30);
const audience = value("--audience") || "General audience";
const aspectRatio = has("--landscape") ? "landscape" as const : "vertical" as const;
const approvalFlags = ["--approve-brief", "--approve-review", "--approve-paid"];

const run = (command: string, commandArgs: string[]) => new Promise<void>((resolve, reject) => {
  const executable = process.platform === "win32" && command === "npx" ? "npx.cmd" : command;
  const child = spawn(executable, commandArgs, {stdio: "inherit", env: process.env});
  child.on("error", reject);
  child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}.`)));
});

const writeJob = async (job: VideoJob) => {
  await mkdir("out/jobs", {recursive: true});
  const filename = path.join("out", "jobs", `${job.id}.json`);
  await writeFile(filename, JSON.stringify(job, null, 2));
  return filename;
};

const loadJob = async (filename: string): Promise<VideoJob> => JSON.parse(await readFile(filename, "utf8")) as VideoJob;

const main = async () => {
  let job: VideoJob;
  let mode: "demo" | "openai" | "resume";

  if (jobInput) {
    job = await loadJob(jobInput);
    mode = "resume";
  } else {
    if (approvalFlags.some(has)) throw new Error("Approval flags cannot be applied to newly generated content. Create the draft first, review it, then resume with --job=<path>.");
    const generated = await generateJob({prompt: topic as string, audience, durationSeconds, aspectRatio, useAi: has("--ai")});
    job = generated.job;
    mode = generated.mode;
  }

  if (has("--approve-brief")) job.approvals.brief = "approved";
  if (has("--approve-review") && job.review) {
    job.review.factual = "approved";
    job.review.clinical = "approved";
  }
  if (has("--approve-paid")) job.approvals.paidGeneration = "approved";

  const jobPath = await writeJob(job);
  console.log(`${mode === "resume" ? "Updated" : "Created"} ${mode} job: ${jobPath}`);

  if (!has("--assets") && !has("--render")) {
    if (job.review) console.log("Medical content detected: factual and clinical review are required before rendering.");
    console.log(`Review ${jobPath}, then resume with --job=${jobPath} and the appropriate approval flags.`);
    return;
  }

  if (!jobInput) throw new Error(`Rendering a newly generated job is blocked. Review ${jobPath}, then resume with --job=${jobPath}.`);
  if (job.approvals.brief !== "approved") throw new Error("Use --approve-brief only after reviewing the saved brief.");
  assertRequiredReviews(job);

  let renderProps = jobPath;
  if (has("--assets")) {
    if (!has("--approve-paid")) throw new Error("Use --approve-paid only after approving external asset generation and its potential cost.");
    await run("node", ["--import", "tsx", "src/orchestrator.ts", "assets", jobPath]);
    renderProps = path.join("out", `${job.id}.assets.json`);
  }

  if (has("--render")) {
    const output = path.join("out", `${job.id}.mp4`);
    await run("npx", ["remotion", "render", "src/remotion/index.ts", "MainVideo", output, `--props=${renderProps}`]);
    console.log(`Rendered video: ${output}`);
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
