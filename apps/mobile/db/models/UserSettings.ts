import { Model } from '@nozbe/watermelondb'
import { text, field } from '@nozbe/watermelondb/decorators'

export class UserSettings extends Model {
  static table = 'user_settings'

  @text('selected_listing_slug') selectedListingSlug!: string
  @field('last_synced_at') lastSyncedAt!: number
}
