export type SectionId = 'about' | 'experience' | 'projects' | 'skills' | 'contact';
export type DemoId = 'hird' | 'flight' | 'sets';
export type SketchId = 'atoms' | 'payroll' | 'orderbook';
export type ExperienceView = 'ridge' | 'list';

export interface ScreenHighlight { left: number; top: number; width: number; height: number }
export interface ProjectScreen {
  id: string;
  src: string;
  alt: string;
  title: string;
  caption?: string;
  thumbnail?: string;
  orientation?: 'portrait' | 'landscape';
  placeholder?: boolean;
}
export interface ProjectFeature {
  text: string;
  screenId?: string;
  caption?: string;
  highlight?: ScreenHighlight;
}
export interface Project {
  id: string;
  name: string;
  title: string;
  path: string;
  tagline: string;
  status: string;
  year: string;
  platform: string;
  summary: string;
  why?: string;
  built: ProjectFeature[];
  tags: string[];
  links: { label: string; url: string }[];
  image?: { src: string; alt: string; full?: string; tall?: boolean };
  video?: { src: string; poster: string; title?: string; duration: number };
  screens?: ProjectScreen[];
  demo?: DemoId;
  diagram?: string;
  glyph?: string;
  prop?: string;
}
export interface ExperienceEntry {
  hash: string;
  years: string;
  role: string;
  company: string;
  text: string;
  sketch?: SketchId;
  report: { situation: string | string[]; contribution: string | string[]; changed: string | string[] };
}
export interface Waypoint { id: SectionId; title: string; sub: string }
export type DetailAddress =
  | { section: 'projects'; item: Project; path: string }
  | { section: 'experience'; item: ExperienceEntry; path: string };
