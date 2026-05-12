import { Database } from '@nozbe/watermelondb'
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite'
import { dbSchema } from './schema'
import { Subject } from './models/Subject'
import { Topic } from './models/Topic'
import { Flashcard } from './models/Flashcard'
import { Listing } from './models/Listing'
import { UserSettings } from './models/UserSettings'

const adapter = new SQLiteAdapter({
  schema: dbSchema,
  dbName: 'iskotify',
  jsi: true,
  onSetUpError: (e: unknown) => console.error('[db] setup error', e),
})

export const database = new Database({
  adapter,
  modelClasses: [Subject, Topic, Flashcard, Listing, UserSettings],
})
