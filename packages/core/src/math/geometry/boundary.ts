/**
 * Copyright (c) 2018-2026 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author David Sehnal <david.sehnal@gmail.com>
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 * @author Rubén Chaves <ruben.chaves@irbbarcelona.org>
 */

import type { PositionData } from './common.js';
import { Vec3 } from '../linear-algebra.js';
import { OrderedSet } from '@molstar/core/data/int/ordered-set';
import { BoundaryHelper } from './boundary-helper.js';
import { Box3D } from './primitives/box3d.js';
import { Sphere3D } from './primitives/sphere3d.js';

export type Boundary = { readonly box: Box3D; readonly sphere: Sphere3D };

// avoiding namespace lookup improved performance in Chrome (Aug 2020)
const v3set = Vec3.set;

const boundaryHelperCoarse = new BoundaryHelper('14');
const boundaryHelperFine = new BoundaryHelper('98');
function getBoundaryHelper(count: number, coarse: boolean) {
  return coarse || count > 10_000 ? boundaryHelperCoarse : boundaryHelperFine;
}

export function getFastBoundary(data: PositionData): Boundary {
  const box = Box3D.computeBounding(data);
  return { box, sphere: Sphere3D.fromBox3D(Sphere3D(), box) };
}

const p = Vec3();

/**
 * The sphere is fit along 98 directions up to 10,000 positions and along 14 above that,
 * or whatever the count with `coarse`, which is faster, and whose radius may differ by a few percent.
 * Above 250,000 positions the boundary is the one of `getFastBoundary`.
 */
export function getBoundary(data: PositionData, coarse = false): Boundary {
  const { x, y, z, radius, indices } = data;
  const n = OrderedSet.size(indices);

  if (n > 250_000) {
    return getFastBoundary(data);
  }

  const boundaryHelper = getBoundaryHelper(n, coarse);
  boundaryHelper.reset();
  for (let t = 0; t < n; t++) {
    const i = OrderedSet.getAt(indices, t);
    v3set(p, x[i], y[i], z[i]);
    boundaryHelper.includePositionRadius(p, (radius && radius[i]) || 0);
  }
  boundaryHelper.finishedIncludeStep();
  for (let t = 0; t < n; t++) {
    const i = OrderedSet.getAt(indices, t);
    v3set(p, x[i], y[i], z[i]);
    boundaryHelper.radiusPositionRadius(p, (radius && radius[i]) || 0);
  }

  const sphere = boundaryHelper.getSphere();

  if (!radius && Sphere3D.hasExtrema(sphere) && n <= sphere.extrema.length) {
    const extrema: Vec3[] = [];
    for (let t = 0; t < n; t++) {
      const i = OrderedSet.getAt(indices, t);
      extrema.push(Vec3.create(x[i], y[i], z[i]));
    }
    Sphere3D.setExtrema(sphere, extrema);
  }

  return { box: boundaryHelper.getBox(), sphere };
}
