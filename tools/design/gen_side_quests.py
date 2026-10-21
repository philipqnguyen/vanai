#!/usr/bin/env python3
"""Splice the 'Side Quests' tab into design/the-empty-throne.html from shared/data.

    python3 tools/design/gen_side_quests.py

then republish design/the-empty-throne.html to the same artifact URL (memory:
world-story-pivot). Run it after any change to the side quests.
Idempotent: regenerates between SIDEQUESTS:START/END markers; adds the tab
button, panel, CSS and script entries on first run."""
import json, html, re, collections, os
R = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))) + "/"
D = R + "shared/data/"
q = json.load(open(D + "quests.json")); z = json.load(open(D + "zones.json"))
it = json.load(open(D + "items.json")); m = json.load(open(D + "monsters.json"))
NODE_ITEM = {"herb": "lamproot", "ore": "glimmer_ore", "reed": "mere_reed", "windfall": "windfall_apple", "spines": "book_spine"}

npc = {}; npc_zone = {}; lm_zone = {}; obj_zone = {}; camps = collections.defaultdict(set); node_zones = collections.defaultdict(set)
for zk, zv in z.items():
    for n in zv.get("npcs", []): npc[n["id"]] = n; npc_zone[n["id"]] = zk
    for l in zv.get("landmarks", []): lm_zone[l["id"]] = zk
    for o in zv.get("interactables", []): obj_zone[o["id"]] = zk
    for w in zv.get("milestones", []): obj_zone[w["id"]] = zk
    for c in zv.get("camps", []): camps[c["monster"]].add(zk)
    for n in zv.get("nodes", []): node_zones[NODE_ITEM[n["kind"]]].add(zk)
drops = collections.defaultdict(set)
for mk, mv in m.items():
    for d in mv["drops"]:
        for zk in camps.get(mk, ()): drops[d["item"]].add(zk)

def dest_zones(qq):
    o = qq["objective"]; out = set()
    for t in o["targets"]:
        if o["type"] == "kill": out |= camps.get(t, set())
        elif o["type"] == "collect": out |= drops.get(t, set()) | node_zones.get(t, set())
        elif o["type"] == "talk": out.add(npc_zone.get(t))
        elif o["type"] == "reach": out.add(lm_zone.get(t))
        elif o["type"] == "interact": out.add(obj_zone.get(t))
    out.discard(None); return out

ORDER = ["caerdun", "heartwood", "moonmere", "caerdunfields", "heartwoodfields", "moonmereshores", "northroad", "shoreroad",
         "huntingwood", "timberestates", "summerlakes", "reservoir", "kingsgardens", "glassworks", "canalworks", "granaryplains",
         "borderwall", "burnedland", "capital", "capitalreturned"]
HUE = {"caerdun": "c-caerdun", "heartwood": "c-heartwood", "moonmere": "c-moonmere", "caerdunfields": "c-caerdun", "heartwoodfields": "c-heartwood",
       "moonmereshores": "c-moonmere", "capital": "c-empire", "capitalreturned": "c-empire"}
LEDE = {
    "caerdun": "The soldier city's own ledger: the guild teaches the ore, the armourer wants the far provinces' plate, the paymaster wants the Regent's signature, and the marshal wants the Mausoleum held. Every quest here sends you out of the city and brings you back to it.",
    "heartwood": "Grudges, songs and the wood's own materials. The woodwrights teach the bench, the ring counts, the grudge-keeper keeps appointments under the Overseer's Lodge, and the elders want the verses back from the places they belong to.",
    "moonmere": "The academy's errands: sunroot and sprite dust for the alchemists, ledgers read in three dungeons for the archivist, the ballroom closed for the Provost, and fire taught in the room where it happened.",
    "capitalreturned": "The morning after. A city three hundred years confused, and the household finding out it includes you. The Regent, off duty, has one thing left to say the word to.",
    "capital": "The empty city, before the morning: what the three who walked in with you want read, climbed and opened.",
}
byzone = collections.defaultdict(list)
for k, v in q.items():
    if k.startswith("s_"): byzone[npc_zone[v["giver"]]].append((k, v))
chains = {v["next"]: k for k, v in q.items() if k.startswith("s_") and isinstance(v.get("next"), str)}

def esc(s): return html.escape(s, quote=False)
def item_name(i): return it[i]["name"]
def reward(v):
    r = v["rewards"]; parts = []
    c = collections.Counter(r["items"])
    parts += [f"{item_name(i)}" + (f" &times;{n}" if n > 1 else "") for i, n in c.items()]
    parts.append(f"{r['gold']} gold")
    s = ", ".join(esc(p) if "&times;" not in p else p for p in parts)
    if r.get("title"): s += f' &middot; the title <b>&ldquo;{esc(r["title"])}&rdquo;</b>'
    return s

