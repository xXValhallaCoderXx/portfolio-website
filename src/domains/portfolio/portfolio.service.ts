import { EXPERIENCE, PROJECTS } from './content.ts';
import type { DetailAddress, ExperienceEntry, Project } from './portfolio.types.ts';

export const projectById = (id: string): Project | null => PROJECTS.find((project) => project.id === id) ?? null;
export const experienceByHash = (hash: string): ExperienceEntry | null => EXPERIENCE.find((entry) => entry.hash === hash) ?? null;

export function detailAt(pathname: string): DetailAddress | null {
  const [, section, id] = pathname.match(/^\/(projects|experience)\/([^/]+)\/?$/) ?? [];
  if (section === 'projects') {
    const item = projectById(id);
    return item ? { section, item, path: item.path } : null;
  }
  if (section === 'experience') {
    const item = experienceByHash(id);
    return item ? { section, item, path: `experience.log/${id}` } : null;
  }
  return null;
}

export function nextProject(project: Project): Project {
  return PROJECTS[(PROJECTS.indexOf(project) + 1) % PROJECTS.length];
}

export function yearSpan(dates: string): string {
  const years = dates.match(/\d{4}/g) ?? [];
  const first = years[0] ?? '';
  const last = dates.includes('now') ? 'now' : years.at(-1) ?? first;
  return first === last ? first : `${first}–${last === 'now' ? last : last.slice(2)}`;
}
