import {Ajv2020} from "ajv/dist/2020.js";
import schema from "../schemas/job.schema.json" with {type: "json"};
import type {VideoJob} from "./types.js";
const validate = new Ajv2020({allErrors: true, strict: false}).compile(schema);
export function assertJobSchema(job: unknown): asserts job is VideoJob {
  if (!validate(job)) throw new Error(JSON.stringify(validate.errors, null, 2));
}
