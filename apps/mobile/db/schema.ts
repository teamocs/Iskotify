import { appSchema, tableSchema } from '@nozbe/watermelondb'

export const dbSchema = appSchema({
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
