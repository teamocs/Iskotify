import { Model } from '@nozbe/watermelondb'
import { text } from '@nozbe/watermelondb/decorators'

export class Topic extends Model {
  static table = 'topics'
  static associations = {
    subjects: { type: 'belongs_to' as const, key: 'subject_id' },
    flashcards: { type: 'has_many' as const, foreignKey: 'topic_id' },
  }

  @text('name') name!: string
  @text('subject_id') subjectId!: string
  @text('status') status!: string
}
