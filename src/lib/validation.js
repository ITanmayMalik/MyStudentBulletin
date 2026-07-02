export function sanitizeISBN(input) {
  return String(input ?? '').replace(/\D/g, '')
}
