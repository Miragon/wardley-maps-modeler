import { describe, it, expect } from 'vitest';
import type { ConnectionLike } from 'diagram-js/lib/model/Types';
import WardleyLayouter from '../src/layout/WardleyLayouter.js';

const platform = {
  id: 'platform',
  wardleyType: 'component',
  evolution: 0.5,
  visibility: 0.5,
  x: 100,
  y: 200,
  width: 34,
  height: 34,
};
const hosting = {
  id: 'hosting',
  wardleyType: 'pipeline',
  evolution: 0.5,
  visibility: 0.4,
  x: 300,
  y: 400,
  width: 200,
  height: 30,
};

function connection(source: object, target: object): ConnectionLike {
  return { id: 'dep', wardleyType: 'dependency', waypoints: [], source, target };
}

describe('WardleyLayouter', () => {
  const layouter = new WardleyLayouter();

  it('docks at the component center and at the pipeline ■ anchor (top-edge center)', () => {
    expect(layouter.layoutConnection(connection(platform, hosting))).toEqual([
      { x: 117, y: 217 },
      { x: 400, y: 400 },
    ]);
  });

  // diagram-js hands in the box mid on move/resize and the drag's release point on connect — the
  // renderer ignores both, so the waypoints (= the hit band) must too.
  it('ignores the start/end hints when the endpoint node is known', () => {
    const waypoints = layouter.layoutConnection(connection(platform, hosting), {
      connectionStart: { x: 105, y: 230 },
      connectionEnd: { x: 480, y: 425 },
    });
    expect(waypoints).toEqual([
      { x: 117, y: 217 },
      { x: 400, y: 400 },
    ]);
  });

  it('follows the cursor hint for a preview without a target', () => {
    const preview = { id: 'preview', wardleyType: 'dependency', waypoints: [] };
    expect(
      layouter.layoutConnection(preview, { source: platform, connectionEnd: { x: 50, y: 60 } }),
    ).toEqual([
      { x: 117, y: 217 },
      { x: 50, y: 60 },
    ]);
  });
});
