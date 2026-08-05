/**
 * Minimal JSON Schema draft-07 validator covering the subset used by the
 * fixture schemas in packages/fixtures/schemas. Not a general-purpose
 * implementation; intentionally small and dependency-free.
 */

export type Schema = {
  type?: string | string[];
  required?: string[];
  properties?: Record<string, Schema>;
  additionalProperties?: boolean | Schema;
  items?: Schema;
  enum?: unknown[];
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  pattern?: string;
  format?: string;
  $schema?: string;
  $id?: string;
  title?: string;
};

export function validateAgainstSchema(value: unknown, schema: Schema, path = '$'): string[] {
  const errors: string[] = [];

  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = typeOf(value);
    // JSON Schema draft-07: "integer" and "number" overlap for whole numbers.
    const matches =
      types.includes(actual) || (types.includes('number') && actual === 'integer');
    if (!matches) {
      errors.push(`${path}: expected type ${types.join('|')}, got ${actual}`);
    }
  }

  if (schema.enum !== undefined) {
    const matches = schema.enum.some((entry) => JSON.stringify(entry) === JSON.stringify(value));
    if (!matches) {
      errors.push(`${path}: value not in enum ${JSON.stringify(schema.enum)}`);
    }
  }

  if (schema.required && typeof value === 'object' && value !== null) {
    for (const key of schema.required) {
      if (!(key in (value as Record<string, unknown>))) {
        errors.push(`${path}: missing required property '${key}'`);
      }
    }
  }

  if (schema.properties && typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    for (const [key, subSchema] of Object.entries(schema.properties)) {
      if (key in record) {
        errors.push(...validateAgainstSchema(record[key], subSchema, `${path}.${key}`));
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(record)) {
        if (!(key in schema.properties)) {
          errors.push(`${path}: unexpected property '${key}'`);
        }
      }
    }
  }

  if (schema.items && Array.isArray(value)) {
    value.forEach((item, index) => {
      errors.push(...validateAgainstSchema(item, schema.items as Schema, `${path}[${index}]`));
    });
  }

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${path}: shorter than minLength ${schema.minLength}`);
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push(`${path}: longer than maxLength ${schema.maxLength}`);
    }
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${path}: does not match pattern ${schema.pattern}`);
    }
  }

  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(`${path}: below minimum ${schema.minimum}`);
    }
  }

  return errors;
}

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number' && Number.isInteger(value)) return 'integer';
  return typeof value;
}
