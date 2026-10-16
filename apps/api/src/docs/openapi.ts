import type { INestApplication } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import type { ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { pascalKey } from '../core/case';
import { crudFindBody } from '../core/crud';
import { API_KEY_SCOPES } from '../integration/api-keys';
import { WEBHOOK_EVENTS } from '../integration/webhooks';
import { changeBody, findBody } from '../partner/applications';
import { cards, products } from '../partner/catalog';

// API description for integration (Swagger UI at /docs, JSON at /docs/openapi.json).
// The partner gateway is the integration API — a bank's system calls the same endpoints as the partner cabinet.
// Request bodies are generated from the same zod schemas the API validates with (keys PascalCase, as on the wire),
// so the description cannot drift from the code.

type Json = Record<string, unknown>;

/** zod → JSON schema with PascalCase property names (the API's wire format). */
const schema = (z: ZodTypeAny): Json => {
  const pascal = (s: unknown): unknown => {
    if (Array.isArray(s)) return s.map(pascal);
    if (!s || typeof s !== 'object') return s;
    const o = s as Json;
    const out: Json = {};
    for (const [k, v] of Object.entries(o)) {
      if (k === 'properties' && v && typeof v === 'object') out[k] = Object.fromEntries(Object.entries(v as Json).map(([p, x]) => [pascalKey(p), pascal(x)]));
      else if (k === 'required' && Array.isArray(v)) out[k] = v.map((p) => pascalKey(String(p)));
      else if (k === '$schema') continue;
      else out[k] = pascal(v);
    }
    return out;
  };
  return pascal(zodToJsonSchema(z, { target: 'openApi3', $refStrategy: 'none' })) as Json;
};

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const envelope = (data: Json, example?: unknown) => ({
  description: 'OK — { IsSuccess: true, Data, Error: null }',
  content: { 'application/json': { schema: { allOf: [ref('Envelope'), { type: 'object', properties: { Data: data } }] }, ...(example ? { example: { IsSuccess: true, Data: example, Error: null } } : {}) } },
});
const errors = {
  400: { description: 'VALIDATION_ERROR — Error.Details: [{ Field, Message }]', content: { 'application/json': { schema: ref('ErrorEnvelope') } } },
  401: { description: 'UNAUTHORIZED — no / wrong / disabled API key', content: { 'application/json': { schema: ref('ErrorEnvelope') } } },
  403: { description: 'FORBIDDEN — the key lacks the scope', content: { 'application/json': { schema: ref('ErrorEnvelope') } } },
  404: { description: 'NOT_FOUND — not this organisation’s, or wrong ID / UID', content: { 'application/json': { schema: ref('ErrorEnvelope') } } },
  409: { description: 'CONFLICT — e.g. a status change the status machine does not allow', content: { 'application/json': { schema: ref('ErrorEnvelope') } } },
};
const idUid = [
  { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
  { name: 'uid', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
];
const paging = [
  { name: 'pageNumber', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } },
  { name: 'pageSize', in: 'path', required: true, schema: { type: 'integer', minimum: 1, maximum: 100 } },
];
const body = (s: Json, example?: unknown) => ({ required: true, content: { 'application/json': { schema: s, ...(example ? { example } : {}) } } });
const refRow = { type: 'object', properties: { ID: { type: 'integer' }, UID: { type: 'string', format: 'uuid' } } };

/** Standard CRUD of one partner module (STANDARDS.md): find / detail / add / edit / enable / disable / delete. */
const crudPaths = (module: string, tag: string, write: Json, scopeRead: string, scopeWrite: string, example: Json) => ({
  [`/partner/${module}/find/{pageNumber}/{pageSize}`]: {
    post: { tags: [tag], summary: `${module}: list (${scopeRead})`, parameters: paging, requestBody: body(schema(crudFindBody), { Filter: {}, Sort: [{ Field: 'ID', Dir: 'desc' }] }), responses: { 200: envelope(ref('Page'), { Items: [example], PageNumber: 1, PageSize: 20, TotalCount: 1, TotalPages: 1 }), ...errors } },
  },
  [`/partner/${module}/detail/{id}/{uid}`]: { get: { tags: [tag], summary: `${module}: one (${scopeRead})`, parameters: idUid, responses: { 200: envelope({ type: 'object' }, example), ...errors } } },
  [`/partner/${module}/add`]: { post: { tags: [tag], summary: `${module}: add (${scopeWrite})`, requestBody: body(write), responses: { 200: envelope(refRow), ...errors } } },
  [`/partner/${module}/edit/{id}/{uid}`]: { put: { tags: [tag], summary: `${module}: edit (${scopeWrite})`, parameters: idUid, requestBody: body(write), responses: { 200: envelope(refRow), ...errors } } },
  [`/partner/${module}/enable/{id}/{uid}`]: { put: { tags: [tag], summary: `${module}: enable (${scopeWrite})`, parameters: idUid, responses: { 200: envelope(refRow), ...errors } } },
  [`/partner/${module}/disable/{id}/{uid}`]: { put: { tags: [tag], summary: `${module}: disable (${scopeWrite})`, parameters: idUid, responses: { 200: envelope(refRow), ...errors } } },
  [`/partner/${module}/delete/{id}/{uid}`]: { delete: { tags: [tag], summary: `${module}: delete (${scopeWrite})`, parameters: idUid, responses: { 200: envelope(refRow), ...errors } } },
});

const publicList = (module: string, summary: string) => ({
  [`/public/${module}/find/{pageNumber}/{pageSize}`]: { post: { tags: ['References'], summary, security: [], parameters: paging, requestBody: body(schema(crudFindBody), {}), responses: { 200: envelope(ref('Page')) } } },
});

const APPLICATION_EXAMPLE = {
  ID: 64, UID: '4ea89169-03da-4f36-9db0-2cb61753c570', Status: 'interested', StatusOn: '2026-10-16T15:20:00.000Z', ExpiresOn: '2026-10-16T16:20:00.000Z', OfferOn: null,
  IsMasked: false, ReasonIDs: [], ReasonText: null,
  Application: { ID: 16, ProductType: { ID: 1, NameKa: 'სამომხმარებლო სესხი', NameEn: 'Consumer loan' }, Amount: 3000, Currency: 'GEL', Pid: '01011007919', FirstName: 'ნინო', LastName: 'ბერიძე', Phone: '555001237', CityID: 1, CreatedOn: '2026-10-16T15:13:00.000Z' },
  Offers: [],
};

const DESCRIPTION = `
Integration API for partner organisations (banks, MFOs, leasing). **It is the partner gateway** — the same endpoints, rules and
response format the partner cabinet uses; only the authentication differs.

### Authentication
\`X-Api-Key: lgk_<prefix>_<secret>\` — created by the organisation's back office in the cabinet (Integration tab).
Scopes: ${API_KEY_SCOPES.map((s) => `\`${s}\``).join(', ')}. Read = \`find\` / \`detail\`, everything else is write.

### Format (STANDARDS.md)
* URL: \`/{gateway}/{module}/{action}\`; items are addressed by **both** \`{ID}/{UID}\`.
* Every response: \`{ IsSuccess, Data, Error }\`, keys in **PascalCase**. Errors use real HTTP codes with \`IsSuccess: false\`.
* Non-list actions return \`Data: { ID, UID }\`. Lists: \`POST …/find/{page}/{size}\` with \`{ Filter, Sort }\`.
* Every call gets an \`X-Request-Uid\` response header (also accepted on the request) and is logged under it.

### Applications
One customer application goes to several organisations; you work with **your organisation's record** of it (\`ApplicationOrg\`).
While its status hides personal data (\`sent\`), the applicant is masked (\`IsMasked: true\`) until you take it into review.
Allowed status changes come from the platform's status machine — \`detail\` returns \`Next\` with what you may do now.
Typical flow: \`sent\` → \`interested\` (review) → \`offer\` (with offer cards) → \`done\` (loan issued, \`Issued: true\`) or \`cancelled\`.
The customer does not confirm an offer; they may cancel it at any time (\`declined\`).
Each status may have a deadline (\`ExpiresOn\`); when it passes, the platform moves the record to \`expired\`.

### Webhooks
Configured in the cabinet (Integration tab). Events: ${WEBHOOK_EVENTS.map((e) => `\`${e}\``).join(', ')} (and \`ping\` for a test).
\`POST\` to your URL with JSON (schema \`WebhookPayload\`) and headers:
\`X-Loans-Event\`, \`X-Loans-Delivery\` (delivery UID — use it to ignore repeats), \`X-Loans-Timestamp\` (unix seconds),
\`X-Loans-Signature: sha256=<hex>\` = HMAC-SHA256(secret, \`<timestamp>.<raw body>\`).
Answer 2xx within 10 s. Otherwise it is retried after 1 min, 5 min, 30 min, 2 h, 6 h. The payload carries ids only — read the
details with \`GET /partner/application/detail/{ApplicationOrgID}/{ApplicationOrgUID}\`.

\`\`\`js
// Node.js — verifying a webhook
const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(req.headers['x-loans-timestamp'] + '.' + rawBody).digest('hex');
const ok = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(req.headers['x-loans-signature']))
  && Math.abs(Date.now() / 1000 - Number(req.headers['x-loans-timestamp'])) < 300;
\`\`\`
`;

export function buildPartnerDocument(): Json {
  return {
    openapi: '3.0.3',
    info: { title: 'loans.ge — Partner / Integration API', version: '1.0', description: DESCRIPTION },
    servers: [{ url: process.env.API_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 4000}` }],
    security: [{ ApiKey: [] }],
    tags: [
      { name: 'Applications', description: 'Your organisation’s records of customer applications.' },
      { name: 'Products', description: 'Your loan products (product type + currencies).' },
      { name: 'Offer cards', description: 'Offer terms per product and currency; `Values` follow the product type’s field schema (`/public/productTypeField`).' },
      { name: 'References', description: 'Public reference data (no key needed): statuses, reasons, offer types, product types and their fields, cities.' },
    ],
    paths: {
      '/partner/application/find/{pageNumber}/{pageSize}': {
        post: {
          tags: ['Applications'], summary: 'Applications of your organisation (applications:read)',
          description: 'Newest first. `StatusCounts` — counts per status over the same filter without the status filter.',
          parameters: paging,
          requestBody: body(schema(findBody), { Filter: { Statuses: ['sent', 'interested'], From: '2026-10-01T00:00:00Z' } }),
          responses: { 200: envelope({ allOf: [ref('Page'), { type: 'object', properties: { StatusCounts: { type: 'array', items: { type: 'object', properties: { Status: { type: 'string' }, Count: { type: 'integer' } } } } } }] }, { Items: [APPLICATION_EXAMPLE], PageNumber: 1, PageSize: 20, TotalCount: 1, TotalPages: 1, StatusCounts: [{ Status: 'interested', Count: 1 }] }), ...errors },
        },
      },
      '/partner/application/detail/{id}/{uid}': {
        get: {
          tags: ['Applications'], summary: 'One record with history and allowed next statuses (applications:read)', parameters: idUid,
          responses: {
            200: envelope({ type: 'object' }, { ...APPLICATION_EXAMPLE, Events: [{ ID: 1, FromStatus: null, ToStatus: 'sent', Actor: 'customer', CreatedOn: '2026-10-16T15:13:00.000Z' }], Next: [{ Status: 'offer', Label: 'შეთავაზება გაგზავნილია', ReasonKind: null, RequiresOffer: true, RequiresIssued: false }, { Status: 'cancelled', Label: 'გააუქმა პარტნიორმა', ReasonKind: 'cancel', RequiresOffer: false, RequiresIssued: false }] }),
            ...errors,
          },
        },
      },
      '/partner/application/changeStatus/{id}/{uid}': {
        put: {
          tags: ['Applications'], summary: 'Change the status (applications:write)',
          description: 'Review: `{ Status: "interested" }`. Offer: `{ Status: "offer", Offers: [{ CardID }] }` (amount / term within the card unless given). Decline / cancel: `{ Status, ReasonIDs, ReasonText }` (reasons from `/public/rejectReason` / `/public/cancelReason`). Loan issued: `{ Status: "done", Issued: true }`.',
          parameters: idUid,
          requestBody: body(schema(changeBody), { Status: 'offer', Offers: [{ CardID: 12 }] }),
          responses: { 200: envelope(refRow), ...errors },
        },
      },
      ...crudPaths('product', 'Products', schema(products.schema), 'catalog:read', 'catalog:write', { ID: 3, UID: '…', IsEnable: true, ProductTypeID: 1, Description: null, Currencies: ['GEL', 'USD'], ProductType: { ID: 1, Code: 'consumer_loan', NameKa: 'სამომხმარებლო სესხი' }, Cards: [] }),
      ...crudPaths('card', 'Offer cards', schema(cards.schema), 'catalog:read', 'catalog:write', { ID: 12, UID: '…', IsEnable: true, ProductID: 3, OfferTypeID: 1, Currency: 'GEL', Values: { MinAmt: 500, MaxAmt: 50000, MinM: 3, MaxM: 60, Rate: 14, FeePct: 1, InsPct: 0.3 } }),
      ...publicList('status', 'Statuses (labels, category, deadline)'),
      ...publicList('rejectReason', 'Reject reasons (ReasonIDs when declining)'),
      ...publicList('cancelReason', 'Cancel reasons'),
      ...publicList('offerType', 'Offer types (for offer cards)'),
      ...publicList('productType', 'Product types'),
      ...publicList('productTypeField', 'Offer card fields per product type (Filter: { ProductTypeID })'),
      ...publicList('city', 'Cities'),
    },
    components: {
      securitySchemes: {
        ApiKey: { type: 'apiKey', in: 'header', name: 'X-Api-Key', description: 'lgk_<prefix>_<secret> — from the cabinet, Integration tab' },
      },
      schemas: {
        Envelope: { type: 'object', required: ['IsSuccess', 'Data', 'Error'], properties: { IsSuccess: { type: 'boolean' }, Data: {}, Error: { nullable: true } } },
        ErrorEnvelope: {
          type: 'object',
          properties: {
            IsSuccess: { type: 'boolean', example: false }, Data: { nullable: true, example: null },
            Error: { type: 'object', properties: { Code: { type: 'string', enum: ['VALIDATION_ERROR', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT', 'RATE_LIMITED', 'INTERNAL_ERROR'] }, Message: { type: 'string' }, Details: { type: 'array', items: { type: 'object', properties: { Field: { type: 'string' }, Message: { type: 'string' } } } } } },
          },
        },
        Page: { type: 'object', properties: { Items: { type: 'array', items: { type: 'object' } }, PageNumber: { type: 'integer' }, PageSize: { type: 'integer' }, TotalCount: { type: 'integer' }, TotalPages: { type: 'integer' } } },
        WebhookPayload: {
          type: 'object',
          properties: {
            Event: { type: 'string', enum: [...WEBHOOK_EVENTS, 'ping'] },
            OccurredOn: { type: 'string', format: 'date-time' },
            DeliveryUID: { type: 'string', format: 'uuid', description: 'same as X-Loans-Delivery; repeats of one delivery share it' },
            Data: { type: 'object', properties: { ApplicationOrgID: { type: 'integer' }, ApplicationOrgUID: { type: 'string', format: 'uuid' }, ApplicationID: { type: 'integer' }, Status: { type: 'string' }, Actor: { type: 'string', enum: ['customer', 'partner', 'system', 'admin'] } } },
          },
          example: { Event: 'application.created', OccurredOn: '2026-10-16T15:13:00.000Z', DeliveryUID: '3f0c…', Data: { ApplicationOrgID: 64, ApplicationOrgUID: '4ea89169-03da-4f36-9db0-2cb61753c570', ApplicationID: 16, Status: 'sent', Actor: 'customer' } },
        },
      },
    },
  };
}

/** Swagger UI at /docs, the document at /docs/openapi.json (both outside the gateways — no auth, no envelope). */
export function setupDocs(app: INestApplication) {
  if (process.env.API_DOCS === 'false') return;
  const doc = buildPartnerDocument();
  SwaggerModule.setup('docs', app, doc as never, {
    jsonDocumentUrl: 'docs/openapi.json',
    customSiteTitle: 'loans.ge — Partner API',
    swaggerOptions: { persistAuthorization: true, docExpansion: 'list', defaultModelsExpandDepth: 0 },
  });
}
