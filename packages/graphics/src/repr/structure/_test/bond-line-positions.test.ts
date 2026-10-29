/**
 * Copyright (c) 2026 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Rubén Chaves <ruben.chaves@irbbarcelona.org>
 */

import { describe, expect, it } from 'vitest';
import { Column, Table } from '@molstar/core/data/db';
import { RuntimeContext } from '@molstar/core/task';
import { ParamDefinition as PD } from '@molstar/core/util/param-definition';
import { createModels } from '@molstar/model/formats/structure/basic/parser';
import { BasicSchema, createBasic } from '@molstar/model/formats/structure/basic/schema';
import { ComponentBuilder } from '@molstar/model/formats/structure/common/component';
import { EntityBuilder } from '@molstar/model/formats/structure/common/entity';
import { IndexPairBonds } from '@molstar/model/formats/structure/property/bonds/index-pair';
import { Coordinates, type Frame, Model, Structure, Time } from '@molstar/model/model/structure';
import { MoleculeType } from '@molstar/model/model/structure/model/types';
import { Theme } from '@molstar/graphics/theme/theme';
import { IntraUnitBondLineParams, IntraUnitBondLineVisual } from '../visual/bond-intra-unit-line.js';

const AtomCount = 12;

/** A zigzag chain of `AtomCount` carbon atoms */
function getChain(stretch: number) {
  const x = new Float32Array(AtomCount);
  const y = new Float32Array(AtomCount);
  const z = new Float32Array(AtomCount);
  for (let i = 0; i < AtomCount; ++i) {
    x[i] = i * 1.25 * stretch;
    y[i] = (i % 2) * 0.85;
    z[i] = i * 0.1;
  }
  return { x, y, z };
}

/** Two frames of one residue of atoms bonded one to the next with the given orders, as from a topology */
async function createFrames(orders: number[]) {
  const { x, y, z } = getChain(1);
  const auth_asym_id = Column.ofConst('A', AtomCount, Column.Schema.str);
  const auth_atom_id = Column.ofStringArray(Array.from({ length: AtomCount }, (_, i) => `C${i + 1}`));
  const auth_comp_id = Column.ofConst('LIG', AtomCount, Column.Schema.str);
  const auth_seq_id = Column.ofConst(1, AtomCount, Column.Schema.int);

  const atom_site = Table.ofPartialColumns(
    BasicSchema.atom_site,
    {
      auth_asym_id,
      auth_atom_id,
      auth_comp_id,
      auth_seq_id,
      Cartn_x: Column.ofFloatArray(x),
      Cartn_y: Column.ofFloatArray(y),
      Cartn_z: Column.ofFloatArray(z),
      id: Column.range(0, AtomCount - 1),

      label_asym_id: auth_asym_id,
      label_atom_id: auth_atom_id,
      label_comp_id: auth_comp_id,
      label_seq_id: auth_seq_id,
      label_entity_id: Column.ofConst('1', AtomCount, Column.Schema.str),

      occupancy: Column.ofConst(1, AtomCount, Column.Schema.float),
      type_symbol: Column.ofConst('C', AtomCount, Column.Schema.str),

      pdbx_PDB_model_num: Column.ofConst(1, AtomCount, Column.Schema.int),
    },
    AtomCount,
  );

  const entityBuilder = new EntityBuilder();
  entityBuilder.getEntityId('LIG', MoleculeType.Other, 'A');
  const componentBuilder = new ComponentBuilder(auth_seq_id, auth_atom_id);
  componentBuilder.add('LIG', 0);

  const basic = createBasic({
    entity: entityBuilder.getEntityTable(),
    chem_comp: componentBuilder.getChemCompTable(),
    atom_site,
  });
  const source = { kind: 'test', name: 'chain', data: undefined };
  const model = (await createModels(basic, source, RuntimeContext.Synchronous)).representative;
  IndexPairBonds.Provider.set(
    model,
    IndexPairBonds.fromData({
      pairs: {
        indexA: Column.range(0, AtomCount - 2),
        indexB: Column.range(1, AtomCount - 1),
        order: Column.ofIntArray(orders),
      },
      count: AtomCount,
    }),
  );

  const frames: Frame[] = [getChain(1), getChain(1.1)].map((positions, i) => ({
    elementCount: AtomCount,
    time: Time(i, 'step'),
    xyzOrdering: { isIdentity: true },
    ...positions,
  }));
  const trajectory = Model.trajectoryFromModelAndCoordinates(
    model,
    Coordinates.create(frames, Time(1, 'step'), Time(0, 'step')),
  );
  return [trajectory.getFrameAtIndex(0) as Model, trajectory.getFrameAtIndex(1) as Model];
}

