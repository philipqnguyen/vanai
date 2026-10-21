// Moonmere walked with the game's own groundHeight / resolveCollision (scene.ts)
// in /?zone=moonmere (MOONMERE.md section 9, "QA scripts"): the evidence for the
// planners' colliders, decks, ramps and stair bodies (S2: and L1's, below; S3: and L2's, the West Arm,
// the Landing and the knoll, at the end). K1: the Crown's routes --
// the spawn to the crystal, the Mere Stair from the Jetty to Academy Court,
// into each enterable building of the Crown and up its stairs, and up the Long
// Tower to the annex door.
//
//   VANAI_PLAYWRIGHT_PATH=... node tools/qa/moonmere_walk.mjs [http://localhost:5173]
//
// Each route is walked in 0.1 m steps; it REACHES its last point (and stands at
// the height `y` says, within 0.3 m) or STOPS against something (debugHit names
// it). The biggest single step up or down is reported: over STEP is a snag.
// Exits 1 when a route does otherwise.
import { chromium, CHANNEL, GL_ARGS, QA_BASE } from './lib/playwright.mjs';

const base = process.argv.find((a) => /^https?:/.test(a)) ?? process.env.BASE ?? QA_BASE;
const STEP = 0.45;
// (A-13: the quay ring's two routes step 0.75 m inland round each bollard, which is solid now --
// the points were moved within 0.9 m of one)
const routes = {
  // MM-3's fixed points: the causeway deck, the Causeway Gate, the Landing, flight 1,
  // the Landing Lane, flight 2 and the Precinct Gate into Academy Court
  spawn_to_crystal: { pts: [[8, 288], [8, 262], [8, 250], [8, 232], [8, 215], [8, 212.5], [-4, 212], [-4, 209], [-4, 191], [-4, 184], [-10, 175], [-12.5, 171.5]], y: 14.4 },
  // the Mere Stair from the Jetty's head up to the Court (section 2)
  // (S1, MM-13: the split stair -- up the crossing, round the Moon Fountain's lower basin, up the
  // west flight to the terrace, past the fountain's upper basin, up the well to the head)
  mere_stair: { startY: 1.0, pts: [[5.6, 72], [5, 86], [4.2, 89.6], [3.1, 104.5], [3.4, 118], [-0.6, 123.5], [-0.6, 132.5], [-0.6, 136], [4, 140], [4, 152], [2, 163]], y: 14.4 },
  mere_stair_east: { startY: 7.2, pts: [[6, 118], [8.6, 123.5], [8.6, 132.5], [8.6, 136], [4, 140], [4, 152]], y: 14.4 },
  // Academy Court's walks through what fills it (S1 review, MM-14): down the market's aisle from
  // the crystal to the Archive's door, round the fountain; from the crystal to Kit Glazier's door;
  // from the Mere Stair's head between the aisle's rows to the Precinct Gate
  court_aisle: { pts: [[-8, 168], [16, 168], [17, 163.9], [27, 163.9], [30, 168], [35.5, 168]], y: 14.4 },
  court_to_kit_glazier: { pts: [[-12.5, 171.5], [-13.5, 176.5], [-19, 180.5], [-19, 182.6]], y: 14.4 },
  court_head_to_precinct: { pts: [[4, 153], [0.6, 165.4], [-0.6, 170.6], [-4, 184]], y: 14.4 },
  // the Returns Archive: in at its door, up both stairs to Quire's top room
  archive: { pts: [[30, 168], [35.5, 168], [37.6, 168], [39, 166.2], [47, 158], [49.5, 157.1], [49.6, 162.3], [49.6, 163.4], [47, 165], [47, 170], [47, 178.6], [49.5, 178.6], [49.5, 173.5], [46.5, 173.5], [46.5, 175]], y: 22.2 },
  // OFF THE CENTRE LINE (2026-10-12, Philip: "blocked part way up" every stair): the well rails on
  // the floor above held solid from 1.4 m under it and closed round a climber 0.3 m off the flight's
  // centre two thirds of the way up (moonmere_types.ts WELL_RAIL_Y0). Both Archive flights and a
  // house's, 0.3 m to either side of the centre line
  archive_f0_off_w: { startY: 15.0, pts: [[49.8, 157.05], [49.8, 162.3]], y: 18.6 },
  archive_f0_off_e: { startY: 15.0, pts: [[49.2, 157.05], [49.2, 162.3]], y: 18.6 },
  archive_f1_off: { startY: 18.6, pts: [[49.2, 178.95], [49.2, 173.75]], y: 22.2 },
  house_stair_off: { startY: 15.6, pts: [[-21.6, 193.0], [-16.0, 193.0]], y: 19.2 },
  archive_shelves: { pts: [[30, 168], [35.5, 168], [37.6, 168], [39, 166.2], [46.8, 163]], y: 15.0 },
  registry: { pts: [[-12, 156], [-12, 152], [-12, 150.2], [-12, 149.7], [-10, 149.6], [-9, 146], [-7.9, 143], [-7.9, 141.4], [-12.2, 141.4], [-14, 143.5]], y: 18.6 },
  // THE FOOT RULE (MOONMERE.md section 5, 2026-10-09): dead straight onto Philip's stair from the
  // 0.9 m stand-back -- before the rule its foot stood 0.6 m off the east wall, nowhere to stand.
  // (The same pass moved the points on each moved flight -- registry, bursar, archive, shelf_inn --
  // by that flight's own slide up its run.) `flatFirst`: it must walk 0.85 m of level floor before
  // its first rise (0.9 to the riser, less the ramp's 0.05 pad before it). The east wall did not
  // move, so the start point is the same in both builds; without this the route also passed on the
  // old flight (its riser 0.3 m on). The regression guard proper is moonmere_stair_feet.test.mjs
  // (rule B) and the generator's foot_check; this is the live smoke of it
  registry_straight: { startY: 15.0, flatFirst: 0.85, pts: [[-7.1, 141.4], [-12.2, 141.4], [-14, 143.5]], y: 18.6 },
  bursar: { pts: [[20, 156], [20, 152], [20, 150.2], [20, 149.7], [22, 149.6], [23, 146], [23.9, 143], [23.9, 141.4], [19.8, 141.4], [19.4, 143.2], [22, 143.5]], y: 18.6 },
  customs: { pts: [[24.2, 88], [24.24, 93.26], [24.9, 97]], y: 1.0 },
  // THE EXCHANGE (2026-10-11), the auction house on the court's north side: from the Precinct Gate's
  // mouth, the court's middle and its north-east corner, in through three of its arches (world x 7.2,
  // 17 the pavilion's, 30.8) to the customer's side of a counter, on its floor at 14.42
  exchange_from_gate: { pts: [[-4, 183], [7.2, 182.5], [7.2, 187], [8.6, 191.6]], y: 14.42 },
  exchange_middle: { pts: [[12, 168], [17, 178], [17, 183], [17, 187], [13.4, 191.6]], y: 14.42 },
  exchange_east: { pts: [[30, 172], [32.6, 176], [32.6, 182.5], [30.8, 184.5], [30.8, 187], [25.4, 191.6]], y: 14.42 },
  exchange_along: { startY: 14.42, pts: [[8.6, 191.6], [25.4, 191.6]], y: 14.42 },
  // and what stops: a counter (the broker's side is theirs), and a pier between two arches
  exchange_counter: { block: true, startY: 14.42, pts: [[20.6, 191.6], [20.6, 194.4]], by: [19.2, 22.0, 192.9, 194.0], byThick: 0.45 },
  exchange_pier: { block: true, startY: 14.42, pts: [[7.2, 185.4], [11.2, 185.4]], by: [8.7, 9.7, 185.0, 185.8], byThick: 0.45 },
  // N2-f0, the copyists' room (A-3), from the Mere Walk
  copyists: { pts: [[-6.96, 107.95], [-7.64, 110.35], [-8.45, 113.2]], y: 8.4 },
  // PW-0, Kit Glazier's home, from Academy Court up to its floor 1
  pw_home: { pts: [[-19, 180], [-19, 185], [-19, 188], [-21.3, 192.7], [-15.9, 192.7], [-15.9, 189], [-18.45, 188.5]], y: 19.2 },
  // the Long Tower: up the Observatory Stair, through the Provost's loggia and the
  // door, up F0 to the lobby, before the annex door (the story test's replay path)
  long_tower: { pts: [[-28, 173.5], [-30, 174], [-45.5, 176], [-49, 176.3], [-53, 177.2], [-53.5, 178], [-56.5, 178], [-60, 176], [-64, 174.2], [-65.6, 173.9],
    [-65.6, 176], [-65.6, 178.4], [-65.6, 180.5], [-63.4, 180.5]], y: 25.8 },
  // A-7 (the walk review): what must NOT be walked. Each starts on a floor or a flight
  // and walks at what looks solid -- the wall over a door on every upper floor, a
  // flight's or a landing's cheek, the Archive's floor-2 partition, the jetty root's
  // water-stair landing -- and passes only if it is STOPPED with no fall on the way
  // (`block`), or never goes below `minY`
  lt_f5_door_line: { block: true, startY: 40.2, pts: [[-60, 178], [-52, 178]] },
  archive_f1_door_line: { block: true, startY: 18.6, pts: [[39, 168], [35.5, 168]] },
  archive_f2_west: { block: true, startY: 22.2, pts: [[46, 175], [42.5, 175]] },
  registry_f1_door_line: { block: true, startY: 18.6, pts: [[-12, 149.5], [-12, 152.5]] },
  bursar_f1_door_line: { block: true, startY: 18.6, pts: [[20, 149.5], [20, 152.5]] },
  pw_f1_door_line: { block: true, startY: 19.2, pts: [[-18.5, 187], [-18.5, 184.5]] },
  // (S1 review: a must-stop route names the WALL that must stop it -- `by`, the box's centre in
  // [x0, x1, z0, z1], a wall's section (one half-extent <= 0.25, the other >= 0.5) -- so a lamp
  // post or a bench in the way cannot pass it; two of S1's passed on a lamp and a corner)
  mere_stair_lower_off_w: { block: true, startY: 4.1, pts: [[3.6, 97], [-0.6, 97]], by: [-0.6, 0.6, 94, 100] },
  mere_stair_lower_off_e: { block: true, startY: 4.1, pts: [[3.6, 97], [8.5, 97]], by: [6.9, 8.0, 94, 100] },
  // (S1: the old single flight's side is the west flight's outer cheek now, and the terrace's and the well's walls)
  mere_stair_west_off_w: { block: true, startY: 9.6, pts: [[-0.6, 130], [-3.6, 130]], by: [-2.8, -2.0, 125, 133] },
  mere_stair_west_off_fountain: { block: true, startY: 9.6, pts: [[-0.6, 130], [2.5, 130]] },
  mere_terrace_off_w: { block: true, startY: 10.8, pts: [[0, 134], [-3.6, 134]], by: [-2.7, -2.1, 132.4, 135.6] },
  mere_terrace_off_e: { block: true, startY: 10.8, pts: [[8, 134], [11.6, 134]], by: [10.1, 10.7, 132.4, 135.6] },
  mere_terrace_off_fountain: { block: true, startY: 10.8, pts: [[4, 136], [4, 131]] },
  mere_well_off_w: { block: true, startY: 12.7, pts: [[4, 146], [-1.0, 146]], by: [0.0, 0.7, 142.4, 150.2] },
  // the terrace's high side walls north of the riser (S1 review: aimed at the walls, not along
  // them; z 136.2 is the one line to them clear of the terrace's lemons, benches and lamp)
  mere_terrace_wall_w: { block: true, startY: 10.8, pts: [[4, 136.2], [-3.6, 136.2]], by: [-2.7, -2.1, 135.4, 142.6] },
  mere_terrace_wall_e: { block: true, startY: 10.8, pts: [[4, 136.2], [11.6, 136.2]], by: [10.1, 10.7, 135.4, 142.6] },
  // the court's edges over the terrace and into the well: a 3.6 m fall either way (`edge`: the
  // plan's own edge -- unwalkable -- within a walker's reach of that wall stops it too)
  mere_court_off_terrace_w: { block: true, edge: true, startY: 14.4, pts: [[-1.2, 144.5], [-1.2, 139.5]], by: [-2.7, 0.3, 141.8, 142.7] },
  mere_court_off_terrace_e: { block: true, edge: true, startY: 14.4, pts: [[9.2, 144.5], [9.2, 139.5]], by: [7.7, 10.7, 141.8, 142.7] },
  mere_court_into_well_w: { block: true, edge: true, startY: 14.4, pts: [[-1.6, 146.5], [4, 146.5]], by: [0.0, 0.7, 142.4, 150.2] },
  mere_court_into_well_e: { block: true, edge: true, startY: 14.4, pts: [[9.6, 146.5], [4, 146.5]], by: [7.3, 8.0, 142.4, 150.2] },
  observatory_stair_off: { block: true, startY: 17.65, pts: [[-36.5, 176], [-36.5, 178.5]] },
  jetty_root_water_stair: { minY: -0.95, startY: 1.0, pts: [[5.5, 80], [3, 85], [2.5, 85], [3, 84.5], [3, 79.7]] },
  // S2, L1 -- THE COLLEGE ARM AND THE MERE (generated in the college's own frame and on the mere's
  // bearings): into the Mending College and up both its
  // flights to the ward and the library, its desk, its two gardens; the herb dryer (E3), the sail and
  // net lofts (QE1, QW1); every cross stair end to end; the Quay Ring both ways, the Mere Walk and the
  // East Terrace; the Lamp Hard to the Sea Lamp's yard and the Boathouse Hard. Must stop: the
  // college's floor-1 front wall over its door, its two stair wells, the quay's edge at both rows
  college: {pts: [[81.32,121.37],[83.58,124.67],[84.71,126.32],[82.57,128.51],[79.35,132.65],[76.37,134.68],[73.25,133.31],[72.23,133.94],[74.69,137.53],[75.19,138.28],[76.71,137.3],[77.09,134.68],[84.37,128.49]],y: 18.6},
  college_library: {startY: 18.6,pts: [[84.83,129.15],[95.97,121.53],[95.38,118.18],[96.34,117.47],[98.79,121.06],[99.3,121.8],[97.84,122.86],[95.26,122.26],[92.72,123.87]],y: 22.2},
  college_hall_desk: {pts: [[81.32,121.37],[83.58,124.67],[84.71,126.32],[86.88,127.38]],y: 15},
  college_garth: {pts: [[81.32,121.37],[83.58,124.67],[84.71,126.32],[85.11,128.23],[86.29,129.97],[87.14,129.87],[88.66,132.1],[88.13,134.16],[89.82,136.64],[89.91,139.96]],y: 14.4},
  // (S2 review: the physic garden's walk, round the dipping well where its walks cross)
  college_physic: {pts: [[91.12,114.43],[101.37,108.88],[103.86,112.51],[109.95,118.77],[112.77,122.89],[116.04,130.34]],y: 14.4},
  // (S2 review: through the court door into the garth, under the +x arcade and along its ambulatory)
  college_garth_walk: {pts: [[81.32,121.37],[83.58,124.67],[84.71,126.32],[85.11,128.23],[86.29,129.97],[87.14,129.87],[88.66,132.1],[85.96,136.13],[83.73,137.65],[81.91,138.89],[86.26,145.25],[86.77,145.99]],y: 14.4},
  college_lemons: {pts: [[71.3,127.97],[63.23,134.95],[65.71,138.58],[72.82,148.98],[78.12,156.74]],y: 14.4},
  herb_dryer: {pts: [[86.8,66.8],[88.57,67.57],[90.4,68.36],[91.8,69]],y: 8.4},
  sail_loft: {startY: 1,pts: [[77.6,19.4],[79.98,18.85],[82.5,18.3]],y: 1},
  net_loft: {startY: 1,pts: [[-57.6,48.6],[-59.98,49.14],[-62.5,49.7]],y: 1},
  kiln_stair: {startY: 1,pts: [[69.6,12.04],[86.41,3.4],[100.72,-3.97],[117.09,-12.38]],y: 7.2},
  herb_stair: {startY: 1,pts: [[64.85,63.52],[79.96,74.87],[92.84,84.54],[107.55,95.59]],y: 14.4},
  ropewalk_stair: {startY: 7.2,pts: [[93.4,42.05],[109.38,44.02],[127.64,46.28]],y: 14.4},
  lamp_stair: {startY: 1,pts: [[-44.85,63.52],[-59.96,74.87],[-72.84,84.54],[-87.55,95.59]],y: 14.4},
  ash_stair: {startY: 1,pts: [[-41.34,0.26],[-55.27,-12.52],[-67.13,-23.4],[-80.69,-35.84]],y: 7.2},
  quay_ring_east: {startY: 1,pts: [[37.6,-33],[41,-30],[41.5,-21],[40.53,-15.66],[41.46,-15.24],[42.38,-14.8],[43.31,-14.35],[44.23,-13.89],[45.14,-13.41],[46.05,-12.92],[46.96,-12.4],[47.86,-11.88],[48.76,-11.34],[49.65,-10.78],[50.54,-10.2],[51.42,-9.61],[52.29,-9.01],[53.16,-8.38],[54.01,-7.74],[54.86,-7.09],[55.71,-6.41],[56.54,-5.72],[57.36,-5.01],[58.18,-4.29],[58.98,-3.55],[59.77,-2.79],[60.55,-2.02],[61.32,-1.22],[62.08,-0.41],[62.82,0.41],[63.55,1.25],[64.27,2.11],[64.97,2.99],[65.65,3.88],[66.32,4.79],[66.97,5.71],[66.02,7.7],[66.61,8.62],[67.19,9.56],[67.75,10.51],[68.28,11.47],[68.8,12.45],[69.29,13.44],[69.77,14.45],[70.22,15.46],[70.65,16.49],[71.06,17.53],[73.23,17.94],[73.61,19.04],[73.95,20.15],[74.28,21.27],[74.57,22.4],[74.84,23.54],[75.08,24.68],[75.3,25.83],[75.48,26.99],[75.64,28.15],[75.77,29.31],[75.87,30.48],[75.94,31.65],[76.74,32.82],[74.85,34],[74.84,35.14],[74.04,36.25],[73.98,37.38],[73.88,38.5],[73.75,39.62],[73.6,40.73],[73.42,41.84],[73.22,42.95],[72.99,44.05],[72.73,45.14],[74.28,46.73],[73.95,47.85],[73.61,48.96],[73.23,50.06],[72.83,51.15],[72.41,52.23],[71.97,53.29],[71.5,54.35],[71,55.39],[70.49,56.42],[69.95,57.43],[69.4,58.43],[67.19,58.44],[66.61,59.38],[66.02,60.3],[65.41,61.21],[64.78,62.1],[64.13,62.98],[63.47,63.84],[62.8,64.69],[62.11,65.52],[61.4,66.33],[60.68,67.13],[61.32,69.22],[60.55,70.02],[59.77,70.79],[58.98,71.55],[58.18,72.29],[57.36,73.01],[56.54,73.72],[55.71,74.41],[54.86,75.09],[54.01,75.74],[53.16,76.38],[52.29,77.01],[51.42,77.61],[50.54,78.2],[49.65,78.78],[48.76,79.34],[47.86,79.88],[46.96,80.4],[46.05,80.92],[45.14,81.41],[44.23,81.89],[43.31,82.35],[42.38,82.8],[41.46,83.24],[40.53,83.66],[39.59,84.06],[38.66,84.45],[37.72,84.83],[36.78,85.19],[35.84,85.54],[34.89,85.87],[33.95,86.19],[33,86.49],[32.05,86.79],[31.1,87.06],[30.15,87.33],[29.19,87.58],[28.24,87.82],[27.28,88.05],[26.33,88.26],[25.37,88.46],[24.41,88.65]],y: 1},
  quay_ring_west: {startY: 1,pts: [[0.38,89.4],[-0.58,89.28],[-1.54,89.14],[-2.5,88.99],[-3.45,88.83],[-4.41,88.65],[-5.37,88.46],[-6.33,88.26],[-7.28,88.05],[-8.24,87.82],[-9.19,87.58],[-10.15,87.33],[-11.1,87.06],[-12.05,86.79],[-13,86.49],[-13.95,86.19],[-14.89,85.87],[-15.84,85.54],[-16.78,85.19],[-17.72,84.83],[-18.66,84.45],[-19.59,84.06],[-20.53,83.66],[-21.46,83.24],[-22.38,82.8],[-23.31,82.35],[-24.23,81.89],[-25.14,81.41],[-26.05,80.92],[-26.96,80.4],[-27.86,79.88],[-28.76,79.34],[-29.65,78.78],[-30.54,78.2],[-31.42,77.61],[-32.29,77.01],[-33.16,76.38],[-34.01,75.74],[-34.86,75.09],[-35.71,74.41],[-36.54,73.72],[-37.36,73.01],[-38.18,72.29],[-38.98,71.55],[-39.77,70.79],[-40.55,70.02],[-41.32,69.22],[-40.68,67.13],[-41.4,66.33],[-42.11,65.52],[-42.8,64.69],[-43.47,63.84],[-44.13,62.98],[-44.78,62.1],[-45.41,61.21],[-46.02,60.3],[-46.61,59.38],[-47.19,58.44],[-49.4,58.43],[-49.95,57.43],[-50.49,56.42],[-51,55.39],[-51.5,54.35],[-51.97,53.29],[-52.41,52.23],[-52.83,51.15],[-53.23,50.06],[-53.61,48.96],[-53.95,47.85],[-54.28,46.73],[-54.57,45.6],[-54.84,44.46],[-55.08,43.32],[-55.3,42.17],[-55.48,41.01],[-55.64,39.85],[-55.77,38.69],[-55.87,37.52],[-55.94,36.35],[-55.99,35.17],[-56,34],[-55.99,32.83],[-55.94,31.65],[-53.98,30.62],[-53.88,29.5],[-53.75,28.38],[-53.6,27.27],[-53.42,26.16],[-53.22,25.05],[-52.99,23.95],[-52.73,22.86],[-53.18,21.64],[-52.86,20.54],[-52.53,19.46],[-53.23,17.94],[-52.83,16.85],[-52.41,15.77],[-51.97,14.71],[-51.5,13.65],[-51,12.61],[-50.49,11.58],[-49.95,10.57],[-49.4,9.57],[-48.82,8.58],[-48.22,7.61],[-47.61,6.66],[-46.97,5.71],[-46.32,4.79],[-44.13,5.02],[-43.47,4.16],[-42.8,3.31],[-42.11,2.48],[-41.4,1.67],[-40.68,0.87],[-39.95,0.09],[-39.2,-0.68],[-38.45,-1.43],[-37.68,-2.16],[-36.9,-2.88],[-37.36,-5.01],[-36.54,-5.72],[-35.71,-6.41],[-34.86,-7.09],[-34.01,-7.74],[-33.16,-8.38],[-32.29,-9.01],[-31.42,-9.61],[-30.54,-10.2],[-29.65,-10.78],[-28.76,-11.34],[-27.86,-11.88],[-26.96,-12.4],[-26.05,-12.92],[-25.14,-13.41],[-24.23,-13.89],[-23.31,-14.35],[-22.38,-14.8],[-21.46,-15.24],[-20.53,-15.66],[-19.59,-16.06],[-18.66,-16.45]],y: 1},
  mere_walk_east: {startY: 7.2,pts: [[59.27,-25.87],[61.52,-24.39],[63.74,-22.82],[65.93,-21.16],[68.08,-19.4],[70.19,-17.56],[72.26,-15.61],[74.28,-13.57],[76.24,-11.44],[78.14,-9.2],[79.96,-6.87],[81.71,-4.44],[83.37,-1.92],[84.94,0.69],[86.41,3.4],[87.76,6.18],[89,9.05],[90.12,12],[91.1,15.01],[91.94,18.08],[92.64,21.2],[93.19,24.36],[93.58,27.55],[93.82,30.77],[93.9,34],[93.82,37.23],[93.58,40.45],[93.19,43.64],[92.64,46.8],[91.94,49.92],[91.1,52.99],[90.12,56],[89,58.95],[87.76,61.82],[86.41,64.6],[84.94,67.31],[83.37,69.92],[81.71,72.44],[79.96,74.87],[78.14,77.2],[76.24,79.44],[74.28,81.57],[72.26,83.61],[70.19,85.56],[68.08,87.4],[65.93,89.16],[63.74,90.82],[61.52,92.39],[59.27,93.87],[57,95.27],[54.72,96.58],[52.41,97.81],[50.1,98.96],[47.77,100.03],[45.43,101.02]],y: 7.2},
  east_terrace: {startY: 14.4,pts: [[124.14,5.08],[125.42,9.73],[126.48,14.48],[127.31,19.29],[127.92,24.16],[128.28,29.07],[128.4,34],[128.28,38.93],[127.92,43.84],[127.31,48.71],[126.48,53.52],[125.42,58.27],[124.14,62.92],[122.66,67.47],[120.98,71.9],[119.12,76.21],[117.09,80.38],[114.9,84.41],[112.58,88.29],[110.12,92.02],[107.55,95.59],[104.87,99.01],[102.1,102.27],[99.26,105.37],[96.34,108.33],[93.36,111.13],[90.32,113.78],[87.25,116.28],[84.13,118.65],[80.98,120.87],[77.81,122.97],[74.62,124.93],[71.41,126.77],[68.19,128.49],[64.96,130.09],[61.72,131.58],[58.48,132.96],[55.24,134.23],[51.99,135.4]],y: 14.4},
  lamp_hard_to_sea_lamp: {startY: 1,pts: [[-11.4,-18.4],[-13.4,-28],[-15.2,-40],[-17.2,-46.2],[-17.4,-52.4]],y: 1},
  boathouse_hard: {startY: 1,pts: [[41.5,-21],[41,-30],[37.6,-33],[38.6,-44]],y: 1},
  college_f1_front: {block: true,startY: 18.6,pts: [[85.56,127.56],[83.02,123.85]], by: [83.15, 84.35, 124.32, 125.52]},
  college_f1_well: {block: true,startY: 18.6,pts: [[75.37,134.64],[72.73,136.45]], by: [73.26, 74.46, 134.57, 135.77]},
  college_f2_well: {block: true,startY: 22.2,pts: [[95.85,120.65],[98.49,118.84]], by: [96.29, 97.49, 118.83, 120.03]},
  college_f1_court_wall: {block: true,startY: 18.6,pts: [[86.4,128.8],[89.22,132.93]], by: [87.13, 88.33, 130.14, 131.34]},
  college_f2_court_wall: {block: true,startY: 22.2,pts: [[81.45,132.18],[84.27,136.31]], by: [80.44, 81.64, 134.71, 135.91]},
  quay_edge_qe: {block: true,startY: 1,pts: [[75.08,24.68],[70.18,25.66]], by: [71.59, 72.79, 24.37, 25.57]},
  quay_edge_qw: {block: true,startY: 1,pts: [[-55.77,38.69],[-50.79,38.19]], by: [-53.38, -52.18, 38.84, 40.04]},
  // (S2 review: the garth's walls were drawn only -- a walker passed through the arcade's piers into
  // the hollow ranges): the ambulatory's back wall, and a pier between two arches
  college_walk_back_wall: {block: true,startY: 14.4,pts: [[83.72,141.53],[81.16,143.28]], by: [82.17, 83.37, 141.58, 142.78]},
  college_garth_pier: {block: true,startY: 14.4,pts: [[84.99,138.25],[82.51,139.94]], by: [82.92, 84.12, 138.64, 139.84]},  // S3, L2 -- THE WEST ARM, THE LANDING AND THE KNOLL (MOONMERE.md A-12):
  // the West Terrace, the Mere Walk's west half, the Ink Stair; the four West Arm courts in at their gates
  // (W1 under its arbours, W2 to its cafe and to Clary Soames, W3 under its lines, W4 round its beds);
  // the Lemon Court's reading room and cafe; Tansy Scrivener's home up to her floor; the Long Garden and
  // its orchard; Ada's and Quill's shops; the Shelf Inn along its pier and up its stair; the strand to the
  // book spines; the Burned Shelf to Corvo and the bench, Thrale and the books; the Alchemists; the
  // Observers' Garden; Robin Venn's home on the Landing Row; the Long Tower floor by floor to the observers' gallery (F5). Must stop: the inn's
  // floor 1 at its front wall, the Long Garden's balustrade, a burned case; never up from the gallery
  west_terrace: {startY: 14.4,pts: [[-35.24,134.23],[-38.48,132.96],[-41.72,131.58],[-44.96,130.09],[-48.19,128.49],[-51.41,126.77],[-54.62,124.93],[-57.81,122.97],[-60.98,120.87],[-64.13,118.65],[-67.25,116.28],[-70.32,113.78],[-73.36,111.13],[-76.34,108.33],[-79.26,105.37],[-82.1,102.27],[-84.87,99.01],[-87.55,95.59],[-90.12,92.02],[-92.58,88.29],[-94.9,84.41],[-97.09,80.38],[-99.12,76.21],[-100.98,71.9],[-102.66,67.47],[-104.14,62.92],[-105.42,58.27],[-106.48,53.52],[-107.31,48.71],[-107.92,43.84],[-108.28,38.93],[-108.4,34],[-108.28,29.07],[-107.92,24.16],[-107.31,19.29],[-106.48,14.48],[-105.42,9.73],[-104.14,5.08],[-102.66,0.53]],y: 14.4},
  mere_walk_west: {startY: 7.2,pts: [[2.9,107.64],[0.53,107.43],[-1.83,107.17],[-4.2,106.84],[-6.56,106.45],[-8.93,106],[-11.3,105.49],[-13.66,104.92],[-16.02,104.28],[-18.38,103.57],[-20.73,102.79],[-23.09,101.94],[-25.43,101.02],[-27.77,100.03],[-30.1,98.96],[-32.41,97.81],[-34.72,96.58],[-37,95.27],[-39.27,93.87],[-41.52,92.39],[-43.74,90.82],[-45.93,89.16],[-48.08,87.4],[-50.19,85.56],[-52.26,83.61],[-54.28,81.57],[-56.24,79.44],[-58.14,77.2],[-59.96,74.87],[-61.71,72.44],[-63.37,69.92],[-64.94,67.31],[-66.41,64.6],[-67.76,61.82],[-69,58.95],[-70.12,56],[-71.1,52.99],[-71.94,49.92],[-72.64,46.8],[-73.19,43.64],[-73.58,40.45],[-73.82,37.23],[-73.9,34],[-73.82,30.77],[-73.58,27.55],[-73.19,24.36],[-72.64,21.2],[-71.94,18.08],[-71.1,15.01],[-70.12,12],[-69,9.05],[-67.76,6.18],[-66.41,3.4],[-64.94,0.69],[-63.37,-1.92],[-61.71,-4.44],[-59.96,-6.87],[-58.14,-9.2],[-56.24,-11.44],[-54.28,-13.57],[-52.26,-15.61],[-50.19,-17.56],[-48.08,-19.4],[-45.93,-21.16],[-43.74,-22.82],[-41.52,-24.39],[-39.27,-25.87]],y: 7.2},
  ink_stair: {startY: 7.2,pts: [[-72.64,21.2],[-88.43,18.06],[-106.48,14.48]],y: 14.4},
  court_w1_arbours: {startY: 7.2,pts: [[-46.02,90.51],[-47.91,92.84],[-52.96,99.04],[-53.91,100.2],[-56.83,103.76],[-59.08,101.93],[-62.64,99.03],[-66.37,95.99]],y: 7.2},
  court_w2_lemon_court: {startY: 7.2,pts: [[-71.58,53.85],[-74.49,54.57],[-82.25,56.51],[-83.71,56.87],[-86.63,57.55],[-84.9,52.9],[-86.52,46.4],[-88.27,46.42],[-91.32,40.38]],y: 7.2},
  court_w2_clary: {startY: 7.2,pts: [[-71.58,53.85],[-74.49,54.57],[-82.25,56.51],[-83.71,56.87],[-86.63,57.55],[-88.28,57.96],[-85.76,65.58]],y: 7.2},
  court_w3_drying_yard: {startY: 7.2,pts: [[-67.96,3.99],[-70.62,2.59],[-77.69,-1.15],[-79.02,-1.85],[-82.57,-3.69],[-82.04,-9.4],[-78.03,-8.87]],y: 7.2},
  court_w4_rose_garth: {startY: 7.2,pts: [[-44.35,-23.77],[-46.06,-26.24],[-50.63,-32.8],[-51.48,-34.03],[-53.84,-37.51],[-49.82,-40.31]],y: 7.2},
  reading_room: {startY: 7.2,pts: [[-73.46,46.29],[-75.89,46.9],[-77.44,47.29],[-80.25,47.99]],y: 8.4},
  court_cafe: {startY: 7.2,pts: [[-76.28,34.97],[-78.71,35.57],[-80.26,35.96],[-83.08,36.66]],y: 8.4},
  tansy_home: {startY: 14.4,pts: [[-102.5,72.57],[-104.71,73.75],[-106.12,74.5],[-112.64,75.25],[-110.21,79.8],[-109.93,80.33],[-107.9,78.6],[-107.6,76.6]],y: 19.2},
  long_garden: {startY: 14.4,pts: [[-84.11,105.8],[-100.17,114.36],[-108.17,99.36],[-117.58,81.71],[-122.75,72],[-122.81,69.77]],y: 14.4},
  long_garden_orchard: {startY: 14.4,pts: [[-84.11,105.8],[-100.17,114.36],[-103.94,107.3],[-108.8,109.67],[-115.29,97.49]],y: 14.4},
  ada: {startY: 7.2,pts: [[6,212.5],[6,209.5],[6,207.6],[7.4,206.2]],y: 7.2},
  robin_home: {startY: 7.2,pts: [[26,212.5],[26,209.5],[26,207.4],[28.3,202],[28.3,201.3],[27.55,201.3],[23.49,201.3],[22.9,201.3],[23.6,203.6]],y: 12},
  quill: {startY: 7.2,pts: [[38,212.5],[38,209.5],[38,207.6],[39.2,206]],y: 7.2},
  shelf_inn: {startY: 1,pts: [[8,236],[1,236],[-9.6,237],[-18,246],[-27.6,248.6],[-29.74,248.09],[-29.77,244.98],[-27.87,242.79],[-28.01,241.72],[-32.38,240.6],[-33.34,240.36],[-34.17,242.83],[-35.16,246.7]],y: 5.2},
  landing_strand: {startY: 1,pts: [[14.5,245],[24,249],[30,253],[36,249],[39.6,242],[40,236]],y: -0.29},
  // (A-13: to the bench's reading table, council_table now -- its collider 1.45 m to a side, not 1.02)
  burned_shelf: {startY: 21.6,pts: [[-72,168],[-74.5,168],[-76,168],[-78,167],[-80,166.6],[-82,163],[-83.9,162.2]],y: 22.2},
  burned_shelf_books: {startY: 21.6,pts: [[-72,168],[-74.5,168],[-76,168],[-78,168],[-80.6,168],[-80.9,171],[-82.6,173.6],[-84.4,174]],y: 22.2},
  alchemists: {startY: 21.6,pts: [[-72,185],[-76.5,185],[-78,185],[-81.4,185.2]],y: 22.2},
  knoll_garden: {startY: 21.6,pts: [[-47,179],[-47.3,175.5],[-47.3,171.4],[-62,170.8],[-64.8,166.5],[-66,162],[-60,166],[-52,166],[-48.5,161]],y: 21.6},
  long_tower_top: {pts: [[-28,173.5],[-30,174],[-45.5,176],[-49,176.3],[-53,177.2],[-53.5,178],[-56.5,178],[-60,176],[-64,174.2],[-65.6,173.9],[-65.6,176],[-65.6,178.4],[-65.6,180.5],[-65.7,182.6],[-61,182.6],[-58,182.6],[-56.4,182.6],[-56.4,178.04],[-56.4,176],[-56.4,173.4],[-60.96,173.4],[-62.5,173.4],[-65.6,173.4],[-65.6,174],[-65.6,177.96],[-65,178.6],[-60,176.4]],y: 40.2},
  // (A-13, the S3 review: S1's rule -- a must-stop route names the wall that must stop it, `by`, since two
  // S1 routes passed by stopping on a lamp. `byThick`: a case is 0.8 m deep, thicker than a wall's 0.6)
  inn_f1_front: {block: true,startY: 5.2,pts: [[-31.48,247.64],[-27.22,248.73]], by: [-29.2, -27.8, 247.7, 249.1]},
  long_garden_balustrade: {block: true,startY: 14.4,pts: [[-120.59,117.31],[-129.41,122.01]], by: [-125.4, -123.0, 116.6, 122.0]},
  burned_shelf_case: {block: true,startY: 22.2,pts: [[-80.5,165.4],[-86.6,165.4]], by: [-86.8, -85.8, 164.9, 165.9], byThick: 0.45},
  // A-13: the Inn Pier's drawn rail stops a walker at its edge (its collider, now drawn: pier_rail), and
  // the Landing terrace's garden walked from the Landing Lane along its gravel walk to its far end
  inn_pier_edge: {block: true, startY: 1.6, pts: [[-13.87, 241.58], [-17.0, 238.6]], by: [-15.9, -14.8, 239.6, 240.7]},
  // S4 (MM-15, A-14): the causeway's land end -- its ramp's cheeks and the pylons close the ramp's
  // sides and corners, where the floods of S1-S3 stepped off into the sea (x 8 +- 5.5, z 262.25) and
  // S4's walk stepped 0.74 m up its side from the spit; the deck between them stays open
  cw_ramp_w: {block: true, startY: 0.9, pts: [[6.0, 260.4], [1.5, 260.4]], by: [2.4, 3.3, 259.5, 262.5]},
  cw_ramp_e: {block: true, startY: 0.9, pts: [[10.0, 260.4], [14.5, 260.4]], by: [12.7, 13.6, 259.5, 262.5]},
  cw_land_end: {startY: 0.8, pts: [[9.5, 275], [9.5, 262.6], [9.5, 258]], y: 1.0},
  landing_terrace_w: {startY: 7.2, pts: [[-10, 211], [-11.4, 204], [-15.2, 202.6], [-22.9, 200.3], [-28, 199]], y: 7.2},
  landing_terrace: {startY: 7.2, pts: [[40, 212], [46.4, 211.2], [46.6, 205.0], [49.67, 197.07], [57.95, 191.45], [66.2, 185.58], [74.3, 179.83], [82.49, 174.03]], y: 7.2},
  lt_gallery_sealed: {maxY: 40.35,startY: 40.2,pts: [[-60,176.4],[-58,175],[-58,181],[-63,181],[-63,175.2],[-60,178]]},
};

