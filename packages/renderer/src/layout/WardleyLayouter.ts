import BaseLayouter, { type LayoutConnectionHints } from 'diagram-js/lib/layout/BaseLayouter';
import type { ConnectionLike } from 'diagram-js/lib/model/Types';
import type { Point } from 'diagram-js/lib/util/Types';
import { isPipeline } from '../model/di-types.js';

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Docking point of a node: pipelines dock at their ■ anchor (top-edge center), not the box. */
export function connectionAnchorOf(shape: Bounds): Point {
  if (isPipeline(shape)) return { x: shape.x + shape.width / 2, y: shape.y };
  return { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 };
}

/**
 * The renderer draws every connection from docking point to docking point, ignoring its waypoints —
 * but diagram-js builds the connection's hit band from the waypoints. So they must always span the
 * same docking points, not diagram-js's hints (box mid, or the point where a connect drag ended).
 * The hints only count for an endpoint without a node (connection preview following the cursor).
 */
export default class WardleyLayouter extends BaseLayouter {
  override layoutConnection(
    connection: ConnectionLike,
    hints: LayoutConnectionHints = {},
  ): Point[] {
    const source = hints.source ?? connection['source'];
    const target = hints.target ?? connection['target'];
    return super.layoutConnection(connection, {
      ...hints,
      ...(source ? { connectionStart: connectionAnchorOf(source) } : {}),
      ...(target ? { connectionEnd: connectionAnchorOf(target) } : {}),
    });
  }
}
