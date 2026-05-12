import { Model } from '@nozbe/watermelondb'
import { text, field } from '@nozbe/watermelondb/decorators'

export class Flashcard extends Model {
  static table = 'flashcards'
  static associations = {
    topics: { type: 'belongs_to' as const, key: 'topic_id' },
  }

  @text('topic_id') topicId!: string
  @text('question') question!: string
  @text('answer') answer!: string
  @text('explanation') explanation!: string
  @field('difficulty') difficulty!: number
  @field('remote_updated_at') remoteUpdatedAt!: number | null

  // Plain settable property — used directly in unit tests and by listingSlugs getter.
  // In a live database context, assign this from the raw column value as needed.
  listingSlugsJson: string = ''

  get listingSlugs(): string[] {
    try {
      return JSON.parse(this.listingSlugsJson)
    } catch {
      return []
    }
  }
}
