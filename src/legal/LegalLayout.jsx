export default function LegalLayout({ eyebrow, title, children, onBack }) {
  return (
    <main className="legal-page">
      <button className="legal-brand-back" onClick={onBack}><img src="/mystudentbulletin-brand.png" alt="MyStudentBulletin" /><span>← BACK</span></button>
      <article>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="legal-updated">Last updated: July 2, 2026</p>
        {children}
        <p className="legal-contact">Questions or requests: <a href="mailto:support@mystudentbulletin.ca">support@mystudentbulletin.ca</a></p>
      </article>
    </main>
  )
}
