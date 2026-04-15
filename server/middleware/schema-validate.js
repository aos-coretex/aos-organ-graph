/**
 * JSON Schema validation middleware for Graph's HTTP route boundary.
 *
 * Loads the published schemas from server/schemas/ at module init and
 * compiles Ajv validators once. Rejects malformed bodies hard with 400
 * SCHEMA_VALIDATION_FAILED — no log-and-continue.
 *
 * The schemas ratify the post-a7u-5 contract (concept type lives inside
 * data; binding from_urn/to_urn/relation live inside data). They hard-
 * reject the pre-a7u-5 envelope shapes via additionalProperties: false.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMAS_DIR = resolve(__dirname, '..', 'schemas');

function loadSchema(name) {
  const path = resolve(SCHEMAS_DIR, name);
  return JSON.parse(readFileSync(path, 'utf8'));
}

const ajv = new Ajv({ allErrors: true, strict: true });

const conceptSchema = loadSchema('concept.schema.json');
const conceptPatchSchema = loadSchema('concept-patch.schema.json');
const bindingSchema = loadSchema('binding.schema.json');

const validateConceptInsert = ajv.compile(conceptSchema);
const validateConceptPatch = ajv.compile(conceptPatchSchema);
const validateBindingInsert = ajv.compile(bindingSchema);

function reject(res, validator) {
  return res.status(400).json({
    error: 'SCHEMA_VALIDATION_FAILED',
    details: ajv.errorsText(validator.errors, { separator: '; ' }),
    errors: validator.errors,
  });
}

/** Middleware: validate POST /concepts body against concept.schema.json. */
export function validateConceptBody(req, res, next) {
  if (!validateConceptInsert(req.body)) return reject(res, validateConceptInsert);
  next();
}

/** Middleware: validate PATCH /concepts/:urn body against concept-patch.schema.json. */
export function validateConceptPatchBody(req, res, next) {
  if (!validateConceptPatch(req.body)) return reject(res, validateConceptPatch);
  next();
}

/** Middleware: validate POST /bindings body against binding.schema.json. */
export function validateBindingBody(req, res, next) {
  if (!validateBindingInsert(req.body)) return reject(res, validateBindingInsert);
  next();
}

export const schemas = {
  concept: conceptSchema,
  conceptPatch: conceptPatchSchema,
  binding: bindingSchema,
};
