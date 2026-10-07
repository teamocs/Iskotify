const mb = (bytes: number) => `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`

/** A Drive download (or Google export) stopped because it passed its byte cap. */
export class FileTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`File is larger than ${mb(maxBytes)} once exported — split it into smaller files.`)
    this.name = 'FileTooLargeError'
  }
}
