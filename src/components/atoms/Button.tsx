import type { ComponentPropsWithRef } from 'react';

/** Native semantics and attributes, with the site's shared button presentation. */
export default function Button({ type = 'button', ...props }: ComponentPropsWithRef<'button'>) {
  return <button type={type} {...props} />;
}
