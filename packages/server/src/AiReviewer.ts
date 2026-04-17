import { spawn } from 'node:child_process';
import type { TrackerDB } from './Database.js';

const CHECK_INTERVAL_MS = 2 * 60_000; // Check every 2 minutes
const IDLE_THRESHOLD_MS = 10 * 60_000; // 10 minutes of no activity
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

/**
 * AI Game Reviewer — spawns Claude Code CLI to analyze completed games.
 * Only runs during idle periods (no active connections for 10+ minutes).
 * Processes one game at a time from the review queue.
 */
export class AiReviewer {
  private interval: ReturnType<typeof setInterval>;
  private running = false;
  private lastActivityAt = Date.now();
  private getConnectionCount: () => number;

  constructor(
    private db: TrackerDB,
    connectionCountFn: () => number
  ) {
    this.getConnectionCount = connectionCountFn;
    this.interval = setInterval(() => this.tick(), CHECK_INTERVAL_MS);
    this.interval.unref();
    console.log('AI Reviewer initialized — will analyze games during idle periods');
  }

  destroy(): void {
    clearInterval(this.interval);
  }

  /** Called whenever there's player activity (game action, connection, etc.) */
  recordActivity(): void {
    this.lastActivityAt = Date.now();
  }

  private isIdle(): boolean {
    const connections = this.getConnectionCount();
    const timeSinceActivity = Date.now() - this.lastActivityAt;
    return connections === 0 && timeSinceActivity > IDLE_THRESHOLD_MS;
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    if (!this.isIdle()) return;

    const item = this.db.getNextReviewItem();
    if (!item) return;

    this.running = true;
    console.log(`[AI Review] Starting review of game #${item.game_id} (room ${item.room_code})`);

    try {
      await this.reviewGame(item);
      this.db.markReviewProcessed(item.id);
      console.log(`[AI Review] Completed review of game #${item.game_id}`);
    } catch (err) {
      console.error(`[AI Review] Failed to review game #${item.game_id}:`, err);
      // Mark as processed to avoid infinite retries
      this.db.markReviewProcessed(item.id);
    } finally {
      this.running = false;
    }
  }

