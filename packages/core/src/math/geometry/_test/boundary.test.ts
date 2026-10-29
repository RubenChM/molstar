/**
 * Copyright (c) 2026 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Rubén Chaves <ruben.chaves@irbbarcelona.org>
 */

import { describe, expect, it } from 'vitest';
import { OrderedSet } from '@molstar/core/data/int/ordered-set';
import { Vec3 } from '../../linear-algebra/3d/vec3.js';
import { getBoundary } from '../boundary.js';
import { BoundaryHelper } from '../boundary-helper.js';
import type { PositionData } from '../common.js';

/** `count` positions in an elongated blob, with radii from 1 to 2, from a fixed seed */
function createPositionData(count: number): PositionData {
  let seed = 1;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const z = new Float32Array(count);
  const radius = new Float32Array(count);
  for (let i = 0; i < count; ++i) {
    x[i] = (random() - 0.5) * 60;
    y[i] = (random() - 0.5) * 30 + x[i] * 0.3;
    z[i] = (random() - 0.5) * 20;
    radius[i] = 1 + random();
  }
  return { x, y, z, radius, indices: OrderedSet.ofBounds(0, count) };
}

function fitSphere(data: PositionData, quality: '14' | '98') {
  const { x, y, z, radius, indices } = data;
  const helper = new BoundaryHelper(quality);
  const p = Vec3();
  for (let i = 0, il = OrderedSet.size(indices); i < il; ++i) {
    helper.includePositionRadius(Vec3.set(p, x[i], y[i], z[i]), radius![i]);
  }
  helper.finishedIncludeStep();
  for (let i = 0, il = OrderedSet.size(indices); i < il; ++i) {
    helper.radiusPositionRadius(Vec3.set(p, x[i], y[i], z[i]), radius![i]);
  }
  return helper.getSphere();
}

describe('getBoundary', () => {
  it('fits the sphere along 98 directions up to 10,000 positions, along 14 with coarse', () => {
    const data = createPositionData(2000);
    const fine = getBoundary(data);
    const coarse = getBoundary(data, true);

    expect(fine.sphere).toEqual(fitSphere(data, '98'));
    expect(coarse.sphere).toEqual(fitSphere(data, '14'));
    expect(coarse.sphere).not.toEqual(fine.sphere);
    expect(coarse.box).toEqual(fine.box);
  });

  it('encloses every position and its radius with either fit', () => {
    const data = createPositionData(2000);
    const { x, y, z, radius } = data;
    const p = Vec3();
    for (const { sphere } of [getBoundary(data), getBoundary(data, true)]) {
      for (let i = 0; i < 2000; ++i) {
        const d = Vec3.distance(sphere.center, Vec3.set(p, x[i], y[i], z[i])) + radius![i];
        expect(d).toBeLessThanOrEqual(sphere.radius + 1e-4);
      }
    }
  });

  it('fits along 14 directions above 10,000 positions, with or without coarse', () => {
    const data = createPositionData(12_000);
    expect(getBoundary(data, true)).toEqual(getBoundary(data));
    expect(getBoundary(data).sphere).toEqual(fitSphere(data, '14'));
  });
});
