## Trajectories: faster playback

- Intra-unit bond lines in which every bond is one solid line update their positions in place when only the
  coordinates change, e.g. on every frame of a trajectory, instead of being made again; the lines are the same, float
  for float (76k-atom membrane unit: 12.8 → 2.7 ms per frame; Mol\* 5.13 update per frame in a web client
  14.7 → 8.8 ms)
