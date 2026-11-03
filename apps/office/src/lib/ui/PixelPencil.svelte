<script lang="ts">
  // A pencil drawn on an 8 by 8 grid, to sit beside the floor's pixel type.
  // One em square, in the text colour; the tip and eraser are fainter.
  const ART = [
    '......EE',
    '.....#EE',
    '....###.',
    '...###..',
    '..###...',
    '.###....',
    'TT#.....',
    'T.......'
  ];
  const cells = ART.flatMap((row, y) =>
    [...row].flatMap((c, x) => (c === '.' ? [] : [{ x, y, faint: c !== '#' }]))
  );
</script>

<svg
  class="size-[1em] shrink-0"
  viewBox="0 0 8 8"
  shape-rendering="crispEdges"
  fill="currentColor"
  aria-hidden="true"
>
  {#each cells as c (`${c.x},${c.y}`)}
    <rect x={c.x} y={c.y} width="1" height="1" opacity={c.faint ? 0.55 : 1} />
  {/each}
</svg>
