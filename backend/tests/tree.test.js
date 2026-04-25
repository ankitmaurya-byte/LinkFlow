import { describe, it, expect } from 'vitest';
import { wouldCreateCycle } from '../src/services/tree.js';

function fakeNode(id, parentId) { return { _id: id, parentId }; }

describe('tree.wouldCreateCycle', () => {
  it('returns false when no cycle', () => {
    const nodes = [fakeNode('a', null), fakeNode('b', 'a'), fakeNode('c', 'b')];
    const findParent = (id) => nodes.find(n => n._id === id);
    expect(wouldCreateCycle('c', 'a', findParent)).toBe(false);
  });

  it('returns true when target is descendant', () => {
    const nodes = [fakeNode('a', null), fakeNode('b', 'a'), fakeNode('c', 'b')];
    const findParent = (id) => nodes.find(n => n._id === id);
    expect(wouldCreateCycle('a', 'c', findParent)).toBe(true);
  });

  it('returns true when target equals self', () => {
    const findParent = () => null;
    expect(wouldCreateCycle('a', 'a', findParent)).toBe(true);
  });
});
