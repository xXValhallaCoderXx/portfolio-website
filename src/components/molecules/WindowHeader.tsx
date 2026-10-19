import type { ReactNode } from 'react';
import TerminalLights from '../atoms/TerminalLights.tsx';

export default function WindowHeader({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return <header><TerminalLights /><span>{title}</span>{children}</header>;
}
