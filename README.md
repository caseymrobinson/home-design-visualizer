# Bath Studio

A browser-based 3D visualizer for redesigning a bathroom. You give it real dimensions and it builds the room at true scale. You can orbit it like a dollhouse, walk through it at eye level, place fixtures by dragging, and swap tile, paint and metal finishes. When a view looks right, you can path-trace a near-photographic render.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production bundle in dist/
```

It needs a desktop browser with WebGL2 (Chrome, Edge, Safari 17+ or Firefox). Designs save automatically in the browser's local storage, and you can export or import them as JSON from **Design options**.

## Using it

| | |
|---|---|
| **Orbit** (`1`) | Drag to orbit, right-drag to pan, scroll to zoom. Walls between you and the room slide down so you can see in. |
| **Eye level** (`2`) | You stand at 5′10″, so eyes sit at 5′5½″. Use WASD or the arrow keys to walk, drag to look around, and double-click the floor to walk there. Scroll or use the lens slider to change focal length. Chips jump you to the doorway, the vanity, the tub or the toilet. |
| **Plan** (`3`) | Top-down view. |
| **Move things** | Click an item to select it, then drag. Floor items back up against walls and tuck into corners. Wall items slide along any wall and snap to center, to their neighbors and over sinks. Hold `⌥`/`Alt` to place freely. Live dimensions show distance to the walls; toilets show the centerline distance to each side. |
| **Keys** | `R` rotates (hold Shift for 15° steps), `⌫` removes, `⌘D` duplicates, arrows nudge ½″ (hold Shift for 2″), `⌘Z` / `⇧⌘Z` undo and redo, `M` toggles measurements, `Esc` deselects. |
| **Render photo** | Path-traces the current view with real light bounces, glass and reflections. Save the result as a PNG. |

All lengths accept feet and inches: `8' 4 1/2"`, `8-4.5`, `100.5`, `100 1/2`.

## How the room is described

The design data lives in `src/lib/types.ts`. Everything is in inches.

- **Room**: corner points in plan, ceiling height, wall thickness and baseboard height. Walls are named A, B, C, D… in order.
- **Partitions**: half walls. Each one attaches to a wall at an offset and records how far it juts out, its thickness and its height.
- **Openings**: doors and windows. Each one records its wall, center position, width, height and sill. Doors also have a hinge side and an open angle.
- **Tile zones**: rectangles of tile on any wall or partition face. Openings are cut out automatically.
- **Items**: fixtures and accessories. Each one records its catalog type, its position in plan, its height off the floor, its rotation, its W×D×H and its type-specific parameters.

The starting design (`src/lib/defaults.ts`) is Casey's bathroom:

- **Size**: 100½″ × 100″, with a 95″ ceiling.
- **Wall A**: the tub and shower alcove, then the toilet, separated by a 32″ × 4″ half wall.
- **Wall C**: the 72″ floating vanity and the 16″ linen cabinet.
- **Door and window**: placed on walls B and D. These positions are assumptions; adjust them in **Room**.

## Realism, in brief

- **Tile**: tile is manufactured procedurally, one tile at a time. Each tile gets its own glaze color, tonal variation, edge profile (rectified, eased or pillowed), surface relief (zellige waviness, marble veining, terrazzo chips, limestone fossils) and recessed grout. The generator outputs albedo, normal and roughness maps at true scale in a Web Worker. You can also upload a photo of a real tile face.
- **Lighting is photometric**: fixtures are specified in lumens and Kelvin, the sun is positioned by time of day and room orientation, and window skylight is modeled as area lights. Exposure is metered automatically, like a camera.
- **Real-time view**: soft shadows, screen-space ambient occlusion and bloom. A cube-map probe captures the room so glossy surfaces reflect it and walls pick up bounce light. Mirrors are true planar reflections.
- **Render photo**: uses [three-gpu-pathtracer](https://github.com/gkjohnson/three-gpu-pathtracer), which simulates actual light transport.

## Code map

```
src/
  lib/         data model, geometry, catalog, defaults, units (ft-in parsing)
  materials/   procedural tile / wood / stone / fabric generators + material library
  three/       scene, room builder, camera rig, placement & snapping, effects, path tracer
    items/     parametric 3D models (vanity, tub, toilet, mirrors, lights, accessories…)
  ui/          panels, inspector, view bar, overlays, shortcuts
```

Debug URL flags: `?fx=0` turns off post effects, `?mirrors=0` turns off live mirrors, `?env=0` turns off the bounce-light probe, and `?msaa=0` turns off multisampling.
