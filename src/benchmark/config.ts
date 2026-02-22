export interface BenchmarkConfig {
  game: {
    target_score: number;
    enable_blind_nil: boolean;
    blind_nil_threshold: number;
  };
  agents: {
    team1: {
      player0: AgentConfig;
      player2: AgentConfig;
    };
    team2: {
      player1: AgentConfig;
      player3: AgentConfig;
    };
  };
  benchmark: {
    num_games: number;
    seat_rotation_interval: number;
    random_seed: number;
    log_reasoning: boolean;
    log_directory: string;
    parallel_games: number;
  };
  metrics: {
    primary: string[];
    advanced: string[];
    export_format: string;
  };
}

export interface AgentConfig {
  type: 'llm' | 'random' | 'heuristic';
  model?: string;
  temperature?: number;
  max_retries?: number;
}

export const defaultConfig: BenchmarkConfig = {
  game: {
    target_score: 500,
    enable_blind_nil: true,
    blind_nil_threshold: 100,
  },
  agents: {
    team1: {
      player0: { type: 'heuristic' },
      player2: { type: 'heuristic' },
    },
    team2: {
      player1: { type: 'random' },
      player3: { type: 'random' },
    },
  },
  benchmark: {
    num_games: 10,
    seat_rotation_interval: 25,
    random_seed: 42,
    log_reasoning: true,
    log_directory: './logs',
    parallel_games: 1,
  },
  metrics: {
    primary: ['win_rate', 'avg_score_margin', 'bid_accuracy'],
    advanced: ['nil_success_rate', 'bag_efficiency', 'set_rate', 'error_rate'],
    export_format: 'csv',
  },
};
