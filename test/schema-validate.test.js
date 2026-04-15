/**
 * Unit tests for the schema validator middleware.
 *
 * Validates the published schemas accept the post-a7u-5 contract and
 * hard-reject the pre-a7u-5 envelope drift class.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateConceptBody,
  validateConceptPatchBody,
  validateBindingBody,
  schemas,
} from '../server/middleware/schema-validate.js';

function runMiddleware(mw, body) {
  const req = { body };
  let statusCode = 200;
  let payload = null;
  let nextCalled = false;
  const res = {
    status(code) { statusCode = code; return this; },
    json(p) { payload = p; return this; },
  };
  mw(req, res, () => { nextCalled = true; });
  return { statusCode, payload, nextCalled };
}

describe('Concept schema', () => {
  it('accepts the canonical post-a7u-5 shape (data.type, no envelope type)', () => {
    const result = runMiddleware(validateConceptBody, {
      urn: 'urn:graphheight:msp_version:1.0.0-seed',
      data: { type: 'msp_version', version: '1.0.0-seed', status: 'active' },
    });
    assert.equal(result.nextCalled, true);
    assert.equal(result.statusCode, 200);
  });

  it('accepts arbitrary additional fields inside data (organ-owned)', () => {
    const result = runMiddleware(validateConceptBody, {
      urn: 'urn:llm-ops:ruling:2026-04-14T00:31:25.828Z-vwah',
      data: {
        type: 'ruling',
        ap_ref: 'urn:llm-ops:apm:abc',
        ruling: 'Denied',
        cited_rules: [],
        record_status: 'final',
      },
    });
    assert.equal(result.nextCalled, true);
  });

  it('rejects envelope-level type (a7u-5 drift)', () => {
    const result = runMiddleware(validateConceptBody, {
      urn: 'urn:test:concept:envelope-type',
      type: 'msp_version',
      data: { type: 'msp_version' },
    });
    assert.equal(result.nextCalled, false);
    assert.equal(result.statusCode, 400);
    assert.equal(result.payload.error, 'SCHEMA_VALIDATION_FAILED');
  });

  it('rejects missing data.type (would have produced the SQLite-layer error)', () => {
    const result = runMiddleware(validateConceptBody, {
      urn: 'urn:test:concept:no-type',
      data: { name: 'no-type' },
    });
    assert.equal(result.nextCalled, false);
    assert.equal(result.statusCode, 400);
  });

  it('rejects non-snake_case type values', () => {
    const result = runMiddleware(validateConceptBody, {
      urn: 'urn:test:concept:camel',
      data: { type: 'CamelCase' },
    });
    assert.equal(result.nextCalled, false);
    assert.equal(result.statusCode, 400);
  });

  it('rejects malformed urn', () => {
    const result = runMiddleware(validateConceptBody, {
      urn: 'not-a-urn',
      data: { type: 'test' },
    });
    assert.equal(result.nextCalled, false);
    assert.equal(result.statusCode, 400);
  });

  it('rejects data sent as a string (the pre-a7u-5 adapter contract)', () => {
    const result = runMiddleware(validateConceptBody, {
      urn: 'urn:test:concept:string-data',
      data: '{"type":"test"}',
    });
    assert.equal(result.nextCalled, false);
    assert.equal(result.statusCode, 400);
  });
});

describe('Concept PATCH schema', () => {
  it('accepts a minimal partial-merge body', () => {
    const result = runMiddleware(validateConceptPatchBody, {
      data: { spent: true, spent_at: '2026-04-14T00:00:00.000Z' },
    });
    assert.equal(result.nextCalled, true);
  });

  it('does not require type on PATCH (partial merges are common)', () => {
    const result = runMiddleware(validateConceptPatchBody, {
      data: { status: 'active' },
    });
    assert.equal(result.nextCalled, true);
  });

  it('rejects envelope-level type on PATCH', () => {
    const result = runMiddleware(validateConceptPatchBody, {
      type: 'ruling',
      data: { status: 'active' },
    });
    assert.equal(result.nextCalled, false);
    assert.equal(result.statusCode, 400);
  });
});

describe('Binding schema', () => {
  it('accepts the canonical on-disk shape (from_urn/to_urn/relation in data)', () => {
    const result = runMiddleware(validateBindingBody, {
      ubn: 'ubn:llm-ops:adjudicates:2026-04-14T00:31:25.833Z-wie9',
      type: 'instance',
      data: {
        from_urn: 'urn:llm-ops:ruling:abc',
        to_urn: 'urn:llm-ops:apm:def',
        relation: 'adjudicates',
        binding_type: 'instance',
        created_by: 'Nomos',
      },
    });
    assert.equal(result.nextCalled, true);
  });

  it('accepts envelope-level type as optional', () => {
    const result = runMiddleware(validateBindingBody, {
      ubn: 'ubn:test:r:1',
      data: { from_urn: 'urn:test:a:1', to_urn: 'urn:test:b:1', relation: 'r' },
    });
    assert.equal(result.nextCalled, true);
  });

  it('rejects envelope-level source_urn / target_urn (analog drift)', () => {
    const result = runMiddleware(validateBindingBody, {
      ubn: 'ubn:test:r:envelope-drift',
      source_urn: 'urn:test:a:1',
      target_urn: 'urn:test:b:1',
      data: { from_urn: 'urn:test:a:1', to_urn: 'urn:test:b:1', relation: 'r' },
    });
    assert.equal(result.nextCalled, false);
    assert.equal(result.statusCode, 400);
  });

  it('rejects missing data.relation', () => {
    const result = runMiddleware(validateBindingBody, {
      ubn: 'ubn:test:r:no-relation',
      data: { from_urn: 'urn:test:a:1', to_urn: 'urn:test:b:1' },
    });
    assert.equal(result.nextCalled, false);
    assert.equal(result.statusCode, 400);
  });

  it('rejects malformed ubn', () => {
    const result = runMiddleware(validateBindingBody, {
      ubn: 'not-a-ubn',
      data: { from_urn: 'urn:test:a:1', to_urn: 'urn:test:b:1', relation: 'r' },
    });
    assert.equal(result.nextCalled, false);
    assert.equal(result.statusCode, 400);
  });
});

describe('Schema files exported', () => {
  it('exposes all three schemas with $id and required keys', () => {
    assert.ok(schemas.concept.$id);
    assert.ok(schemas.conceptPatch.$id);
    assert.ok(schemas.binding.$id);
    assert.deepEqual(schemas.concept.required, ['urn', 'data']);
    assert.deepEqual(schemas.binding.required, ['ubn', 'data']);
  });
});
