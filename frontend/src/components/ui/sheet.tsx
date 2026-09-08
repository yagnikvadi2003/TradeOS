import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { type ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** Left-anchored sheet used for the mobile market navigator. */
export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

export function SheetContent({
  className,
  children,
  title,
  description,
  closeLabel,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
  title: string;
  description: string;
  closeLabel: string;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/60" />
      <DialogPrimitive.Content
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[min(20rem,88vw)] flex-col border-r border-line bg-surface shadow-none outline-none data-[state=open]:sheet-in data-[state=closed]:sheet-out',
          className,
        )}
        {...props}
      >
        <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
        <DialogPrimitive.Description className="sr-only">{description}</DialogPrimitive.Description>
        <DialogPrimitive.Close
          className="absolute top-2 right-2 rounded-sm p-1 text-ink-muted hover:bg-surface-raised hover:text-ink"
          aria-label={closeLabel}
        >
          <X className="size-4" />
        </DialogPrimitive.Close>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