total = sum(len(v) for v in byzone.values())
bands = collections.Counter((v["min_lvl"] - 1) // 10 for zv in byzone.values() for _, v in zv)
out = []
out.append(f'''<section class="qchapter">
  <span class="eyebrow">The register &middot; {total} side quests</span>
  <p class="lede">Every side quest in the game, by where it is given. The three cities carry the long ladders &mdash; level 1 to 44, and each one sends you out across the provinces and back &mdash; the returned Capital its own, and every field zone a handful of its own work, most of it into the dungeon at its door. <em>Where</em> names the zone the quest actually sends you to; a chain mark (&#8677;) means the next quest opens when this one is handed in.</p>
  <div class="bands" aria-label="Quests by level band">''')
for b in range(5):
    out.append(f'<span><b>{bands[b]}</b> at {b*10+1}&ndash;{b*10+10}</span>')
out.append('''  </div>
  <div class="ledgerbar" role="group" aria-label="Filter the register">
    <label>Levels
      <select id="sq-band">
        <option value="">all</option>
        <option value="0">1 to 10</option><option value="1">11 to 20</option><option value="2">21 to 30</option><option value="3">31 to 40</option><option value="4">41 to 50</option>
      </select>
    </label>
    <label>Find <input id="sq-find" type="search" placeholder="a giver, a zone, a name" autocomplete="off"></label>
    <span id="sq-count" class="qmeta"></span>
  </div>
</section>''')

for zk in ORDER:
    rows = sorted(byzone.get(zk, []), key=lambda kv: (kv[1]["min_lvl"], kv[0]))
    if not rows: continue
    zv = z[zk]
    lv = [v["min_lvl"] for _, v in rows]
    name = zv["name"] if zk != "capital" else "The Capital, empty"
    if zk == "capitalreturned": name = "The Capital, returned"
    lede = LEDE.get(zk, "")
    out.append(f'''<section class="qchapter ledger wide {HUE.get(zk, "c-field")}" data-zone="{zk}">
  <span class="eyebrow">{esc(zv.get("region", ""))} &middot; levels {min(lv)}&ndash;{max(lv)} &middot; {len(rows)} quests</span>
  <h2>{esc(name)}</h2>''')
    if lede: out.append(f'  <p class="lede">{esc(lede)}</p>')
    out.append('''  <div class="scroller"><table class="sq">
    <thead><tr><th scope="col">Lvl</th><th scope="col">Quest</th><th scope="col">Given by</th><th scope="col">Where</th><th scope="col">The ask</th><th scope="col">Pays</th></tr></thead>
    <tbody>''')
    for k, v in rows:
        g = npc[v["giver"]]
        dz = dest_zones(v)
        where = "here" if dz == {zk} else ", ".join(sorted(z[d]["name"].replace("The Capital of Vanai", "the Capital") for d in dz))
        if zk in dz and dz != {zk}: where = "here, and " + ", ".join(sorted(z[d]["name"] for d in dz if d != zk))
        chain = ' <span class="chain" title="opens the next quest">&#8677;</span>' if isinstance(v.get("next"), str) else ""
        follows = ' <span class="chain follows" title="opens after the quest above">&#8626;</span>' if k in chains else ""
        text = " ".join([v["name"], g["name"], g.get("title", ""), where, v["objective"]["label"], z[zk]["name"]]).lower()
        out.append(f'''      <tr data-lvl="{v['min_lvl']}" data-text="{esc(text)}">
        <td class="lvl">{v['min_lvl']}</td>
        <td class="qname">{esc(v['name'])}{follows}{chain}</td>
        <td>{esc(g['name'])}<span class="giver">{esc(g.get('title', ''))}</span></td>
        <td class="where">{esc(where) if '&' not in where else where}</td>
        <td class="ask">{esc(v['objective']['label'])}</td>
        <td class="pays">{reward(v)}</td>
      </tr>''')
    out.append('    </tbody>\n  </table></div>\n</section>')
body = "\n".join(out)

CSS = '''<style>
  /* the side quests: a register, read across, not down */
  .ledgerbar {
    display: flex; flex-wrap: wrap; gap: 0.6rem 1.4rem; align-items: center;
    margin: 1.4rem 0 0; padding: 0.7rem 0.9rem;
    background: var(--panel); border: 1px solid var(--line); border-radius: 2px;
    font-family: "Alegreya Sans", system-ui, sans-serif; font-size: 0.9rem; color: var(--text-dim);
  }
  .ledgerbar label { display: flex; align-items: center; gap: 0.5rem; }
  .ledgerbar select, .ledgerbar input {
    font: inherit; color: var(--text); background: var(--panel-2);
    border: 1px solid var(--line); border-radius: 2px; padding: 0.3rem 0.5rem;
  }
  .ledgerbar input { min-width: 14rem; }
  .ledgerbar select:focus-visible, .ledgerbar input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .ledgerbar #sq-count { margin-left: auto; }
  .ledger h2 { color: var(--hue, var(--text)); }
  .c-field { --hue: var(--empire); }
  .c-empire { --hue: var(--empire); }
  .ledger table.sq { min-width: 52rem; }
  .ledger .sq th:first-child, .ledger .sq td.lvl { text-align: right; padding-right: 0.9rem; font-variant-numeric: tabular-nums; }
  .ledger .sq td.lvl { font-family: "Cinzel", serif; color: var(--hue, var(--accent)); }
  .ledger .sq td.qname { font-weight: 700; color: var(--text); white-space: nowrap; }
  .ledger .sq td .giver { display: block; font-size: 0.8rem; color: var(--text-dim); }
  .ledger .sq td.where { color: var(--text-dim); font-style: italic; }
  .ledger .sq td.ask { min-width: 16rem; }
  .ledger .sq td.pays { color: var(--text-dim); min-width: 11rem; }
  .ledger .sq td.pays b { color: var(--accent); font-weight: 700; }
  .chain { color: var(--accent); font-weight: 400; }
  .chain.follows { color: var(--text-dim); }
  .ledger[hidden], .sq tr[hidden] { display: none; }
  .ledger .sq tbody tr:nth-child(even) td { background: color-mix(in srgb, var(--panel) 55%, transparent); }
</style>'''

PANEL_OPEN = '''<div id="view-side" role="tabpanel" aria-labelledby="tab-side" hidden>
  <div class="page" style="padding-top:3.4rem;">
    <span class="eyebrow">The side quests &middot; every zone &middot; levels 1&ndash;49</span>
    <h1 style="font-size:clamp(1.8rem,4.5vw,2.6rem); margin-top:0.4rem;">The Side Quests</h1>
    <p class="lede">What the courts, the guilds, the innkeepers and the people at the gates will pay you to do, besides the story. The main story is one book; these are the receipts around it &mdash; a hide for a hauberk, a ledger read in a drowned pumping house, a wolf that took a coach's lead mule at dusk.</p>
    <!-- SIDEQUESTS:START -->
'''
PANEL_CLOSE = '''<!-- SIDEQUESTS:END -->
  </div>
</div>

<script>
(function () {
  var band = document.getElementById("sq-band"), find = document.getElementById("sq-find"), count = document.getElementById("sq-count");
  if (!band) return;
  function apply() {
    var b = band.value === "" ? -1 : Number(band.value), needle = find.value.trim().toLowerCase(), shown = 0;
    document.querySelectorAll("section.ledger").forEach(function (sec) {
      var any = false;
      sec.querySelectorAll("tr[data-lvl]").forEach(function (tr) {
        var lvl = Number(tr.getAttribute("data-lvl"));
        var ok = (b < 0 || Math.floor((lvl - 1) / 10) === b) && (!needle || tr.getAttribute("data-text").indexOf(needle) >= 0);
        tr.hidden = !ok; if (ok) { any = true; shown++; }
      });
      sec.hidden = !any;
    });
    count.textContent = shown + " of ''' + str(total) + ''' side quests";
  }
  band.addEventListener("change", apply); find.addEventListener("input", apply); apply();
})();
</script>
'''

p = R + "design/the-empty-throne.html"; s = open(p).read()
if "SIDEQUESTS:START" in s:
    s = re.sub(r"<!-- SIDEQUESTS:START -->\n.*?<!-- SIDEQUESTS:END -->", lambda _: "<!-- SIDEQUESTS:START -->\n" + body + "\n<!-- SIDEQUESTS:END -->", s, flags=re.S)
else:
    btn = '  <button id="tab-quests" role="tab" aria-selected="false" aria-controls="view-quests">The Main Story</button>\n'
    assert btn in s
    s = s.replace(btn, btn + '  <button id="tab-side" role="tab" aria-selected="false" aria-controls="view-side">Side Quests</button>\n')
    anchor = "<!-- QUESTS:END -->\n  </div>\n</div>\n"
    assert anchor in s
    s = s.replace(anchor, anchor + "\n" + CSS + "\n\n" + PANEL_OPEN + body + "\n" + PANEL_CLOSE)
    s = s.replace('quests: document.getElementById("view-quests"), art:', 'quests: document.getElementById("view-quests"), side: document.getElementById("view-side"), art:')
    s = s.replace('quests: document.getElementById("tab-quests"), art:', 'quests: document.getElementById("tab-quests"), side: document.getElementById("tab-side"), art:')
    s = s.replace('  if (location.hash === "#quests") show("quests");\n', '  if (location.hash === "#quests") show("quests");\n  if (location.hash === "#side") show("side");\n')
    assert 'side: document.getElementById("view-side")' in s and 'show("side")' in s
open(p, "w").write(s)
print(f"{total} side quests in {sum(1 for zk in ORDER if byzone.get(zk))} sections; file {len(s)} bytes")
