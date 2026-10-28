// Shared with server components, so it lives outside the 'use client' Table module
// (a server import of a value from a client module gets a reference, not the string).

/** The bordered frame a table sits in. No overflow clipping, so the bulk bar
 *  can stick to the bottom of the view and menus can open outside it. */
export const TABLE_FRAME = 'rounded-group border border-subtle bg-surface'
