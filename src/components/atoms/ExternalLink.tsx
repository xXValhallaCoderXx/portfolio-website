import type { ComponentPropsWithoutRef } from 'react';

export default function ExternalLink(props: ComponentPropsWithoutRef<'a'>) {
  return <a target="_blank" rel="noreferrer" {...props} />;
}
