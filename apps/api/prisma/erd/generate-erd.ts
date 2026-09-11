/**
 * Generates docs/diagrams/erd.md (Mermaid erDiagram) from prisma/schema.prisma.
 *
 * The diagram is derived, never hand-edited: CI regenerates it and fails when
 * the committed file is stale, so the thesis ERD always matches the schema.
 *
 *   pnpm erd
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
// @prisma/internals is CommonJS; named ESM imports are not detected, so take the default export.
import prismaInternals from '@prisma/internals';

const { getDMMF } = prismaInternals;

const SCHEMA_PATH = path.resolve(import.meta.dirname, '../schema.prisma');
const OUTPUT_PATH = path.resolve(import.meta.dirname, '../../../../docs/diagrams/erd.md');

interface DmmfField {
  name: string;
  kind: 'scalar' | 'object' | 'enum' | 'unsupported';
  type: string;
  isId: boolean;
  isUnique: boolean;
  isRequired: boolean;
  isList: boolean;
  dbName?: string | null;
  nativeType?: [string, string[]] | null;
  relationName?: string;
  relationFromFields?: string[];
  relationToFields?: string[];
  documentation?: string;
}

interface DmmfModel {
  name: string;
  dbName?: string | null;
  fields: DmmfField[];
  primaryKey?: { fields: string[] } | null;
  uniqueFields: string[][];
}

const SCALAR_TYPE_LABEL: Readonly<Record<string, string>> = {
  String: 'string',
  Int: 'int',
  BigInt: 'bigint',
  Decimal: 'decimal',
  Boolean: 'boolean',
  DateTime: 'timestamptz',
  Json: 'jsonb',
  Bytes: 'bytea',
  Float: 'float8',
};

function tableName(model: DmmfModel): string {
  return model.dbName ?? model.name;
}

function columnName(field: DmmfField): string {
  return field.dbName ?? field.name;
}

/** Postgres native types (`@db.*`) that are more informative than the Prisma scalar. */
const NATIVE_TYPE_LABEL: Readonly<Record<string, string>> = {
  Uuid: 'uuid',
  Citext: 'citext',
  Inet: 'inet',
  Date: 'date',
  Timestamptz: 'timestamptz',
  Decimal: 'decimal',
};

function typeLabel(field: DmmfField): string {
  if (field.kind === 'unsupported') {
    // "geometry(Point, 4326)" -> geometry ; "vector(768)" -> vector
    return field.type.replace(/\(.*$/, '');
  }
  if (field.kind === 'enum') {
    return field.type;
  }
  const native = field.nativeType?.[0];
  const label =
    (native !== undefined ? NATIVE_TYPE_LABEL[native] : undefined) ??
    SCALAR_TYPE_LABEL[field.type] ??
    field.type.toLowerCase();
  return field.isList ? `${label}_array` : label;
}

function keyMarkers(model: DmmfModel, field: DmmfField, foreignKeys: ReadonlySet<string>): string {
  const markers: string[] = [];
  const inCompoundPk = model.primaryKey?.fields.includes(field.name) ?? false;
  if (field.isId || inCompoundPk) {
    markers.push('PK');
  }
  if (foreignKeys.has(field.name)) {
    markers.push('FK');
  }
  const inSingleUnique =
    field.isUnique || model.uniqueFields.some((u) => u.length === 1 && u[0] === field.name);
  if (inSingleUnique && !field.isId) {
    markers.push('UK');
  }
  return markers.length > 0 ? ` ${markers.join(', ')}` : '';
}

function renderEntity(model: DmmfModel): string[] {
  const foreignKeys = new Set(
    model.fields.flatMap((f) => (f.kind === 'object' ? (f.relationFromFields ?? []) : [])),
  );
  const lines = [`  ${tableName(model)} {`];
  for (const field of model.fields) {
    if (field.kind === 'object') {
      continue;
    }
    const nullable = field.isRequired ? '' : ' "nullable"';
    lines.push(
      `    ${typeLabel(field)} ${columnName(field)}${keyMarkers(model, field, foreignKeys)}${nullable}`,
    );
  }
  lines.push('  }');
  return lines;
}

function renderRelations(models: readonly DmmfModel[]): string[] {
  const byName = new Map(models.map((m) => [m.name, m]));
  const lines: string[] = [];
  for (const model of models) {
    for (const field of model.fields) {
      const from = field.relationFromFields ?? [];
      if (field.kind !== 'object' || from.length === 0) {
        continue; // only render from the side that owns the foreign key
      }
      const target = byName.get(field.type);
      if (target === undefined) {
        continue;
      }
      const fkRequired = from.every(
        (name) => model.fields.find((f) => f.name === name)?.isRequired ?? false,
      );
      const pkFields = model.primaryKey?.fields ?? [];
      const fkUnique =
        model.uniqueFields.some(
          (u) => u.length === from.length && u.every((n) => from.includes(n)),
        ) ||
        (from.length === 1 && (model.fields.find((f) => f.name === from[0])?.isId ?? false)) ||
        (pkFields.length > 0 &&
          pkFields.length === from.length &&
          pkFields.every((n) => from.includes(n)));
      const parentSide = fkRequired ? '||' : '|o';
      const childSide = fkUnique ? 'o|' : 'o{';
      lines.push(
        `  ${tableName(target)} ${parentSide}--${childSide} ${tableName(model)} : "${field.name}"`,
      );
    }
  }
  return lines.sort();
}

async function main(): Promise<void> {
  const datamodel = readFileSync(SCHEMA_PATH, 'utf8');
  const dmmf = await getDMMF({ datamodel });
  const models = dmmf.datamodel.models as unknown as DmmfModel[];

  const body = ['erDiagram', ...models.flatMap(renderEntity), '', ...renderRelations(models)].join(
    '\n',
  );

  const document = `# SmartEstate — Entity-Relationship Diagram

Generated from [\`apps/api/prisma/schema.prisma\`](../../apps/api/prisma/schema.prisma) by
\`pnpm erd\`. Do not edit by hand; CI fails when this file is out of date.

Legend: \`PK\` primary key · \`FK\` foreign key · \`UK\` unique · \`"nullable"\` optional column.
Relation lines are drawn from the table that owns the foreign key; \`||\` required parent,
\`|o\` optional parent, \`o{\` many children, \`o|\` at most one child.
\`geometry\` columns are PostGIS (SRID 4326); \`vector\` is pgvector (768 dimensions).

\`\`\`mermaid
${body}
\`\`\`
`;

  writeFileSync(OUTPUT_PATH, document, 'utf8');
  console.info(`erd: ${String(models.length)} entities written to ${OUTPUT_PATH}`);
}

await main();
