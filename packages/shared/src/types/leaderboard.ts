export type LeaderboardEntry = {
  user_id: number;
  username: string;
  display_name: string;
  games_played: number;
  games_won: number;
  games_lost: number;
  first_out_count: number;
  tichu_calls: number;
  tichu_successes: number;
  grand_tichu_calls: number;
  grand_tichu_successes: number;
  double_victories: number;
  total_rounds: number;
  disconnects: number;
  rating: number;
  elo: number;
  elo_peak: number;
  elo_games: number;
  is_bot?: number;
};

export type MyLeaderboardStats = LeaderboardEntry & {
  rank: number;
};
