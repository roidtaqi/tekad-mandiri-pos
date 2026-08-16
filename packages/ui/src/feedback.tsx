import {
  CircleAlert,
  Info,
  OctagonAlert,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import { classNames } from "./internal/class-names";

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  tone?: BadgeTone;
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { children, className, tone = "neutral", ...props },
  ref,
) {
  return (
    <span
      {...props}
      className={classNames("ks-badge", className)}
      data-tone={tone}
      ref={ref}
    >
      {children}
    </span>
  );
});

export type Severity = "INFO" | "WARNING" | "REVIEW_REQUIRED" | "CRITICAL";

const severityLabels: Record<Severity, string> = {
  CRITICAL: "Kritis",
  INFO: "Informasi",
  REVIEW_REQUIRED: "Perlu Ditinjau",
  WARNING: "Peringatan",
};

const severityIcons: Record<Severity, LucideIcon> = {
  CRITICAL: OctagonAlert,
  INFO: Info,
  REVIEW_REQUIRED: CircleAlert,
  WARNING: TriangleAlert,
};

export interface SeverityBadgeProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  severity: Severity;
}

export const SeverityBadge = forwardRef<HTMLSpanElement, SeverityBadgeProps>(
  function SeverityBadge({ className, severity, ...props }, ref) {
    const Icon = severityIcons[severity];

    return (
      <span
        {...props}
        className={classNames("ks-severity", className)}
        data-severity={severity}
        ref={ref}
      >
        <Icon
          aria-hidden="true"
          className="ks-severity__icon"
          focusable="false"
        />
        <span className="ks-severity__label">{severityLabels[severity]}</span>
      </span>
    );
  },
);

export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  actions?: ReactNode;
  children?: ReactNode;
  description?: ReactNode;
  severity?: Severity;
  title: ReactNode;
}

export const Alert = forwardRef<HTMLDivElement, AlertProps>(function Alert(
  {
    actions,
    children,
    className,
    description,
    role,
    severity = "INFO",
    title,
    ...props
  },
  ref,
) {
  const Icon = severityIcons[severity];

  return (
    <div
      {...props}
      className={classNames("ks-alert", className)}
      data-severity={severity}
      ref={ref}
      role={role ?? (severity === "CRITICAL" ? "alert" : undefined)}
    >
      <Icon
        aria-hidden="true"
        className="ks-alert__icon"
        focusable="false"
      />
      <div className="ks-alert__content">
        <div className="ks-alert__title">{title}</div>
        {description ? (
          <div className="ks-alert__description">{description}</div>
        ) : null}
        {children}
        {actions ? <div className="ks-alert__actions">{actions}</div> : null}
      </div>
    </div>
  );
});

export type SpinnerSize = "small" | "default" | "large";

export interface SpinnerProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  label?: string;
  size?: SpinnerSize;
}

export const Spinner = forwardRef<HTMLSpanElement, SpinnerProps>(
  function Spinner(
    { className, label = "Memuat", size = "default", ...props },
    ref,
  ) {
    return (
      <span
        {...props}
        aria-label={label}
        className={classNames("ks-spinner", className)}
        data-size={size}
        ref={ref}
        role="status"
      >
        <span aria-hidden="true" className="ks-spinner__indicator" />
      </span>
    );
  },
);

export type SkeletonShape = "text" | "rectangle" | "circle";

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  shape?: SkeletonShape;
}

export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(
  function Skeleton({ className, shape = "rectangle", ...props }, ref) {
    return (
      <div
        {...props}
        aria-hidden="true"
        className={classNames("ks-skeleton", className)}
        data-shape={shape}
        ref={ref}
      />
    );
  },
);

export interface EmptyStateProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  action?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  title: ReactNode;
}

export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(
  function EmptyState(
    { action, className, description, icon, title, ...props },
    ref,
  ) {
    return (
      <div
        {...props}
        className={classNames("ks-empty-state", className)}
        ref={ref}
      >
        {icon ? (
          <div aria-hidden="true" className="ks-empty-state__icon">
            {icon}
          </div>
        ) : null}
        <div className="ks-empty-state__title">{title}</div>
        {description ? (
          <div className="ks-empty-state__description">
            {description}
          </div>
        ) : null}
        {action ? <div className="ks-empty-state__action">{action}</div> : null}
      </div>
    );
  },
);
