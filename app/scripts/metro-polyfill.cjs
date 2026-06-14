// Polyfill for Array.prototype.toReversed (Node < 21).
// Must not write to stdout — Gradle runs `node --print` and captures stdout for paths.
if (typeof Array.prototype.toReversed !== 'function') {
  Object.defineProperty(Array.prototype, 'toReversed', {
    value: function toReversed() {
      return [...this].reverse();
    },
    configurable: true,
    writable: true,
  });
}
