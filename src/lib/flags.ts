/** URL debug flags, e.g. `?fx=0&mirrors=0` to isolate rendering features. */
const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
const on = (k: string, def = true) => (q.has(k) ? q.get(k) !== '0' : def);

export const FLAGS = {
  fx: on('fx'),
  mirrors: on('mirrors'),
  env: on('env'),
  intro: on('intro'),
  pdb: on('pdb', false),
  msaa: q.has('msaa') ? Number(q.get('msaa')) : 4,
  /** comma list of effects to keep, e.g. fxl=exp,tm */
  fxl: q.get('fxl')?.split(',') ?? null,
};
