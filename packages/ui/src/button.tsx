import { LoaderCircle } from "lucide-react";
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";

import { classNames } from "./internal/class-names";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "destructive";
export type ButtonSize = "compact" | "default" | "large";

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  fullWidth?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      children,
      className,
      disabled = false,
      fullWidth = false,
      loading = false,
      loadingLabel = "Memuat",
      size = "default",
      type = "button",
      variant = "primary",
      ...props
    },
    ref,
  ) {
    const isDisabled = disabled || loading;

    return (
      <button
        {...props}
        aria-busy={loading || undefined}
        className={classNames("ks-button", className)}
        data-full-width={fullWidth || undefined}
        data-loading={loading || undefined}
        data-size={size}
        data-variant={variant}
        disabled={isDisabled}
        ref={ref}
        type={type}
      >
        {loading ? (
          <LoaderCircle
            aria-hidden="true"
            className="ks-button__spinner"
            focusable="false"
          />
        ) : null}
        <span className="ks-button__content">{children}</span>
        {loading ? (
          <span aria-live="polite" className="ks-sr-only">
            {loadingLabel}
          </span>
        ) : null}
      </button>
    );
  },
);

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "children"> {
  accessibleLabel: string;
  icon: ReactNode;
  loading?: boolean;
  loadingLabel?: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    {
      accessibleLabel,
      className,
      disabled = false,
      icon,
      loading = false,
      loadingLabel = "Memuat",
      size = "default",
      type = "button",
      variant = "ghost",
      ...props
    },
    ref,
  ) {
    const isDisabled = disabled || loading;

    return (
      <button
        {...props}
        aria-busy={loading || undefined}
        aria-label={loading ? loadingLabel : accessibleLabel}
        className={classNames("ks-icon-button", className)}
        data-loading={loading || undefined}
        data-size={size}
        data-variant={variant}
        disabled={isDisabled}
        ref={ref}
        type={type}
      >
        {loading ? (
          <LoaderCircle
            aria-hidden="true"
            className="ks-icon-button__spinner"
            focusable="false"
          />
        ) : (
          <span aria-hidden="true" className="ks-icon-button__icon">
            {icon}
          </span>
        )}
      </button>
    );
  },
);
