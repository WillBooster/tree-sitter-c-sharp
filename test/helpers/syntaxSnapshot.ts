import { Edit, type Node, type Tree } from '@willbooster/web-tree-sitter';

export function syntaxSnapshot(node: Node): unknown {
  return [
    node.type,
    node.isNamed,
    node.isMissing,
    node.startIndex,
    node.endIndex,
    node.startPosition,
    node.endPosition,
    node.children.map((_, index) => node.fieldNameForChild(index)),
    node.children.map(syntaxSnapshot),
  ];
}

export function editTree(tree: Tree, previous: string, next: string): void {
  let start = 0;
  while (start < Math.min(previous.length, next.length) && previous[start] === next[start]) start++;
  let oldEnd = previous.length;
  let newEnd = next.length;
  while (oldEnd > start && newEnd > start && previous[oldEnd - 1] === next[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }
  tree.edit(
    new Edit({
      startIndex: start,
      oldEndIndex: oldEnd,
      newEndIndex: newEnd,
      startPosition: pointAt(previous, start),
      oldEndPosition: pointAt(previous, oldEnd),
      newEndPosition: pointAt(next, newEnd),
    })
  );
}

function pointAt(source: string, index: number): { row: number; column: number } {
  const prefix = source.slice(0, index);
  return { row: prefix.split('\n').length - 1, column: index - prefix.lastIndexOf('\n') - 1 };
}
