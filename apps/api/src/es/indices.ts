/** All game state lives in Elasticsearch. There is no other database. */
export const IDX = {
  booths: 'booths',
  checkins: 'checkins',
  players: 'players',
  game: 'game',
} as const;

export const GAME_DOC_ID = 'current';
