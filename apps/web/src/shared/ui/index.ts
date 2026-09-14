/**
 * Public API of the design-system layer.
 *
 * Features and pages import primitives from here, never from the individual
 * files, so the surface stays reviewable and a primitive can be restructured
 * without touching its callers.
 */
export { Badge, type BadgeProps } from './Badge.js';
export { Button, type ButtonProps } from './Button.js';
export { Card, CardBody, CardFooter, CardHeader, type CardProps } from './Card.js';
export { cn } from './cn.js';
export { controlClassName, Field, useFieldIds, type FieldIds, type FieldProps } from './Field.js';
export { Input, Textarea, type InputProps, type TextareaProps } from './Input.js';
export { Modal, type ModalProps } from './Modal.js';
export { Select, type SelectOption, type SelectProps } from './Select.js';
export { Skeleton, SkeletonText, type SkeletonProps, type SkeletonTextProps } from './Skeleton.js';
export { Spinner } from './Spinner.js';
export { Tabs, type TabItem, type TabsProps } from './Tabs.js';
export {
  applyTheme,
  isThemePreference,
  readStoredTheme,
  resolveTheme,
  storeTheme,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from './theme.js';
export { ToastProvider, useToast, type ToastOptions, type ToastTone } from './Toast.js';
export { Tooltip, type TooltipPlacement, type TooltipProps } from './Tooltip.js';
export { Heading, Text, type HeadingProps, type TextProps } from './typography.js';
