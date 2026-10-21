// Run against an isolated preview. Requires Playwright or PLAYWRIGHT_MODULE.
// node tools/qa/glassworks_liquids.mjs http://localhost:5173 /tmp/glassworks-liquid-qa
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium,CHANNEL,GL_ARGS,QA_BASE} from './lib/playwright.mjs';
const base = process.argv[2] || QA_BASE;
const out = process.argv[3] || '/tmp/glassworks-liquid-qa';
fs.mkdirSync(out, { recursive: true });
(async () => {
    const b = await chromium.launch({ ...CHANNEL, args: [...GL_ARGS, '--ignore-gpu-blocklist'] });
    const p = await b.newPage({ viewport: { width: 1440, height: 950 } });
    await p.goto(`${base}/?zone=glassworks&at=95,-140&eye=50&look=172,-35&looky=-1&daytime=0.25`);
    await p.waitForFunction(() => window.__zv?.scene.isReady());
    await p.waitForTimeout(5000);
    const report = await p.evaluate(() => {
        const v = __zv, s = v.scene;
        const scan = (name) => {
            const m = s.getMeshByName(name), pos = m.getVerticesData('position'), uv = m.getVerticesData('uv'), tex = m.material.opacityTexture, size = tex.getSize(), data = tex.getContext().getImageData(0, 0, size.width, size.height).data;
            let wet = 0, bridged = 0;
            const leaks = [];
            for (let i = 0; i < pos.length / 3; i++) {
                const a = data[(Math.min(size.height - 1, Math.round(uv[i * 2 + 1] * (size.height - 1))) * size.width + Math.min(size.width - 1, Math.round(uv[i * 2] * (size.width - 1)))) * 4] / 255;
                if (a < .02)
                    continue;
                const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
                wet++;
                if (v.walkable(x, z)) {
                    if (v.ground(x, z) > y + .2 && Math.abs(z - 10) <= 2.5 && Math.abs(x + 75) < 14)
                        bridged++;
                    else
                        leaks.push({ x, y, z, a, ground: v.ground(x, z) });
                }
            }
            return { wet, bridged, leaks };
        };
        const river = s.getMeshByName('gw_melt'), rp = river.getVerticesData('position'), rows = rp.length / 3 / 17;
        const banks = [];
        const trace = (x, z, nx, nz, label) => {
            let start = null;
            for (let d = 12; d <= 25; d += 1) {
                const px = x + nx * d, pz = z + nz * d;
                if (v.walkable(px, pz) && v.debugHit(px, pz, v.ground(px, pz)) === 'clear') {
                    start = [px, pz, d];
                    break;
                }
            }
            if (!start)
                return { label, skip: 'no free dry start' };
            let [px, pz, d] = start, y = v.ground(px, pz), stop = null;
            for (let k = 0; k < Math.ceil(d / .1) + 2; k++) {
                const tx = px - nx * .1, tz = pz - nz * .1, [rx, rz] = v.resolveCollision(px, pz, tx, tz, y);
                if (Math.hypot(rx - tx, rz - tz) > .015) {
                    stop = { x: px, z: pz, refusedWalkable: v.walkable(tx, tz), reason: v.debugHit(tx, tz, y) };
                    break;
                }
                px = rx;
                pz = rz;
                y = v.ground(px, pz, y);
            }
            return { label, start, stop, reached: Math.hypot(px - x, pz - z) < .5 };
        };
        for (const t of [.12, .25, .4, .55, .7, .83]) {
            const r = Math.floor(t * (rows - 1)), i = (r * 17 + 8) * 3, j = ((r + 1) * 17 + 8) * 3, x = rp[i], z = rp[i + 2], dx = rp[j] - x, dz = rp[j + 2] - z, len = Math.hypot(dx, dz);
            for (const side of [-1, 1])
                banks.push(trace(x, z, -dz / len * side, dx / len * side, `river ${t} ${side}`));
        }
        const pond = s.getMeshByName('gw_pond'), pp = pond.getVerticesData('position'), cx = 172, cz = -35;
        const perimeter = [];
        for (let n = 0; n < 32; n++) {
            const a = n * 2 * Math.PI / 32, dx = Math.cos(a), dz = Math.sin(a);
            let start = 65;
            while (start > 0 && v.walkable(cx + dx * start, cz + dz * start))
                start -= .25;
            const edge = start;
            perimeter.push(trace(cx + dx * (edge - 3), cz + dz * (edge - 3), dx, dz, `pond ${n}`));
        }
        const seam = Array.from({ length: 7 }, (_, k) => {
            const r = rows - 1 - k, i = (r * 17 + 8) * 3;
            return { x: rp[i], z: rp[i + 2], riverY: rp[i + 1], pondY: pp[1], gap: rp[i + 1] - pp[1] };
        });
        return { river: scan('gw_melt'), pond: scan('gw_pond'), banks, perimeter, seam };
    });
    fs.writeFileSync(path.join(out, 'liquid-audit.json'), JSON.stringify(report, null, 2));
    await p.screenshot({ path: path.join(out, 'pond.png') });
    assert.ok(report.river.wet > 3000 && report.pond.wet > 6000, 'sample both rendered liquid surfaces');
    assert.equal(report.river.leaks.length, 0, 'no exposed river samples permit standing');
    assert.equal(report.pond.leaks.length, 0, 'no pond samples permit standing, including the fringe');
    assert.ok(report.river.bridged > 0, 'bridge overrides hazardous terrain');
    assert.ok(report.banks.length === 12 && report.banks.every(b => b.stop && !b.stop.refusedWalkable && !b.reached), 'both banks reject collision-driven entry');
    assert.ok(report.perimeter.every(b => !b.reached), 'no perimeter approach reaches the pond');
    assert.ok(report.perimeter.filter(b => b.stop && !b.stop.refusedWalkable).length >= 28, 'direct pond-bank entry checks, excluding inlet and rocks');
    assert.equal(report.seam[0].gap, 0, 'river endpoint and pond water levels agree');
    const spawnSamples = JSON.parse(execFileSync(process.env.RUBY || 'ruby', [fileURLToPath(new URL('./glassworks_spawns.rb', import.meta.url))], { maxBuffer: 16 * 1024 * 1024 }));
    const spawns = await p.evaluate(camps => camps.map(c => {
        const blocked = c.points.filter(([x, z]) => !__zv.walkable(x, z)).length;
        let discSamples = 0, discBlocked = 0, obstructions = 0;
        // Initial spawn, respawn, and idle wandering all sample the full radius.
        // Check a dense disc and its perimeter, beyond the randomized samples.
        const check = (x, z) => {
            discSamples++;
            if (!__zv.walkable(x, z)) discBlocked++;
            else if (__zv.debugHit(x, z, __zv.ground(x, z)) !== 'clear') obstructions++;
        };
        for (let dx = -c.radius; dx <= c.radius; dx += .5)
            for (let dz = -c.radius; dz <= c.radius; dz += .5)
                if (Math.hypot(dx, dz) <= c.radius) check(c.x + dx, c.z + dz);
        for (let a = 0; a < 2 * Math.PI; a += Math.PI / 720)
            check(c.x + c.radius * Math.cos(a), c.z + c.radius * Math.sin(a));
        return { index: c.index, monster: c.monster, x: c.x, z: c.z, radius: c.radius, serverSamples: c.points.length, blocked, discSamples, discBlocked, obstructions };
    }), spawnSamples);
    fs.writeFileSync(path.join(out, 'spawn-audit.json'), JSON.stringify(spawns, null, 2));
    assert.ok(spawns.every(c => c.blocked === 0 && c.discBlocked === 0), 'every complete camp disc clears unwalkable liquid');
    assert.equal(spawns[7].obstructions, 0, 'relocated glass-wasp disc also clears props');
    assert.equal(spawns[15].obstructions, 0, 'Mirror Stag disc also clears props');
    // Existing shallow pond callers must remain wadeable.
    await p.goto(`${base}/?zone=summerlakes&daytime=0.25`);
    await p.waitForFunction(() => window.__zv?.scene.isReady());
    const defaults = await p.evaluate(() => ['sl_lily1', 'sl_lily2'].map(name => {
        const m = __zv.scene.getMeshByName(name), p = m.getVerticesData('position'), cx = p[0], cz = p[2];
        let failures = 0;
        for (let x = -5; x <= 5; x++)
            for (let z = -5; z <= 5; z++)
                if (!__zv.walkable(cx + x, cz + z))
                    failures++;
        return { name, failures };
    }));
    assert.ok(defaults.every(p => p.failures === 0), 'existing default shallow ponds remain wadeable');
    const summary = { riverWetSamples: report.river.wet, pondWetSamples: report.pond.wet, bridgeSamples: report.river.bridged, bankEntries: 12, pondBankEntries: report.perimeter.filter(b => b.stop && !b.stop.refusedWalkable).length, pondOtherApproaches: report.perimeter.filter(b => !b.stop || b.stop.refusedWalkable).map(b => ({ label: b.label, reason: b.stop?.reason || b.skip })), spawns, defaults };
    fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary));
    await b.close();
    process.exit(0);
})();
