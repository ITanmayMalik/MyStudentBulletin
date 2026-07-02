import LegalLayout from './LegalLayout'

export default function Privacy({ onBack }) {
  return <LegalLayout eyebrow="LEGAL / 02" title="Privacy Policy" onBack={onBack}>
    <section><h2>1. Information we collect</h2><p>We collect information needed to operate the service: account email, name, optional school and profile photo, listings, messages, reviews, reports, and basic service activity.</p></section>
    <section><h2>2. How information is used</h2><p>Information is used for account access, marketplace and messaging functions, safety moderation, abuse prevention, support, and service reliability. We limit collection and use to reasonable platform purposes.</p></section>
    <section><h2>3. Storage and service providers</h2><p>Data is stored using Firebase and Google Cloud services. No internet service is risk-free, but reasonable technical and access safeguards are used to protect account information.</p></section>
    <section><h2>4. No sale of personal data</h2><p>We do not sell or rent personal information. Data may be disclosed when required by law, to investigate abuse, or to service providers operating the platform under appropriate restrictions.</p></section>
    <section><h2>5. Your choices</h2><p>You may update profile information in the app. To request access, correction, or account deletion, contact support@mystudentbulletin.ca. We may retain limited records where legally required or necessary for safety and fraud prevention.</p></section>
  </LegalLayout>
}
