import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Teach tailwind-merge the custom type scale so `text-lg` and `text-muted` don't collide.
const twMerge = extendTailwindMerge({
  extend: { theme: { text: ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl'] } },
});

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
