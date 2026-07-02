import LegalLayout from './LegalLayout'

export default function AUP({ onBack }) {
  return <LegalLayout eyebrow="LEGAL / 03" title="Acceptable Use Policy" onBack={onBack}>
    <section><h2>1. Physical textbooks only</h2><p>Listings must offer lawful physical textbooks or directly related physical course materials. Digital files, copied content, license keys sold separately, and links to unauthorized downloads are not permitted.</p></section>
    <section><h2>2. Honest participation</h2><p>Describe item condition and access-code status accurately. Do not misrepresent identity, school affiliation, ownership, pricing, availability, or transaction history.</p></section>
    <section><h2>3. Safety first</h2><p>Use public, well-lit campus meeting areas. Inspect the book before paying. Never pressure another user to send money in advance or move a conversation to an unsafe channel.</p></section>
    <section><h2>4. Respectful conduct</h2><p>Harassment, hate speech, sexual content, threats, spam, scams, doxxing, and misuse of personal information are prohibited.</p></section>
    <section><h2>5. Reporting</h2><p>Use the in-app report controls for suspicious users, messages, scams, harassment, or prohibited listings. Reports should be accurate and made in good faith.</p></section>
  </LegalLayout>
}
