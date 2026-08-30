import {readFile, mkdir, writeFile} from "node:fs/promises";
import path from "node:path";
import {Ajv2020} from "ajv/dist/2020.js";
import schema from "../schemas/job.schema.json" with {type: "json"};
import {generatePixelleSceneVideo} from "./providers/pixelle.js";
import type {VideoJob} from "./types.js";

const loadJob = async (filename: string): Promise<VideoJob> => {
  const raw = await readFile(filename, "utf8");
  const job: unknown = JSON.parse(raw);
  const validate = new Ajv2020({allErrors: true, strict: false}).compile(schema);
  if (!validate(job)) throw new Error(JSON.stringify(validate.errors, null, 2));
  return job as VideoJob;
};

const assertGate = (job: VideoJob, gate: keyof VideoJob["approvals"], envFlag?: string) => {
  if (job.approvals[gate] !== "approved") throw new Error(`Approval gate "${gate}" is not approved.`);
  if (envFlag && process.env[envFlag] !== "true") {
    throw new Error(`${envFlag}=true is also required for this action.`);
  }
};

const generateAssets = async (job: VideoJob) => {
  assertGate(job, "paidGeneration", "ALLOW_PAID_GENERATION");
  const enriched = structuredClone(job);

  for (const scene of enriched.scenes) {
    const provider = scene.visual?.provider;
    if (provider !== "pixelle" || scene.visual?.source) continue;

    try {
      const result = await generatePixelleSceneVideo(enriched, scene);
      scene.visual = {...scene.visual, type: "video", source: result.source, provider: "pixelle"};
      scene.generation = {status: "generated", requestId: result.requestId};
    } catch (error) {
      scene.generation = {status: "failed", error: error instanceof Error ? error.message : String(error)};
      throw error;
    }
  }

  await mkdir("out", {recursive: true});
  const output = path.join("out", `${job.id}.assets.json`);
  await writeFile(output, JSON.stringify(enriched, null, 2));
  console.log(`Asset-enriched job created: ${output}`);
};

const main = async () => {
  const [, , command = "validate", filename = "jobs/sample-job.json"] = process.argv;
  const job = await loadJob(filename);

  if (command === "validate") {
    console.log(`Valid job: ${job.id}`);
    return;
  }

  if (command === "plan") {
    assertGate(job, "brief");
    const totalFrames = Math.round(job.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0) * job.format.fps);
    await mkdir("out", {recursive: true});
    await writeFile(path.join("out", `${job.id}.plan.json`), JSON.stringify({jobId: job.id, totalFrames, scenes: job.scenes}, null, 2));
    console.log(`Plan created for ${job.id}: ${totalFrames} frames`);
    return;
  }

  if (command === "assets" || command === "paid-generate") {
    await generateAssets(job);
    return;
  }

  if (command === "publish") {
    assertGate(job, "publish", "ALLOW_PUBLISHING");
    console.log("Publishing gate passed; connect a publishing adapter here.");
    return;
  }

  throw new Error(`Unknown command: ${command}`);
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
