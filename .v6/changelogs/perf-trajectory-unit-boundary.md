## Trajectories: faster playback

- Units of a trajectory of several frames fit their bounding sphere along 14 directions instead of 98, as units above
  10,000 atoms already do, since they are fit again for every frame shown; the sphere still encloses every atom, its
  radius within ±5% (4 chains of 7,908 atoms: 4.5 → 1.8 ms per frame; Mol\* 5.13 update per frame in a web client
  18.2 → 15.3 ms)
