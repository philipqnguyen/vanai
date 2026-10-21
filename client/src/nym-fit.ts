// Fixed placement from 33 samples of the packaged idle feet. Walk remains within
// 2mm and sprint within 3mm of the ground at its lowest contact; no per-frame IK.
export const NYM_GROUND_OFFSET = {male:.0087,female:.0102} as const;
// Measured curled-finger clearance; the old .5 prop size overfilled these palms.
export const NYM_WEAPON_SCALE = .3;

// Scalp envelopes measured without antlers: the female cap is about 12% wider/
// deeper, with nearly the same crown height above Head. Fit only cross-body hair
// around the measured scalp centre; native combinations and body bones stay exact.
export const NYM_HAIR_CENTRE={male:[0,.10285,-.00635],female:[0,.10462,-.01342]} as const;
export const NYM_HAIR_SCALE={male:[1,1,1],female:[1.12,1.05,1.12]} as const;
