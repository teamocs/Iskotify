// Which focus trap currently owns the keyboard. Overlays can stack (a drawer
// with a confirm dialog on top); every trap listens on window, so without this
// Escape would close all of them at once and Tab would still cycle the covered
// one. Only the top of the stack may react.

const stack: symbol[] = []

export function pushTrap(id: symbol): void {
  stack.push(id)
}

export function popTrap(id: symbol): void {
  const i = stack.lastIndexOf(id)
  if (i !== -1) stack.splice(i, 1)
}

export function isTopTrap(id: symbol): boolean {
  return stack.length > 0 && stack[stack.length - 1] === id
}

/** Test helper. */
export function resetTrapStack(): void {
  stack.length = 0
}
