import { describe, expect, it } from 'vitest';
import { summariseEdit } from './editSummary';

const d = (changed = 0, added = 0, removed = 0) => ({ unchanged: 5, changed, added, removed });

describe('summariseEdit', () => {
  it('matches the spec wording for changed lines', () => {
    expect(summariseEdit(d(2))).toBe('Lyrics updated · 2 changed lines reset to unlearned');
    expect(summariseEdit(d(1))).toBe('Lyrics updated · 1 changed line reset to unlearned');
  });
  it('reports additions and removals', () => {
    expect(summariseEdit(d(0, 1, 3))).toBe('Lyrics updated · 1 line added, 3 lines removed');
    expect(summariseEdit(d(1, 2, 0))).toBe(
      'Lyrics updated · 1 changed line reset to unlearned, 2 lines added',
    );
  });
  it('says so when nothing changed', () => {
    expect(summariseEdit(d())).toBe('Lyrics updated · no line changes');
  });
});
