import { z } from 'zod';

/**
 * Zod schemas mirror the metamodel (types.ts) and form the runtime validation gate.
 * Invariants: 0 <= v,e <= 1; evolutionEnd > evolutionStart; unique IDs; edge endpoints
 * reference existing elements (cross-field validated in `validateMap`).
 */

const norm = z.number().min(0).max(1);

const coordinateSchema = z.object({
  visibility: norm,
  evolution: norm,
});

const labelOffsetSchema = z.object({
  dx: z.number(),
  dy: z.number(),
});

const methodSchema = z.enum(['build', 'buy', 'outsource']);

const decoratorsSchema = z.object({
  market: z.boolean().optional(),
  ecosystem: z.boolean().optional(),
  inertia: z.boolean().optional(),
  method: methodSchema.optional(),
});

const movementSchema = z.object({
  targetEvolution: norm,
  newLabel: z.string().optional(),
  method: methodSchema.optional(),
  labelOffset: labelOffsetSchema.optional(),
});

const baseFields = {
  id: z.string().min(1),
  label: z.string(),
  position: coordinateSchema,
  labelOffset: labelOffsetSchema.optional(),
  color: z.string().optional(),
};

const anchorSchema = z.object({ ...baseFields, elementType: z.literal('anchor') });

const componentSchema = z.object({
  ...baseFields,
  elementType: z.literal('component'),
  decorators: decoratorsSchema.optional(),
  movement: movementSchema.optional(),
  pipelineId: z.string().optional(),
  url: z.string().optional(),
});

const pipelineSchema = z
  .object({
    ...baseFields,
    elementType: z.literal('pipeline'),
    evolutionStart: norm,
    evolutionEnd: norm,
    childIds: z.array(z.string()),
  })
  .refine((p) => p.evolutionEnd > p.evolutionStart, {
    message: 'evolutionEnd must be greater than evolutionStart',
    path: ['evolutionEnd'],
  });

const climaticPatternSchema = z.enum([
  'everythingEvolves',
  'characteristicsChange',
  'noOneSizeFitsAll',
  'efficiencyEnablesInnovation',
  'pastSuccessBreedsInertia',
  'capitalFlowsToNewValue',
]);

const noteSchema = z.object({
  ...baseFields,
  elementType: z.literal('note'),
  patternType: climaticPatternSchema.optional(),
});

const annotationSchema = z.object({
  ...baseFields,
  elementType: z.literal('annotation'),
  number: z.number().int(),
  positions: z.array(coordinateSchema),
  text: z.string(),
});

const acceleratorSchema = z.object({
  ...baseFields,
  elementType: z.literal('accelerator'),
  direction: z.enum(['accelerate', 'deaccelerate']),
});

const attitudeSchema = z.object({
  ...baseFields,
  elementType: z.literal('attitude'),
  kind: z.enum(['pioneers', 'settlers', 'townplanners']),
  /** Opposite corner (normalized) — OWM `[vis1, mat1, vis2, mat2]`. */
  corner2: coordinateSchema,
});

const submapSchema = z.object({
  ...baseFields,
  elementType: z.literal('submap'),
  urlRef: z.string().optional(),
});

const drawingSchema = z.object({
  ...baseFields,
  elementType: z.literal('drawing'),
  points: z.array(coordinateSchema).min(2),
  closed: z.boolean().optional(),
  strokeStyle: z.enum(['solid', 'dashed', 'dotted']).optional(),
});

export const mapElementSchema = z.discriminatedUnion('elementType', [
  anchorSchema,
  componentSchema,
  pipelineSchema,
  noteSchema,
  annotationSchema,
  acceleratorSchema,
  attitudeSchema,
  submapSchema,
  drawingSchema,
]);

const dependencySchema = z.object({
  id: z.string().min(1),
  edgeType: z.literal('dependency'),
  from: z.string(),
  to: z.string(),
  label: z.string().optional(),
});

const flowSchema = z.object({
  id: z.string().min(1),
  edgeType: z.literal('flow'),
  from: z.string(),
  to: z.string(),
  flowValue: z.string().optional(),
  bidirectional: z.boolean().optional(),
  label: z.string().optional(),
});

export const mapEdgeSchema = z.discriminatedUnion('edgeType', [dependencySchema, flowSchema]);

const mapConfigSchema = z.object({
  title: z.string(),
  size: z.object({ width: z.number(), height: z.number() }).optional(),
  style: z.enum(['wardley', 'handwritten', 'colour', 'dark']).optional(),
  evolutionLabels: z.tuple([z.string(), z.string(), z.string(), z.string()]).optional(),
  stageBoundaries: z
    .tuple([norm, norm, norm])
    .refine(([g, c, p]) => g < c && c < p, {
      message: 'stageBoundaries must be strictly ascending',
    })
    .optional(),
  yAxisLabel: z.string().optional(),
  yAxisEndLabels: z.tuple([z.string(), z.string()]).optional(),
  annotationsBoxPosition: coordinateSchema.optional(),
});

export const wardleyMapSchema = z.object({
  schemaVersion: z.number().int().positive(),
  config: mapConfigSchema,
  elements: z.array(mapElementSchema),
  edges: z.array(mapEdgeSchema),
  rawPassthrough: z.array(z.string()).optional(),
});

export type WardleyMapInput = z.input<typeof wardleyMapSchema>;
