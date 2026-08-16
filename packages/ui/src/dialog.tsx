import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import {
  forwardRef,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";

import { classNames } from "./internal/class-names";

export type DialogSize = "compact" | "default" | "wide";

export interface DialogProps {
  children?: ReactNode;
  className?: string;
  closeLabel?: string;
  defaultOpen?: boolean;
  description: ReactNode;
  footer?: ReactNode;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  size?: DialogSize;
  title: ReactNode;
  trigger?: ReactElement;
}

export function Dialog({
  children,
  className,
  closeLabel = "Tutup dialog",
  defaultOpen,
  description,
  footer,
  onOpenChange,
  open,
  size = "default",
  title,
  trigger,
}: DialogProps) {
  const rootProps: DialogPrimitive.DialogProps = {
    ...(defaultOpen === undefined ? {} : { defaultOpen }),
    ...(onOpenChange === undefined ? {} : { onOpenChange }),
    ...(open === undefined ? {} : { open }),
  };

  return (
    <DialogPrimitive.Root {...rootProps}>
      {trigger ? (
        <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
      ) : null}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="ks-root ks-dialog__overlay" />
        <DialogPrimitive.Content
          className={classNames("ks-root", "ks-dialog", className)}
          data-size={size}
        >
          <div className="ks-dialog__header">
            <DialogPrimitive.Title className="ks-dialog__title">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="ks-dialog__description">
              {description}
            </DialogPrimitive.Description>
          </div>
          <div className="ks-dialog__body">{children}</div>
          {footer ? <DialogFooter>{footer}</DialogFooter> : null}
          <DialogPrimitive.Close
            aria-label={closeLabel}
            className="ks-dialog__close"
          >
            <X aria-hidden="true" focusable="false" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export interface DialogFooterProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export const DialogFooter = forwardRef<HTMLDivElement, DialogFooterProps>(
  function DialogFooter({ children, className, ...props }, ref) {
    return (
      <div
        {...props}
        className={classNames("ks-dialog__footer", className)}
        ref={ref}
      >
        {children}
      </div>
    );
  },
);

export interface DialogCloseProps {
  children: ReactElement;
}

export function DialogClose({ children }: DialogCloseProps) {
  return <DialogPrimitive.Close asChild>{children}</DialogPrimitive.Close>;
}
