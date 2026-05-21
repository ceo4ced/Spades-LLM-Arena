import { overview } from './overview';
import { engine } from './engine';
import { agents } from './agents';
import { hooks } from './hooks';
import { spacetime } from './spacetime';
import { ui } from './ui';
import { streaming } from './streaming';
import type { DocCategory, DocTopic } from './types';

export type { DocCategory, DocTopic } from './types';

export const CATEGORIES: DocCategory[] = [
  overview,
  engine,
  agents,
  hooks,
  spacetime,
  ui,
  streaming,
];

/** Flat list of every topic, useful for search. */
export const ALL_TOPICS: { category: DocCategory; topic: DocTopic }[] = CATEGORIES
  .flatMap((category) => category.topics.map((topic) => ({ category, topic })));
