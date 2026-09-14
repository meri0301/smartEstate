import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Joins class names and resolves Tailwind conflicts so that a class passed by a
 * caller always wins over the component's own default. Without the merge,
 * `<Button className="px-8">` would produce `px-6 px-8` and the winner would
 * depend on stylesheet order rather than on intent.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