const ctx = { runtime: RuntimeContext.Synchronous };
const theme = Theme.createEmpty();
const DefaultProps = PD.getDefaultValues(IntraUnitBondLineParams);

async function createVisual(structure: Structure, props = DefaultProps) {
  const visual = IntraUnitBondLineVisual(0);
  await visual.createOrUpdate(ctx, theme, props, { structure, group: structure.unitSymmetryGroups[0] });
  return visual;
}

function getLines(visual: ReturnType<typeof IntraUnitBondLineVisual>) {
  const { aStart, aEnd, aGroup, drawCount } = visual.renderObject!.values as any;
  const vertexCount = (drawCount.ref.value / 6) * 4;
  return {
    groups: Array.from(aGroup.ref.value.subarray(0, vertexCount)),
    starts: Array.from(aStart.ref.value.subarray(0, vertexCount * 3)),
    ends: Array.from(aEnd.ref.value.subarray(0, vertexCount * 3)),
  };
}

describe('IntraUnitBondLineVisual', () => {
  it('updates the positions of solid lines in place when only the coordinates change', async () => {
    const [frame0, frame1] = await createFrames(new Array(AtomCount - 1).fill(1));
    const structure = Structure.ofModel(frame0);
    const visual = await createVisual(structure);
    const { aGroup, aStart, aEnd } = visual.renderObject!.values;
    const versions = [aGroup.ref.version, aStart.ref.version, aEnd.ref.version];

    const next = structure.remapModel(frame1);
    expect(next.units[0].bonds).toBe(structure.units[0].bonds);
    await visual.createOrUpdate(
      ctx,
      theme,
      { ...DefaultProps },
      { structure: next, group: next.unitSymmetryGroups[0] },
    );

    // only the start and end buffers are written
    expect([aGroup.ref.version, aStart.ref.version, aEnd.ref.version]).toEqual([
      versions[0],
      versions[1] + 1,
      versions[2] + 1,
    ]);
    // as lines made for the frame from scratch
    const lines = getLines(visual);
    expect(lines.groups.length).toBe((AtomCount - 1) * 2 * 4);
    expect(lines).toEqual(getLines(await createVisual(next)));
    expect(lines).not.toEqual(getLines(await createVisual(structure)));
  });

  it('makes the lines again when a bond is not one solid line', async () => {
    const orders = new Array(AtomCount - 1).fill(1);
    orders[3] = 2;
    const [frame0, frame1] = await createFrames(orders);
    const structure = Structure.ofModel(frame0);
    const visual = await createVisual(structure);
    const { aGroup } = visual.renderObject!.values;
    const groupVersion = aGroup.ref.version;

    const next = structure.remapModel(frame1);
    await visual.createOrUpdate(
      ctx,
      theme,
      { ...DefaultProps },
      { structure: next, group: next.unitSymmetryGroups[0] },
    );

    expect(aGroup.ref.version).toBe(groupVersion + 1);
    const lines = getLines(visual);
    expect(lines.groups.length).toBe((AtomCount - 1 + 1) * 2 * 4);
    expect(lines).toEqual(getLines(await createVisual(next)));
  });

  it('makes the lines again when the props of the lines change', async () => {
    const [frame0, frame1] = await createFrames(new Array(AtomCount - 1).fill(1));
    const structure = Structure.ofModel(frame0);
    const visual = await createVisual(structure);
    const { aGroup } = visual.renderObject!.values;
    const groupVersion = aGroup.ref.version;

    const next = structure.remapModel(frame1);
    // no bond is dashed, but the lines are made with this prop
    const props = { ...DefaultProps, dashCount: 2 };
    await visual.createOrUpdate(ctx, theme, props, { structure: next, group: next.unitSymmetryGroups[0] });

    expect(aGroup.ref.version).toBe(groupVersion + 1);
    const lines = getLines(visual);
    expect(lines.groups.length).toBe((AtomCount - 1) * 2 * 4);
    expect(lines).toEqual(getLines(await createVisual(next, props)));
  });
});
