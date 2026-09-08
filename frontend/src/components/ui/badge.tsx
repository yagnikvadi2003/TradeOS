import { cva, type VariantProps } from 'class-variance-authority';
import { type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-sm border px-1.5 py-0 text-2xs font-medium leading-4 whitespace-nowrap',
  {
    variants: {
      variant: {
        neutral: 'border-line-strong text-ink-muted',
        accent: 'border-accent/50 text-accent',
        up: 'border-up/40 text-up',
        down: 'border-down/40 text-down',
        info: 'border-info/40 text-info',
        warn: 'border-warn/50 bg-warn/10 text-warn',
        solid: 'border-transparent bg-surface-raised text-ink',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
