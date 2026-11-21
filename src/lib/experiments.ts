export const experimentStageIds = ['researching', 'concept', 'prototype', 'in-development'] as const;

export const experimentStages = {
  researching: { label: 'Researching', description: 'Exploring the problem, asking questions, and looking at possible approaches.' },
  concept: { label: 'Concept', description: 'An idea taking shape through sketches, notes, or a proposed experience.' },
  prototype: { label: 'Prototype', description: 'Something built to test an idea and find out what works.' },
  'in-development': { label: 'In development', description: 'A working version taking shape, with more to build and learn.' },
} as const;
