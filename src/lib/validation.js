export const ALLOWED_EMAIL_DOMAINS = [
  'macewan.ca',
  'ualberta.ca',
  'ucalgary.ca',
  'nait.ca',
  'mtroyal.ca',
]

export function isAllowedStudentEmail(email = '') {
  const domain = email.trim().toLowerCase().split('@')[1]
  return Boolean(domain && ALLOWED_EMAIL_DOMAINS.includes(domain))
}

export function sanitizeISBN(input) {
  return String(input ?? '').replace(/\D/g, '')
}
