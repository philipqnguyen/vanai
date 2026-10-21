// An explicit job list narrows material/weapon eligibility; it never overrides it.
export function gearJobs(item: any, jobs: Record<string, any>, order: string[]): string[] {
  if (!item) return [];
  let eligible = order.slice();
  if (item.slot === "weapon") eligible = eligible.filter(j => jobs[j]?.weapon_type === item.wtype);
  else if (["head", "body", "legs", "feet"].includes(item.slot) && item.atype !== "any")
    eligible = eligible.filter(j => (jobs[j]?.armor || []).includes(item.atype));
  if (Object.prototype.hasOwnProperty.call(item, "allowed_jobs"))
    eligible = Array.isArray(item.allowed_jobs) ? eligible.filter(j => item.allowed_jobs.includes(j)) : [];
  return eligible;
}
