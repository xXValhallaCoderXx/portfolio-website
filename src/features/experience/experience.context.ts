import { createContext } from 'react';
import type { ExperienceView } from '../../domains/portfolio/portfolio.types.ts';

export const OpenExperience = createContext<((id: string, view: ExperienceView) => void) | null>(null);
