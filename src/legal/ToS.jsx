import LegalLayout from './LegalLayout'

export default function ToS({ onBack }) {
  return <LegalLayout eyebrow="LEGAL / 01" title="Terms of Service" onBack={onBack}>
    <section><h2>1. A bulletin board, not a retailer</h2><p>MyStudentBulletin is a matching service only. We do not own, inspect, authenticate, ship, insure, or guarantee listed items. We do not process payments and are not a party to transactions between users.</p></section>
    <section><h2>2. Your responsibility</h2><p>You are responsible for confirming a book’s identity, condition, edition, ownership, and suitability before exchanging money. Meet in a safe public place, inspect the physical item, and use your own judgment.</p></section>
    <section><h2>3. Prohibited conduct</h2><p>Do not list or distribute PDFs, e-books, access credentials, pirated or stolen material. Spam, automated scraping, impersonation, fraud, harassment, threats, and attempts to bypass platform safeguards are prohibited.</p></section>
    <section><h2>4. No warranties</h2><p>The platform is provided “as is” and “as available,” without warranties of any kind. To the fullest extent permitted by law, MyStudentBulletin is not liable for losses, disputes, injuries, payments, item quality, or user conduct.</p></section>
    <section><h2>5. Enforcement</h2><p>We may remove content, restrict accounts, preserve reports, or ban users who breach these terms, abuse other users, or evade applicable verification and safety requirements.</p></section>
  </LegalLayout>
}