  private async reviewGame(item: { id: number; game_id: number; room_code: string }): Promise<void> {
    const data = this.db.getGameReviewData(item.game_id);

    if (!data.game) {
      this.db.saveAiReview(item.game_id, item.room_code, 'skip', 'Game not found in database', '[]');
      return;
    }

    const prompt = this.buildPrompt(item.game_id, item.room_code, data);

    // Spawn Claude Code CLI (async — does not block event loop)
    let output: string;
    try {
      output = await new Promise<string>((resolve, reject) => {
        const proc = spawn('claude', ['-p', prompt, '--output-format', 'json', '--max-turns', '1'], {
          cwd: '/home/dev/cyprus',
          env: { ...process.env, HOME: '/home/dev' },
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (d) => { stdout += d; });
        proc.stderr.on('data', (d) => { stderr += d; });
        proc.on('close', (code) => {
          if (code === 0) resolve(stdout);
          else reject(new Error(`Exit code ${code}: ${stderr.slice(0, 200)}`));
        });
        proc.on('error', reject);
        // Kill if takes too long
        setTimeout(() => { try { proc.kill(); } catch {} reject(new Error('Timeout')); }, 120_000);
      });
    } catch (err: any) {
      this.db.saveAiReview(
        item.game_id, item.room_code, 'error',
        `Claude CLI failed: ${err.message?.slice(0, 200)}`,
        '[]'
      );
      return;
    }

    // Parse Claude's response
    const { status, summary, findings } = this.parseResponse(output);

    this.db.saveAiReview(item.game_id, item.room_code, status, summary, JSON.stringify(findings));

    // Telegram alert for bugs
    if (status === 'bug' || status === 'critical') {
      await this.sendTelegramAlert(item.game_id, item.room_code, status, summary);
    }
  }

  private buildPrompt(gameId: number, roomCode: string, data: ReturnType<TrackerDB['getGameReviewData']>): string {
    const game = data.game as any;
    const eventCount = data.events.length;
    const errorCount = data.errors.length;

    // Trim events if too many (keep first 50 + last 50)
    let events = data.events as any[];
    if (events.length > 100) {
      events = [...events.slice(0, 50), { event_type: '... truncated ...', data: `${events.length - 100} events omitted` }, ...events.slice(-50)];
    }

    return `You are a Tichu card game QA analyst. Review this completed game for bugs, rule violations, and anomalies.

GAME #${gameId} — Room ${roomCode}
Started: ${game.started_at}
Ended: ${game.ended_at || 'NOT ENDED (abandoned?)'}
Final Score: Team 0-2: ${game.final_score_02 ?? '?'} — Team 1-3: ${game.final_score_13 ?? '?'}
Winner: ${game.winner_team || 'Unknown'}
Rounds: ${game.rounds_played || '?'}
Solo: ${game.is_solo ? 'Yes' : 'No'}
Bot Difficulty: ${game.bot_difficulty || 'N/A'}

PLAYERS:
${(data.players as any[]).map((p: any) => `  P${p.position}: ${p.nickname}${p.is_bot ? ' (BOT)' : ''}${p.user_id ? ` [user:${p.user_id}]` : ''}`).join('\n')}

GAME EVENTS (${eventCount} total):
${events.map((e: any) => `  [${e.created_at}] ${e.event_type} P${e.player_position ?? '-'} ${e.data ? JSON.stringify(JSON.parse(e.data)).slice(0, 150) : ''}`).join('\n')}

${errorCount > 0 ? `ERRORS/WARNINGS DURING GAME (${errorCount}):
${(data.errors as any[]).map((e: any) => `  [${e.created_at}] ${e.level} ${e.category}: ${e.message} ${e.data ? JSON.stringify(JSON.parse(e.data)).slice(0, 100) : ''}`).join('\n')}` : 'NO ERRORS DURING GAME'}

Analyze for:
1. Rule violations (impossible plays, wrong turn order, scoring errors)
2. Bugs (errors, crashes, stuck states, missing events)
3. Game anomalies (abnormally fast/slow, suspicious patterns)
4. Disconnect issues (player replaced by bot, reconnect failures)
5. Performance concerns (if any timing data available)

Respond in EXACTLY this JSON format (no markdown, no explanation, just JSON):
{"status":"clean|issue|bug|critical","summary":"one sentence summary","findings":[{"severity":"low|medium|high|critical","category":"rule|bug|anomaly|disconnect|performance","description":"what happened","evidence":"specific event/data that shows it"}]}

If the game looks normal, respond: {"status":"clean","summary":"Game completed normally, no issues found.","findings":[]}`;
  }

  private parseResponse(output: string): { status: string; summary: string; findings: unknown[] } {
    try {
      // Claude CLI with --output-format json wraps the response
      const parsed = JSON.parse(output);
      const text = parsed.result || parsed.content || output;

      // Extract JSON from the response
      const jsonMatch = (typeof text === 'string' ? text : JSON.stringify(text)).match(/\{[\s\S]*"status"[\s\S]*"findings"[\s\S]*\}/);
      if (jsonMatch) {
        const review = JSON.parse(jsonMatch[0]);
        return {
          status: review.status || 'unknown',
          summary: review.summary || 'No summary',
          findings: review.findings || [],
        };
      }
    } catch { /* parse error */ }

    return { status: 'error', summary: 'Failed to parse AI response', findings: [] };
  }

  private async sendTelegramAlert(gameId: number, roomCode: string, status: string, summary: string): Promise<void> {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

    const emoji = status === 'critical' ? '🚨' : '🐛';
    const message = `${emoji} *AI Review: Game #${gameId}* (${roomCode})\n\n${summary}\n\nRun: \`check ai reviews\``;

    try {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'Markdown' }),
      });
    } catch { /* ignore telegram failures */ }
  }
}
