export type LegalPageType = 'privacy' | 'terms' | 'contact';

type LegalPagesProps = {
  page: LegalPageType;
  onBack: () => void;
};

const UPDATED_AT = 'May 11, 2026';

export function LegalPages({ page, onBack }: LegalPagesProps) {
  const title = page === 'privacy' ? 'Privacy Policy' : page === 'terms' ? 'Terms & Fair Play' : 'Contact & Support';

  return (
    <div className="legal-fullscreen">
      <main className="legal-container">
        <button className="btn-link legal-back" onClick={onBack}>&larr; Back</button>
        <section className="legal-panel">
          <p className="legal-updated">Last updated: {UPDATED_AT}</p>
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
  return (
    <div className="legal-copy">
      <p>
        Cyprus is an online Tichu game. We collect only the information needed to run accounts,
        games, matchmaking, support, security, and basic game statistics.
      </p>

      <h2>Information We Collect</h2>
      <ul>
        <li>Account details such as username, display name, email address, password login method, avatar, language, and friends.</li>
        <li>Game information such as room codes, game events, scores, bot reports, rankings, and leaderboard stats.</li>
        <li>Connection and security information such as IP address, user agent, socket connection records, request logs, and timestamps.</li>
        <li>Session tokens stored in secure cookies for signed-in users and local browser storage for reconnecting to active games.</li>
      </ul>

      <h2>How We Use It</h2>
      <ul>
        <li>To create accounts, keep players signed in, reconnect games, and support guest play.</li>
        <li>To run multiplayer rooms, matchmaking, friends, invitations, spectating, scoring, and leaderboards.</li>
        <li>To prevent abuse, debug issues, investigate bot reports, and keep the service reliable.</li>
      </ul>

      <h2>Account Deletion</h2>
      <p>
        Deleting your account removes your login, profile, friends, and account settings. Some game records,
        scores, reports, security logs, and anti-abuse records may be retained so games stay fair and the
        service can be protected.
      </p>

      <h2>Third Parties</h2>
      <p>
        Google Sign-In may be used if enabled. Password reset emails may be sent through an email provider.
        We do not sell player data.
      </p>
    </div>
  );
}

function TermsAndFairPlay() {
  return (
    <div className="legal-copy">
      <p>
        By using Cyprus, you agree to play fairly, respect other players, and avoid behavior that damages
        the game or service.
      </p>

      <h2>Fair Play</h2>
      <ul>
        <li>Do not cheat, coordinate through spectator information, exploit bugs, automate play, or abuse matchmaking.</li>
        <li>Do not harass players or use offensive names, messages, or profile information.</li>
        <li>Report suspicious bot or game behavior through the in-game report tools when available.</li>
      </ul>

      <h2>Accounts</h2>
      <ul>
        <li>You are responsible for keeping your account secure.</li>
        <li>We may remove accounts, names, stats, rooms, or access if needed for safety, abuse prevention, or service integrity.</li>
      </ul>

      <h2>Service Availability</h2>
      <p>
        Cyprus is provided as-is. Games may be interrupted by updates, bugs, network issues, or maintenance.
        We try to preserve active games where possible, but cannot guarantee uninterrupted play.
      </p>
    </div>
  );
}

function ContactSupport() {
  return (
    <div className="legal-copy">
      <p>
        For support, account questions, data requests, bug reports, or fair-play concerns, contact the project
        through the GitHub repository.
      </p>

      <p>
        <a href="https://github.com/Dremix10/cyprus" target="_blank" rel="noreferrer">
          github.com/Dremix10/cyprus
        </a>
      </p>

      <h2>What To Include</h2>
      <ul>
        <li>Your username or display name.</li>
        <li>The room code or approximate time of the issue, if it happened during a game.</li>
        <li>A short description of what happened and what you expected.</li>
      </ul>

      <p>
        For account deletion, you can also use the delete account option in your profile.
      </p>
    </div>
  );
}
