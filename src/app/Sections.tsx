import type { ComponentType } from 'react';
import type { SectionId } from '../domains/portfolio/portfolio.types.ts';
import { AboutBody, ContactBody, SkillsBody } from '../features/home/components/Sections.tsx';
import ProjectsBody from '../features/projects/components/ProjectsSection.tsx';
import Experience from '../features/experience/components/Experience.tsx';

/** The application composes section renderers shared by the page and flight. */
export const BODIES: Record<SectionId, ComponentType> = {
  about: AboutBody, experience: Experience, projects: ProjectsBody, skills: SkillsBody, contact: ContactBody,
};
