const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Whether a route param / body field is a uuid (checked before it reaches a query). */
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)
