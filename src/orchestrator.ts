import {readFile, mkdir, writeFile} from "node:fs/promises";
import path from "node:path";
import Ajv from "ajv";
import schema from "../schemas/job.schema.json" with {type: "json"};

type Approval = "pending" | "approved" | "rejected";
type Job = {
  id: string;
  title: string;
  objective: string;
  audience: string;
  format: {width: number; height: number; fps: number};
  scenes: Array<{id: string; durationSeconds: number; heading: string; body: string}>;
  approvals: {brief: Approval; paidGeneration: Approval; publish: Approval};
};

const loadJob = async (filename: string): Promise<Job> => {
  const raw = await readFile(filename, "utf8");
  const job: unknown = JSON.parse(raw);
  const validate = new Ajv({allErrors: true, strict: false}).compile(schema);
  if (!validate(job)) throw new Error(Ajv.errorsText(validate.errors, {separator: "\n"}));
  return job as Job;
};

const assertGate = (job: Job, gate: keyof Job["approvals"], envFlag?: string) => {
  if (job.approvals[gate] !== "approved") throw new Error(`Approval gate "${gate}" is not approved.`);
  if (envFlag && process.env[envFlag] !== "true") {
    throw new Error(`${envFlag}=true is also required for this action.`);
  }
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

  if (command === "paid-generate") {
    assertGate(job, "paidGeneration", "ALLOW_PAID_GENERATION");
    console.log("Paid generation gate passed; connect a provider adapter here.");
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
