import { CommentStripper, keywordOf } from './lexer.js';

/**
 * `rawPassthrough` without the uninterpreted statements of one keyword (e.g. an unreadable `size`
 * line once the map writes a valid one). Lines are judged by their code outside comments, so text
 * inside a block comment that merely starts with the keyword stays. A dropped statement keeps its
 * own comment fragments, so an opened block comment still closes where it did.
 */
export function withoutRawStatements(
  rawPassthrough: readonly string[] | undefined,
  keyword: string,
): readonly string[] | undefined {
  if (!rawPassthrough) return rawPassthrough;
  const wanted = keyword.toLowerCase();
  const comments = new CommentStripper();
  let changed = false;
  const kept: string[] = [];
  for (const raw of rawPassthrough) {
    const stripped = comments.strip(raw);
    if (keywordOf(stripped.code) !== wanted) {
      kept.push(raw);
      continue;
    }
    changed = true;
    if (stripped.comments.length) kept.push(stripped.comments.join(' '));
  }
  if (!changed) return rawPassthrough;
  return kept.length ? kept : undefined;
}
