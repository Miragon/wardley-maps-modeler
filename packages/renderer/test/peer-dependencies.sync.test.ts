import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { satisfies, valid } from 'semver';

/**
 * Inside the monorepo npm resolves a workspace's peers from the workspace's own folder, where its
 * exact devDependency mirror sits, and `pin-check` skips `peerDependencies`. So install, build and
 * tests stay green when a peer range rejects the version the repo pins, and only a consumer that
 * pins that version, as the apps do, hits ERESOLVE on the published package (#151).
 */

interface Manifest {
  name: string;
  workspaces?: string[];
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

const repositoryRoot = new URL('../../../', import.meta.url);

function readManifest(directory: string): Manifest {
  const path = new URL(`${directory}/package.json`, repositoryRoot);
  return JSON.parse(readFileSync(path, 'utf8')) as Manifest;
}

const workspaces = (readManifest('.').workspaces ?? []).map(readManifest);
const workspacesByName = new Map(workspaces.map((manifest) => [manifest.name, manifest]));

function peersOf(manifest: Manifest): Array<[string, string]> {
  return Object.entries(manifest.peerDependencies ?? {});
}

function workspaceDependenciesOf(manifest: Manifest): Manifest[] {
  return Object.keys({ ...manifest.devDependencies, ...manifest.dependencies })
    .map((name) => workspacesByName.get(name))
    .filter((dependency): dependency is Manifest => dependency !== undefined);
}

function mirrorViolations(manifest: Manifest): string[] {
  return peersOf(manifest).flatMap(([peer, range]) => {
    const mirror = manifest.devDependencies?.[peer];
    if (mirror === undefined) return [`${peer}: no devDependency mirrors the peer ${range}`];
    if (valid(mirror) === null) return [`${peer}: the devDependency ${mirror} is not exact`];
    if (satisfies(mirror, range)) return [];
    return [`${peer}: the devDependency ${mirror} is outside the peer range ${range}`];
  });
}

function hostViolations(host: Manifest): string[] {
  return workspaceDependenciesOf(host).flatMap((dependency) =>
    peersOf(dependency).flatMap(([peer, range]) => {
      const installed = host.dependencies?.[peer] ?? host.devDependencies?.[peer];
      if (installed === undefined) {
        return [`${peer}: ${dependency.name} needs the peer ${range}, which is not installed`];
      }
      if (satisfies(installed, range)) return [];
      return [`${peer}: ${installed} is outside the peer range ${range} of ${dependency.name}`];
    }),
  );
}

const packagesWithPeers = workspaces.filter((manifest) => peersOf(manifest).length > 0);
const hostsOfPeers = workspaces.filter((manifest) =>
  workspaceDependenciesOf(manifest).some((dependency) => peersOf(dependency).length > 0),
);

describe('peer dependency ranges', () => {
  it.each(packagesWithPeers)(
    '$name accepts the exact devDependency it builds and tests each peer with',
    (manifest) => {
      expect(mirrorViolations(manifest)).toEqual([]);
    },
  );

  it.each(hostsOfPeers)(
    '$name installs a version of each peer that its workspace dependencies accept',
    (manifest) => {
      expect(hostViolations(manifest)).toEqual([]);
    },
  );
});