const b = await chromium.launch({ ...CHANNEL, headless: true, args: [...GL_ARGS, '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 800, height: 500 } });
const errors = [];
p.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 300)));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
await p.routeWebSocket('**', () => {});
await p.goto(`${base}/?zone=moonmere&daytime=0.2`, { timeout: 300000 });
await p.waitForFunction(() => window.__zv?.scene?.isReady(), null, { timeout: 300000, polling: 200 });
await p.waitForTimeout(3000);
const out = await p.evaluate(async (routes) => {
  const url = performance.getEntriesByType('resource').map((e) => e.name).find((u) => /\/src\/scene\.ts/.test(new URL(u).pathname));
  const S = await import(url);
  const r = {};
  for (const [name, rt] of Object.entries(routes)) {
    const P = rt.pts;
    let [x, z] = P[0], y = S.groundHeight(x, z, rt.startY ?? -1e9); y = S.groundHeight(x, z, y);
    let maxStep = 0, at = null, stop = null, minY = y, maxY = y; const legs = [];
    // (how far it walks before it first rises 0.02 over where it started: `flatFirst`)
    const y00 = y; let walked = 0, flat = null;
    for (let k = 1; k < P.length && !stop; k++) {
      const [ax, az] = [x, z], [bx, bz] = P[k], n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.1);
      for (let i = 1; i <= n; i++) {
        const tx = ax + (bx - ax) * i / n, tz = az + (bz - az) * i / n;
        const [nx, nz] = S.resolveCollision(x, z, tx, tz, y);
        if (Math.hypot(nx - tx, nz - tz) > 1e-6) { stop = { leg: k, at: [+x.toFixed(2), +z.toFixed(2), +y.toFixed(2)], hit: S.debugHit(tx, tz, y) }; break; }
        const ny = S.groundHeight(nx, nz, y);
        walked += Math.hypot(nx - x, nz - z);
        if (flat === null && ny > y00 + 0.02) flat = walked;
        if (Math.abs(ny - y) > maxStep) { maxStep = Math.abs(ny - y); at = [+nx.toFixed(2), +nz.toFixed(2), +y.toFixed(2), +ny.toFixed(2)]; }
        x = nx; z = nz; y = ny; minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
      legs.push(+y.toFixed(2));
    }
    r[name] = { stop, end: [+x.toFixed(2), +z.toFixed(2), +y.toFixed(2)], maxStep: +maxStep.toFixed(2), maxStepAt: at, legs, minY: +minY.toFixed(2), maxY: +maxY.toFixed(2), flat: flat === null ? null : +flat.toFixed(2) };
  }
  return r;
}, routes);
let bad = 0;
for (const [name, r] of Object.entries(out)) {
  const rt = routes[name], want = rt.y;
  // the box that stopped it, when the route names one
  const near = (b, e, m) => e[0] >= b[0] - m && e[0] <= b[1] + m && e[1] >= b[2] - m && e[1] <= b[3] + m;
  const byOk = !rt.by || (rt.edge && /unwalkable/.test(r.stop?.hit ?? '') && near(rt.by, r.end, 1.2)) || (r.stop?.hit ?? '').split('; ').some((h) => {
    const m = /^box\d+@(-?[\d.]+),(-?[\d.]+) h([\d.]+)x([\d.]+)/.exec(h);
    if (!m) return false;
    const [cx, cz, hx, hz] = m.slice(1).map(Number), [x0, x1, z0, z1] = rt.by;
    // (S2 review: a civic shell's walls and door heads are 0.6 m thick -- WALL_T -- so a wall's
    // section is one half-extent <= 0.35)
    return cx >= x0 && cx <= x1 && cz >= z0 && cz <= z1 && Math.min(hx, hz) <= (rt.byThick ?? 0.35) && Math.max(hx, hz) >= 0.5;
  });
  const ok = rt.block ? !!r.stop && r.maxStep <= STEP && byOk
    : rt.minY !== undefined ? r.minY >= rt.minY
    // (S3: `maxY` -- nothing on the route leads up: the Long Tower's gallery under the sealed room)
    : rt.maxY !== undefined ? r.maxY <= rt.maxY
    : !r.stop && Math.abs(r.end[2] - want) < 0.3 && r.maxStep <= STEP && (rt.flatFirst === undefined || (r.flat ?? 0) >= rt.flatFirst);
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'SNAG'} ${name.padEnd(17)} end ${JSON.stringify(r.end)} (${rt.block ? `must stop${rt.by ? ` at the wall in ${JSON.stringify(rt.by)}${byOk ? '' : ' -- NOT IT'}` : ''}` : rt.minY !== undefined ? `never under ${rt.minY}: low ${r.minY}` : rt.maxY !== undefined ? `never over ${rt.maxY}: high ${r.maxY}` : `want y ${want}`}) maxStep ${r.maxStep} ${r.maxStepAt ? JSON.stringify(r.maxStepAt) : ''}${r.stop ? ` STOP leg ${r.stop.leg} at ${JSON.stringify(r.stop.at)} by ${JSON.stringify(r.stop.hit)}` : ''}`);
  console.log(`     legs ${JSON.stringify(r.legs)}${rt.flatFirst !== undefined ? `; level floor before the first rise ${r.flat} m (want >= ${rt.flatFirst})` : ''}`);
}
if (errors.length) console.log('errors', errors.slice(0, 6));
await Promise.race([b.close(), new Promise((res) => setTimeout(res, 5000))]);
process.exit(bad || errors.length ? 1 : 0);
