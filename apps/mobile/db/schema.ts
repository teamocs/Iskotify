import { appSchema, tableSchema } from '@nozbe/watermelondb'

const _schema = appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'subjects',
      columns: [
        { name: 'name', type: 'string' },
      ],
    }),
    tableSchema({
      name: 'topics',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'subject_id', type: 'string', isIndexed: true },
        { name: 'status', type: 'string' },
      ],
    }),
    tableSchema({
      name: 'flashcards',
      columns: [
        { name: 'topic_id', type: 'string', isIndexed: true },
        { name: 'question', type: 'string' },
        { name: 'answer', type: 'string' },
        { name: 'explanation', type: 'string' },
        { name: 'difficulty', type: 'number' },
        { name: 'listing_slugs', type: 'string' },
        { name: 'remote_updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'listings',
      columns: [
        { name: 'slug', type: 'string', isIndexed: true },
        { name: 'title', type: 'string' },
        { name: 'type', type: 'string' },
        { name: 'status', type: 'string' },
        { name: 'exam_date', type: 'number', isOptional: true },
      ],
    }),
    tableSchema({
      name: 'user_settings',
      columns: [
        { name: 'selected_listing_slug', type: 'string' },
        { name: 'last_synced_at', type: 'number' },
      ],
    }),
  ],
})

/**
 * Re-export dbSchema with tables and columns as arrays for compatibility
 * with tests and tooling that expect array-shaped schema objects.
 *
 * WatermelonDB internally stores tables/columns as dictionaries;
 * columnArray preserves the original input order.
 */
export const dbSchema = {
  ..._schema,
  tables: Object.values(_schema.tables).map((t) => ({
    ...t,
    columns: t.columnArray,
  })),
}
