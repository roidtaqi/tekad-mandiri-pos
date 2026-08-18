import React, { useEffect, useRef } from "react";
import { IconButton } from "./button.js";
import { Heading } from "./typography.js";

export interface DrawerProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly children: React.ReactNode;
  readonly position?: "left" | "right";
  readonly size?: "sm" | "md" | "lg" | "xl";
  readonly footer?: React.ReactNode;
}

export function Drawer({
  isOpen,
  onClose,
  title,
  children,
  position = "right",
  size = "md",
  footer,
}: DrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };

    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      className="ks-drawer"
      data-position={position}
      data-size={size}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ks-drawer-content">
        <header className="ks-drawer-header">
          <Heading level={2} size="h2">{title}</Heading>
          <IconButton
            variant="ghost"
            accessibleLabel="Close drawer"
            onClick={onClose}
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
          />
        </header>
        <div className="ks-drawer-body">
          {children}
        </div>
        {footer && <footer className="ks-drawer-footer">{footer}</footer>}
      </div>
    </dialog>
  );
}
