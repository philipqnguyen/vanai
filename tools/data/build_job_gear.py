#!/usr/bin/env python3
"""Rebuild the approved job-gear catalog, without assigning acquisition routes.

Item values are conservative draft balance, not a simulated claim of optimal gear.
Names and visual directions are explicit; numerical budgets follow the documented
material curves and slot weights in design/gear/JOB-GEAR.md.
"""
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SLOTS = ["head", "body", "legs", "feet"]
WEIGHT = {"head": .48, "body": 1, "legs": .72, "feet": .40}
PROFILES = {
    "PLD": ("chain", {"vit": .20, "hp": .80}, ["Oathbound", "Dawnwatch", "Bastion", "Sunward", "Everwatch"],
            ["Helm", "Hauberk", "Chausses", "Sabatons"], "Layered ring mail, a protective mantle and restrained heraldic trim; the helm frames the face. Reinforcement and ceremonial detail grow with each tier."),
    "SAM": ("chain", {"agi": .14, "str": .10}, ["Reedblade", "Stillwater", "Windborne", "Stormguard", "Horizon"],
            ["Headguard", "Coat", "Legguards", "Boots"], "Flexible ring mail beneath split textile panels, a low headguard and a tied waist. Keep the duelist silhouette mobile; higher tiers add layered borders and articulated guards."),
    "DRK": ("chain", {"str": .20, "vit": .06}, ["Ashen Vow", "Iron Dusk", "Nightward", "Blackthorn", "Eclipse"],
            ["Visor", "Hauberk", "Chausses", "Sabatons"], "Darkened ring mail, angular reinforced edges and a split coat silhouette. Begin utilitarian; build toward imposing layered shoulders and controlled contrast."),
    "BLM": ("cloth", {"int": .24, "mp": .80}, ["Emberstudy", "Cinderweave", "Starfall", "Voidglass", "Astral"],
            ["Pointed Hat", "Robe", "Trousers", "Shoes"], "A pointed crown and broad brim define the mage hat. Long robes use woven fabric, contrasting cuffs and progressively richer celestial embroidery; cloth remains visibly cloth."),
    "WHM": ("cloth", {"mnd": .24, "mp": .80}, ["Mercyweave", "Dawnpetal", "Gracewoven", "Sanctuary", "Daybreak"],
            ["Veil", "Robe", "Trousers", "Shoes"], "Soft open-faced veils and light layered robes, warm ivory cloth and botanical edging. Higher tiers develop graceful drape and richer woven detail without heavy armor."),
    "MNK": ("cloth", {"mnd": .18, "agi": .08, "vit": .04}, ["Breathbound", "Willowstep", "Stillheart", "Cloudstride", "Lotus"],
            ["Headband", "Tunic", "Trousers", "Footwraps"], "Short wrapped tunics, tied sashes, loose gusseted trousers and cloth footwraps keep the battle-healer free to move. Embroidery and layered cloth improve with tier; no long mage robe."),
}

def rounded(value):
    return math.floor(value + .5)

def make_item(job, tier, level, slot, intermediate=False):
    material, rates, names, nouns, direction = PROFILES[job]
    index = SLOTS.index(slot)
    # Same-level common material curves, with offensive chain trading defense.
    slopes = {"cloth": [.24, .62, .47, .30], "chain": [.60, 1.05, .78, .55]}[material]
    defense = rounded(slopes[index] * level + (2 if slot in ("head", "body") else 1))
    if job in ("SAM", "DRK"):
        defense -= rounded(level * (.06 if job == "SAM" else .10) * WEIGHT[slot])
    stats = {key: max(1, rounded(rate * level * WEIGHT[slot])) for key, rate in rates.items()}
    prefix = names[tier - 1]
    name = f"{prefix}{' Waymark' if intermediate else ''} {nouns[index]}"
    item = {"name": name, "slot": slot, "atype": material, "allowed_jobs": [job], "lvl": level,
            "rarity": "uncommon", "def": defense, "stats": stats,
            "desc": f"{prefix} job attire. " + ("An individual refinement between milestone sets." if intermediate else "Part of a four-piece job milestone set.")}
    return item, direction

def keep_prices(previous, item):
    """Prices belong to the acquisition pass, not to the catalog: carry them over."""
    for field in ("price", "price_sell"):
        if previous and field in previous:
            item = {**{k: v for k, v in item.items() if k != "desc"}, field: previous[field], "desc": item["desc"]}
    return item

def main():
    path = ROOT / "shared/data/items.json"
    items = json.loads(path.read_text())
    decisions_path = ROOT / "design/gear/acquisition.json"
    decisions = json.loads(decisions_path.read_text())
    records = {}
    for job in PROFILES:
        for tier in range(1, 6):
            milestone = tier * 10
            for slot in SLOTS:
                key = f"calling_{job.lower()}_{milestone}_{slot}"
                item, direction = make_item(job, tier, milestone, slot)
                records[key] = {"job": job, "kind": "milestone", "setLevel": milestone, "artDirection": direction}
                items[key] = keep_prices(items.get(key), item)
            if tier < 5:
                pair = [(4, "head"), (7, "feet")] if tier % 2 else [(4, "body"), (7, "legs")]
                for offset, slot in pair:
                    level = milestone + offset
                    key = f"calling_{job.lower()}_{level}_{slot}"
                    item, direction = make_item(job, tier, level, slot, True)
                    items[key] = keep_prices(items.get(key), item)
                    records[key] = {"job": job, "kind": "individual", "setLevel": milestone, "artDirection": direction}
    # Visual redesigns are independent of item stats and survive catalog regeneration.
    for brief in ("level20-redesign-prompts.json", "level10-job-redesign-prompts.json"):
        art_path = ROOT / "design/gear/batches" / brief
        if art_path.exists():
            for entry in json.loads(art_path.read_text())["items"]:
                if entry["id"] in records:
                    records[entry["id"]]["artDirection"] = entry["artDirection"]
    # A piece the data already routes (vendor stock, recipe, drop, quest reward)
    # needs no override; design/gear/acquisition.json holds only the rest.
    routed = "\n".join((ROOT / f"shared/data/{name}.json").read_text() for name in ("zones", "quests", "monsters", "recipes"))
    for key in records:
        if f'"{key}"' in routed: continue
        decisions["items"].setdefault(key, {"status": "undecided", "note": "Job gear design approved for catalog development. Acquisition will be decided separately; no quest, shop, drop or recipe is assigned."})
    assert len(records) == 168
    path.write_text(json.dumps(items, indent=2) + "\n")
    decisions_path.write_text(json.dumps(decisions, indent=2) + "\n")
    (ROOT / "design/gear/job-sets.json").write_text(json.dumps({"schemaVersion": 1, "items": records}, indent=2) + "\n")
    print("Added/updated 120 milestone pieces and 48 individual upgrades; prices and acquisition overrides kept.")

if __name__ == "__main__":
    main()
