import { Model } from '@nozbe/watermelondb'
import { text } from '@nozbe/watermelondb/decorators'

export class Subject extends Model {
  static table = 'subjects'

  @text('name') name!: string
}
