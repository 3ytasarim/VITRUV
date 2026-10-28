'use client';

/**
 * Browser page translation (Chrome/Google Translate, Edge, Safari) replaces React's text nodes
 * with its own <font> wrappers. When React later updates such a node (e.g. a form status after
 * "Passwort setzen"), `removeChild` / `insertBefore` throw NotFoundError and the whole page falls
 * into the error boundary. Owner report 2026-10-28 (admin used with Turkish auto-translation).
 *
 * Well-known mitigation (React GitHub issue 11538): when the node to remove/insert before is no
 * longer a child of this parent — only possible after a third party rewrote the DOM — skip the
 * operation instead of throwing. Normal React operations are untouched. Runs once, on load.
 */
if (typeof window !== 'undefined' && typeof Node === 'function' && Node.prototype) {
  const proto = Node.prototype as Node & { __vtTranslationGuard?: true };
  if (!proto.__vtTranslationGuard) {
    proto.__vtTranslationGuard = true;
    const removeChild = proto.removeChild;
    proto.removeChild = function <T extends Node>(this: Node, child: T): T {
      if (child.parentNode !== this) return child;
      return removeChild.call(this, child) as T;
    };
    const insertBefore = proto.insertBefore;
    proto.insertBefore = function <T extends Node>(this: Node, node: T, ref: Node | null): T {
      if (ref && ref.parentNode !== this) return node;
      return insertBefore.call(this, node, ref) as T;
    };
  }
}

/** Mount once in the root layout; renders nothing. */
export function TranslationGuard() {
  return null;
}
