import { useT } from '../i18n.js';

export type LegalPageType = 'privacy' | 'terms' | 'contact';

type LegalPagesProps = {
  page: LegalPageType;
  onBack: () => void;
};

export function LegalPages({ page, onBack }: LegalPagesProps) {
  const t = useT();
  const title = page === 'privacy' ? t('legal.privacy.title') : page === 'terms' ? t('legal.terms.title') : t('legal.contact.title');

  return (
    <div className="legal-fullscreen">
      <main className="legal-container">
        <button className="btn-link legal-back" onClick={onBack}>&larr; {t('legal.back')}</button>
        <section className="legal-panel">
          <p className="legal-updated">{t('legal.updated')}</p>
          <h1 className="legal-title">{title}</h1>
          {page === 'privacy' && <PrivacyPolicy />}
          {page === 'terms' && <TermsAndFairPlay />}
          {page === 'contact' && <ContactSupport />}
        </section>
      </main>
    </div>
  );
}

function PrivacyPolicy() {
  const t = useT();
  return (
    <div className="legal-copy">
      <p>{t('legal.privacy.intro')}</p>

      <h2>{t('legal.privacy.collectTitle')}</h2>
      <ul>
        <li>{t('legal.privacy.collect.0')}</li>
        <li>{t('legal.privacy.collect.1')}</li>
        <li>{t('legal.privacy.collect.2')}</li>
        <li>{t('legal.privacy.collect.3')}</li>
      </ul>

      <h2>{t('legal.privacy.useTitle')}</h2>
      <ul>
        <li>{t('legal.privacy.use.0')}</li>
        <li>{t('legal.privacy.use.1')}</li>
        <li>{t('legal.privacy.use.2')}</li>
      </ul>

      <h2>{t('legal.privacy.deletionTitle')}</h2>
      <p>{t('legal.privacy.deletion')}</p>

      <h2>{t('legal.privacy.thirdTitle')}</h2>
      <p>{t('legal.privacy.third')}</p>
    </div>
  );
}

function TermsAndFairPlay() {
  const t = useT();
  return (
    <div className="legal-copy">
      <p>{t('legal.terms.intro')}</p>

      <h2>{t('legal.terms.fairTitle')}</h2>
      <ul>
        <li>{t('legal.terms.fair.0')}</li>
        <li>{t('legal.terms.fair.1')}</li>
        <li>{t('legal.terms.fair.2')}</li>
      </ul>

      <h2>{t('legal.terms.accountsTitle')}</h2>
      <ul>
        <li>{t('legal.terms.accounts.0')}</li>
        <li>{t('legal.terms.accounts.1')}</li>
      </ul>

      <h2>{t('legal.terms.serviceTitle')}</h2>
      <p>{t('legal.terms.service')}</p>
    </div>
  );
}

function ContactSupport() {
  const t = useT();
  return (
    <div className="legal-copy">
      <p>{t('legal.contact.intro')}</p>

      <p>
        <a href="https://github.com/Dremix10/cyprus" target="_blank" rel="noreferrer">
          github.com/Dremix10/cyprus
        </a>
      </p>

      <h2>{t('legal.contact.includeTitle')}</h2>
      <ul>
        <li>{t('legal.contact.include.0')}</li>
        <li>{t('legal.contact.include.1')}</li>
        <li>{t('legal.contact.include.2')}</li>
      </ul>

      <p>{t('legal.contact.deletion')}</p>
    </div>
  );
}
