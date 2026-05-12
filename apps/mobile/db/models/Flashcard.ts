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

  get listingSlugs(): string[] {
    const raw = this._getRaw('listing_slugs') as string | null
    try {
      return JSON.parse(raw ?? '[]')
    } catch {
      return []
    }
  }
}
