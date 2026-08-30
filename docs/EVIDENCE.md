# Medical evidence and scene citations

The evidence layer retrieves PubMed-indexed literature via the [Europe PMC REST API](https://europepmc.org/RestfulWebService). It preserves source identities and abstracts in `VideoJob`, supplies those records to the optional AI director, and validates each scene's references before human approval. It is a literature-assisted drafting tool, not an autonomous clinical fact checker.

## Workflow

1. Generate a draft with evidence:

   ```bash
   npm run create -- "TNK vs alteplase in acute ischemic stroke" --ai --evidence --evidence-query="tenecteplase alteplase stroke" --duration=60 --audience="Stroke clinicians"
   ```

   OpenAI scripting still requires `ALLOW_AI_SCRIPTING=true` and `OPENAI_API_KEY` and can incur charges. Omit `--ai` for a no-LLM demo: sources are retrieved, but citations must be linked manually. Without `--evidence`, medical drafts remain possible but cannot pass the downstream gates.

2. Inspect the saved `out/jobs/<job-id>.json`. For **every** scene, review all claims in heading, body and narration. Cite one to three `evidence.sources[].id` values and supply supporting excerpts. The following is a structural template, not a usable citation:

   ```json
   {
     "citations": ["pubmed-<actual PMID from evidence.sources>"],
     "evidenceExcerpts": [
       {
         "sourceId": "pubmed-<same PMID>",
         "excerpt": "Copy exact supporting abstract text here (at least 20 characters)."
       }
     ]
   }
   ```

   An excerpt must match that source's stored abstract after whitespace normalization. A matching quote does **not** prove that the scene's claim follows from it. Unsupported claims must be revised or removed; a real but irrelevant citation is not sufficient.

3. Re-fetch and validate sources and links:

   ```bash
   npm run create -- --job=out/jobs/<job-id>.json --validate-evidence
   ```

   This resolves each PMID through Europe PMC, compares canonical metadata and abstract text, checks all scene references/excerpts, and saves a content snapshot. Any missing record, changed metadata, known correction/retraction flag, network failure, or malformed response blocks validation. All approvals are reset to pending, including paid generation and publishing. No LLM is used to verify identities.

4. Have a qualified human review the **saved validated job**, including the original papers/guidelines as needed. Only then:

   ```bash
   npm run create -- --job=out/jobs/<job-id>.json --approve-brief --approve-review --render
   ```

   `--approve-review` is the operator's attestation to both factual and clinical review. It is not automated review. It records the content snapshot that planning, asset generation, rendering, and publishing will check. All medical scenes show PMID/year footers; full bibliographic metadata, source URLs, and excerpts remain in the job JSON and render plan. Archive the JSON with the MP4.

Retrieval/validation cannot share an invocation with approval, assets, or rendering. Brief, paid-generation, and publishing gates remain separate. Direct Remotion rendering and the HTTP rendering endpoint enforce the medical gates too.

## Review checklist

- Does each citation actually support **every** medical claim in the scene, including narration and numbers? Matching an excerpt is only a mechanical check.
- Have you checked the full text, study design, population, comparator, endpoint, uncertainty, exclusions, and limitations? Is a trial result being mistaken for a recommendation?
- Have you checked the current guideline directly with its issuing body, including updates, jurisdiction, recommendation strength and contraindications?
- Are dose, timing, eligibility, risks and clinical applicability accurately represented? Avoid individualized treatment advice.
- Have you checked current corrections, expressions of concern, and retractions at the publisher and relevant indexes?
- Do the visuals and audio communicate the approved script accurately? Newly generated assets still need human inspection before publishing.

## Retrieval policy and limits

- Fixed HTTPS Europe PMC endpoint; no arbitrary URL fetching, redirects, secret-bearing URLs, or LLM-invented source metadata.
- Up to three sequential searches, each bounded to 25 results, 15 seconds and 2 MB. No automatic paid calls or retries. Provider errors fail closed.
- Plain topic keywords are quoted and combined; common filler words are removed and TNK/tPA are expanded. `--evidence-query` should be focused search terms, not a full prompt or advanced query syntax.
- Separate searches reserve up to four guideline records and four trial records, then fill the bundle with relevance-ranked results; at most ten unique PMID/DOI records are kept. Guideline/trial searches sort by publication date and exclude future publication dates. There is no systematic-review or exhaustive-search guarantee.
- Only PubMed-indexed records with abstracts and required metadata are used. Missing abstracts, malformed identifiers/DOIs, and known correction/retraction/concern flags in publication metadata are excluded. Absence of these flags does **not** establish that an article is unretracted or clinically reliable; index updates can lag.
- Sources are abstract-level evidence. Guidelines absent from PubMed, websites, paywalled full texts, and full-text citation validation are not supported in this milestone. The workflow cannot certify that it has found the latest guideline or all relevant trials.
- Both retrieval and validation timestamps must be within 30 days at approval/render time. This is an operational refresh limit, not a medical definition of currency. Older landmark trials can still be included after fresh retrieval.
- Literature queries are transmitted to Europe PMC. With `--ai`, the topic and retrieved abstracts also go to OpenAI. Do not include patient identifiers or private clinical data. Source abstracts may have reuse restrictions; assess rights before sharing the evidence JSON. Footers show identifiers rather than reproducing abstracts in the video.

## Refresh and migration

Existing nonmedical jobs continue to work. Existing medical jobs, including `jobs/sample-job.json`, remain valid drafts but can no longer render without evidence and human review. The sample contains no fabricated preapproved evidence.

Refresh or migrate a saved job:

```bash
npm run create -- --job=jobs/sample-job.json --evidence --evidence-query="stroke recognition"
```

The updated job is saved under `out/jobs/<job-id>.json`; the input fixture is not overwritten. Refresh clears previous scene links and all approvals. Re-link scenes, validate that saved output, then repeat human review. Failed retrieval/validation leaves the previous saved file untouched. If scenes or source records are edited, validation/review snapshots no longer match; revalidate and review before continuing. Generated asset URLs are excluded from the script-review snapshot so asset enrichment does not change the approved narration.

Snapshots are plain serialized content, not cryptographic signatures or authenticated audit events. Anyone with write access can fabricate local approval fields and snapshots. This starter trusts its local operator: production needs authenticated reviewers, signed or server-held approvals, access control, and an append-only audit log. Medical keyword detection is heuristic; mark `review` explicitly for medical content it misses.

## Verification

`npm test` runs type/schema/generator checks, offline evidence tests, FFmpeg availability and Remotion browser bundling. Evidence tests use synthetic records, cover provider failures and malformed responses, invented references, mismatched excerpts, stale/edit-invalidated approvals, refresh resets, CLI safety gates and direct rendering gates. CI runs the same tests from the committed lockfile; it never calls literature, OpenAI, or Pixelle services.
