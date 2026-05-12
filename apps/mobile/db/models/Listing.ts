import { Model } from '@nozbe/watermelondb'
import { text, field } from '@nozbe/watermelondb/decorators'

export class Listing extends Model {
  static table = 'listings'

  @text('slug') slug!: string
  @text('title') title!: string
  @text('type') type!: string
  @text('status') status!: string
  @field('exam_date') examDate!: number | null
}
