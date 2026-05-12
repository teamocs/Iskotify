import { Model } from '@nozbe/watermelondb'
import { text } from '@nozbe/watermelondb/decorators'

export class Subject extends Model {
  static table = 'subjects'
  static associations = {
    topics: { type: 'has_many' as const, foreignKey: 'subject_id' },
  }

  @text('name') name!: string
}
