/**
 * Copyright (c) 2026 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author David Sehnal <david.sehnal@gmail.com>
 * @author Rubén Chaves <ruben.chaves@irbbarcelona.org>
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { SortedArray } from '@molstar/core/data/int';
import { Sphere3D } from '@molstar/core/math/geometry';
import { getBoundary } from '@molstar/core/math/geometry/boundary';
import { BoundaryHelper } from '@molstar/core/math/geometry/boundary-helper';
import { Vec3 } from '@molstar/core/math/linear-algebra';
import { CIF } from '@molstar/io/reader/cif';
import { trajectoryFromMmCIF } from '@molstar/model/formats/structure/mmcif';
import { Coordinates, type Frame, Model, Structure, Time, type Unit } from '@molstar/model/model/structure';
import { StructureSymmetry } from '../symmetry.js';

describe('structure boundary', () => {
  it('is that of the moved unit spheres, without moving copies of them (perf-audit-2 05/P15)', async () => {
    const file = path.resolve(import.meta.dirname, '../../../../../../../data/examples/1cbs_updated.cif');
    const parsed = await CIF.parse(fs.readFileSync(file, 'utf8')).run();
    if (parsed.isError) throw new Error(parsed.message);
    const model = (await trajectoryFromMmCIF(parsed.result.blocks[0], parsed.result).run()).representative;
    const s = await StructureSymmetry.buildSymmetryRange(
      Structure.ofModel(model),
      Vec3.create(0, 0, 0),
      Vec3.create(1, 1, 0),
    ).run();
    expect(s.units.some((u) => !u.conformation.operator.isIdentity)).toBe(true);
    for (const u of s.units) void u.boundary; // the unit spheres, before counting

    const transform = vi.spyOn(Sphere3D, 'transform');
    const { box, sphere } = s.boundary;
    expect(transform).not.toHaveBeenCalled();
    transform.mockRestore();

    // the same as the helper given each moved unit sphere
    const reference = new BoundaryHelper('98');
    const moved = (u: Unit) => Sphere3D.transform(Sphere3D(), u.boundary.sphere, u.conformation.operator.matrix);
    reference.reset();
    for (const u of s.units) reference.includeSphere(moved(u));
    reference.finishedIncludeStep();
    for (const u of s.units) reference.radiusSphere(moved(u));
    const expected = reference.getSphere();
    expect(Vec3.exactEquals(sphere.center, expected.center)).toBe(true);
    expect(sphere.radius).toBe(expected.radius);
    expect(Vec3.exactEquals(box.min, reference.getBox().min)).toBe(true);
    expect(Vec3.exactEquals(box.max, reference.getBox().max)).toBe(true);
  });
});

describe('unit boundary', () => {
  function unitBoundary(unit: Unit, coarse: boolean) {
    const { x, y, z } = unit.model.atomicConformation;
    return getBoundary({ x, y, z, radius: Model.getAtomicRadii(unit.model), indices: unit.elements }, coarse);
  }

  it('is fit along 14 directions for the frames of a trajectory, along 98 otherwise (unit.md §1)', async () => {
    const file = path.resolve(import.meta.dirname, '../../../../../../../data/examples/1cbs_updated.cif');
    const parsed = await CIF.parse(fs.readFileSync(file, 'utf8')).run();
    if (parsed.isError) throw new Error(parsed.message);
    const model = (await trajectoryFromMmCIF(parsed.result.blocks[0], parsed.result).run()).representative;

    const [unit] = Structure.ofModel(model).units;
    expect(unit.elements.length).toBeLessThan(10_000);
    expect(unit.boundary).toEqual(unitBoundary(unit, false));
    expect(unit.boundary).not.toEqual(unitBoundary(unit, true));

    const n = model.atomicHierarchy.atoms._rowCount;
    const { x, y, z } = model.atomicConformation;
    const frames: Frame[] = [0, 1].map((i) => ({
      elementCount: n,
      time: Time(i, 'step'),
      x: Float32Array.from(x, (v, j) => v + Math.sin(j) * i),
      y,
      z,
      xyzOrdering: { isIdentity: true },
    }));
    const trajectory = Model.trajectoryFromModelAndCoordinates(
      model,
      Coordinates.create(frames, Time(1, 'step'), Time(0, 'step')),
    );
    const structure = Structure.ofModel(trajectory.getFrameAtIndex(0) as Model);
    const next = structure.remapModel(trajectory.getFrameAtIndex(1) as Model);
    const child = next.units[0].getChild(SortedArray.ofSortedArray(next.units[0].elements.slice(0, 100)));
    for (const u of [...structure.units, ...next.units, child]) {
      expect(u.boundary).toEqual(unitBoundary(u, true));
    }
  });
});
