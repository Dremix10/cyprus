import type { TrackerDB } from './Database.js';
import type { GameMonitor } from './GameMonitor.js';

const AUDIT_INTERVAL_MS = 30 * 60_000; // Every 30 minutes
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

/**
 * Server-side automated auditor. Runs inside the server process.
 * Every 30 minutes: checks for errors, stuck games, high disconnect rates.
 * Sends Telegram alerts for WARNING/CRITICAL status.
 * Stores audit history in server_logs for review.
 */
export class ServerAuditor {
  private interval: ReturnType<typeof setInterval>;
  private lastStatus: string = 'OK';
  private getConnectionCount: () => number;

  constructor(
    private db: TrackerDB,
    private monitor: GameMonitor,
    connectionCountFn: () => number
  ) {
    this.getConnectionCount = connectionCountFn;
    this.interval = setInterval(() => this.runAudit(), AUDIT_INTERVAL_MS);
    this.interval.unref();

    if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
      console.log('Telegram alerts configured');
    } else {
      console.log('Telegram alerts not configured — set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to enable');
    }
  }

  destroy(): void {
    clearInterval(this.interval);
  }

  async runAudit(): Promise<void> {
    try {
      const report = this.buildReport();

      // Log the audit
      this.db.writeLog(
        report.status === 'OK' ? 'info' : report.status === 'WARNING' ? 'warn' : 'error',
        'audit',
        `Audit: ${report.status}`,
        undefined,
        undefined,
        report
      );

      // Alert on status changes or CRITICAL
      if (report.status !== 'OK' && (report.status !== this.lastStatus || report.status === 'CRITICAL')) {
        await this.sendAlert(report);
      }

      // Log recovery
      if (this.lastStatus !== 'OK' && report.status === 'OK') {
        await this.sendAlert({ ...report, status: 'RECOVERED' });
      }

      this.lastStatus = report.status;
    } catch (err) {
      console.error('Audit error:', err);
    }
  }

  private buildReport(): {
    status: string;
    connections: number;
    gamesInProgress: number;
    errorsLast30m: number;
    botErrorsLast30m: number;
    disconnectsLast30m: number;
    stuckGames: number;
    issues: string[];
  } {
    const connections = this.getConnectionCount();
    const stats = this.db.getStats();

    // Errors in last 30 minutes
    const recentErrors = this.db.getServerLogs({ level: 'error', limit: 100 });
    const errorsLast30m = (recentErrors as Array<{ created_at: string }>).filter(l => {
      return Date.now() - new Date(l.created_at + 'Z').getTime() < 30 * 60_000;
    }).length;

    // Bot errors
    const botErrors = this.db.getServerLogs({ category: 'bot', limit: 50 });
    const botErrorsLast30m = (botErrors as Array<{ created_at: string }>).filter(l => {
      return Date.now() - new Date(l.created_at + 'Z').getTime() < 30 * 60_000;
    }).length;

    // Disconnects
    const disconnects = this.db.getServerLogs({ category: 'connection', level: 'warn', limit: 100 });
    const disconnectsLast30m = (disconnects as Array<{ created_at: string }>).filter(l => {
      return Date.now() - new Date(l.created_at + 'Z').getTime() < 30 * 60_000;
    }).length;

    // Stuck games
    const stuckGames = this.db.runReadOnlyQuery(
      `SELECT COUNT(*) as c FROM games WHERE ended_at IS NULL AND started_at < datetime('now', '-2 hours')`,
      1
    );
    const stuckCount = stuckGames.rows[0]?.[0] as number || 0;

    // Determine status
    let status = 'OK';
    const issues: string[] = [];

    if (errorsLast30m > 10) { status = 'CRITICAL'; issues.push(`${errorsLast30m} errors in 30min`); }
    else if (errorsLast30m > 3) { status = 'WARNING'; issues.push(`${errorsLast30m} errors in 30min`); }

    if (botErrorsLast30m > 5) { status = 'WARNING'; issues.push(`${botErrorsLast30m} bot errors`); }

    if (disconnectsLast30m > 10) {
      status = status === 'CRITICAL' ? 'CRITICAL' : 'WARNING';
      issues.push(`${disconnectsLast30m} disconnects in 30min`);
    }

    if (stuckCount > 5) { issues.push(`${stuckCount} stuck games`); }

    return {
      status,
      connections,
      gamesInProgress: stats.gamesInProgress,
      errorsLast30m,
      botErrorsLast30m,
      disconnectsLast30m,
      stuckGames: stuckCount,
      issues,
    };
  }

  private async sendAlert(report: { status: string; connections: number; issues: string[]; errorsLast30m: number; disconnectsLast30m: number; botErrorsLast30m: number; stuckGames: number }): Promise<void> {
    const emoji = report.status === 'CRITICAL' ? '🚨' : report.status === 'WARNING' ? '⚠️' : report.status === 'RECOVERED' ? '✅' : 'ℹ️';
    const message = [
      `${emoji} *Aegist ${report.status}*`,
      ``,
      `Connections: ${report.connections}`,
      `Errors (30m): ${report.errorsLast30m}`,
      `Bot errors: ${report.botErrorsLast30m}`,
      `Disconnects: ${report.disconnectsLast30m}`,
      `Stuck games: ${report.stuckGames}`,
      report.issues.length > 0 ? `\nIssues:\n${report.issues.map(i => `• ${i}`).join('\n')}` : '',
    ].join('\n');

    // Telegram alert
    if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
      try {
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: 'Markdown',
          }),
        });
      } catch (err) {
        console.error('Telegram alert failed:', err);
      }
    }

    // Always log to console
    console.log(`[AUDIT] ${report.status}: ${report.issues.join(', ') || 'All clear'}`);
  }
}
