import {
  createContext,
  forwardRef,
  useContext,
  useId,
  type FieldsetHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

import { classNames } from "./internal/class-names";

function isPresent(value: ReactNode): boolean {
  return value !== null && value !== undefined && value !== false;
}

function mergeIds(...ids: readonly (string | undefined)[]): string | undefined {
  const value = ids.filter((id): id is string => Boolean(id)).join(" ");
  return value || undefined;
}

interface FieldContextValue {
  controlId: string;
  describedBy: string | undefined;
  disabled: boolean;
  invalid: boolean;
  required: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

export interface FieldProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  controlId?: string;
  description?: ReactNode;
  disabled?: boolean;
  error?: ReactNode;
  label: ReactNode;
  required?: boolean;
}

export const Field = forwardRef<HTMLDivElement, FieldProps>(function Field(
  {
    children,
    className,
    controlId: providedControlId,
    description,
    disabled = false,
    error,
    label,
    required = false,
    ...props
  },
  ref,
) {
  const generatedId = useId();
  const controlId = providedControlId ?? `ks-field-${generatedId}`;
  const labelId = `${controlId}-label`;
  const descriptionId = `${controlId}-description`;
  const errorId = `${controlId}-error`;
  const hasDescription = isPresent(description);
  const hasError = isPresent(error);
  const describedBy = mergeIds(
    hasDescription ? descriptionId : undefined,
    hasError ? errorId : undefined,
  );
  const context: FieldContextValue = {
    controlId,
    describedBy,
    disabled,
    invalid: hasError,
    required,
  };

  return (
    <FieldContext.Provider value={context}>
      <div
        {...props}
        className={classNames("ks-field", className)}
        data-disabled={disabled || undefined}
        data-invalid={hasError || undefined}
        ref={ref}
      >
        <label className="ks-field__label" htmlFor={controlId} id={labelId}>
          {label}
          {required ? (
            <span aria-hidden="true" className="ks-field__required">
              *
            </span>
          ) : null}
        </label>
        {children}
        {hasDescription ? (
          <div
            className="ks-field__description"
            id={descriptionId}
          >
            {description}
          </div>
        ) : null}
        {hasError ? (
          <div className="ks-field__error" id={errorId} role="alert">
            {error}
          </div>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
});

function useControlAttributes(
  id: string | undefined,
  describedBy: string | undefined,
  ariaInvalid:
    | boolean
    | "false"
    | "grammar"
    | "spelling"
    | "true"
    | undefined,
  disabled: boolean | undefined,
  required: boolean | undefined,
) {
  const field = useContext(FieldContext);
  const invalid =
    field?.invalid === true ||
    ariaInvalid === true ||
    ariaInvalid === "true" ||
    ariaInvalid === "grammar" ||
    ariaInvalid === "spelling";

  return {
    "aria-describedby": mergeIds(describedBy, field?.describedBy),
    "aria-invalid": invalid || undefined,
    disabled: field?.disabled === true || disabled === true,
    id: field?.controlId ?? id,
    invalid,
    required: field?.required === true || required === true,
  };
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    "aria-describedby": describedBy,
    "aria-invalid": ariaInvalid,
    className,
    disabled,
    id,
    required,
    type = "text",
    ...props
  },
  ref,
) {
  const control = useControlAttributes(
    id,
    describedBy,
    ariaInvalid,
    disabled,
    required,
  );

  return (
    <input
      {...props}
      aria-describedby={control["aria-describedby"]}
      aria-invalid={control["aria-invalid"]}
      className={classNames("ks-control", "ks-input", className)}
      data-invalid={control.invalid || undefined}
      disabled={control.disabled}
      id={control.id}
      ref={ref}
      required={control.required}
      type={type}
    />
  );
});

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    {
      "aria-describedby": describedBy,
      "aria-invalid": ariaInvalid,
      className,
      disabled,
      id,
      required,
      ...props
    },
    ref,
  ) {
    const control = useControlAttributes(
      id,
      describedBy,
      ariaInvalid,
      disabled,
      required,
    );

    return (
      <textarea
        {...props}
        aria-describedby={control["aria-describedby"]}
        aria-invalid={control["aria-invalid"]}
        className={classNames("ks-control", "ks-textarea", className)}
        data-invalid={control.invalid || undefined}
        disabled={control.disabled}
        id={control.id}
        ref={ref}
        required={control.required}
      />
    );
  },
);

export interface SelectProps
  extends SelectHTMLAttributes<HTMLSelectElement> {
  children: ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select(
    {
      "aria-describedby": describedBy,
      "aria-invalid": ariaInvalid,
      children,
      className,
      disabled,
      id,
      required,
      ...props
    },
    ref,
  ) {
    const control = useControlAttributes(
      id,
      describedBy,
      ariaInvalid,
      disabled,
      required,
    );

    return (
      <select
        {...props}
        aria-describedby={control["aria-describedby"]}
        aria-invalid={control["aria-invalid"]}
        className={classNames("ks-control", "ks-select", className)}
        data-invalid={control.invalid || undefined}
        disabled={control.disabled}
        id={control.id}
        ref={ref}
        required={control.required}
      >
        {children}
      </select>
    );
  },
);

interface ChoiceMessagesProps {
  description: ReactNode;
  descriptionId: string;
  error: ReactNode;
  errorId: string;
}

function ChoiceMessages({
  description,
  descriptionId,
  error,
  errorId,
}: ChoiceMessagesProps) {
  return (
    <>
      {isPresent(description) ? (
        <span className="ks-choice__description" id={descriptionId}>
          {description}
        </span>
      ) : null}
      {isPresent(error) ? (
        <span className="ks-choice__error" id={errorId} role="alert">
          {error}
        </span>
      ) : null}
    </>
  );
}

interface ChoiceProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  description?: ReactNode;
  error?: ReactNode;
  label: ReactNode;
}

export interface CheckboxProps extends ChoiceProps {}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox(
    {
      "aria-describedby": providedDescribedBy,
      "aria-invalid": providedInvalid,
      className,
      description,
      error,
      id: providedId,
      label,
      ...props
    },
    ref,
  ) {
    const generatedId = useId();
    const id = providedId ?? `ks-checkbox-${generatedId}`;
    const descriptionId = `${id}-description`;
    const errorId = `${id}-error`;
    const invalid = isPresent(error);
    const describedBy = mergeIds(
      providedDescribedBy,
      isPresent(description) ? descriptionId : undefined,
      invalid ? errorId : undefined,
    );

    return (
      <div
        className={classNames("ks-choice", "ks-check", className)}
        data-disabled={props.disabled || undefined}
        data-invalid={invalid || undefined}
      >
        <label className="ks-choice__label" htmlFor={id}>
          <input
            {...props}
            aria-describedby={describedBy}
            aria-invalid={invalid || providedInvalid}
            className="ks-choice__control ks-checkbox"
            id={id}
            ref={ref}
            type="checkbox"
          />
          <span aria-hidden="true" className="ks-choice__indicator" />
          <span className="ks-choice__label-text">
            {label}
            {props.required ? (
              <span aria-hidden="true" className="ks-field__required">
                *
              </span>
            ) : null}
          </span>
        </label>
        <ChoiceMessages
          description={description}
          descriptionId={descriptionId}
          error={error}
          errorId={errorId}
        />
      </div>
    );
  },
);

interface RadioGroupContextValue {
  describedBy: string | undefined;
  disabled: boolean;
  invalid: boolean;
  name: string;
  required: boolean;
}

const RadioGroupContext = createContext<RadioGroupContextValue | null>(null);

export interface RadioGroupProps
  extends FieldsetHTMLAttributes<HTMLFieldSetElement> {
  children: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  label: ReactNode;
  name: string;
  required?: boolean;
}

export const RadioGroup = forwardRef<HTMLFieldSetElement, RadioGroupProps>(
  function RadioGroup(
    {
      "aria-describedby": providedDescribedBy,
      "aria-invalid": providedInvalid,
      children,
      className,
      description,
      disabled = false,
      error,
      label,
      name,
      required = false,
      ...props
    },
    ref,
  ) {
    const generatedId = useId();
    const descriptionId = `ks-radio-${generatedId}-description`;
    const errorId = `ks-radio-${generatedId}-error`;
    const hasError = isPresent(error);
    const invalid =
      hasError ||
      providedInvalid === true ||
      providedInvalid === "true" ||
      providedInvalid === "grammar" ||
      providedInvalid === "spelling";
    const describedBy = mergeIds(
      providedDescribedBy,
      isPresent(description) ? descriptionId : undefined,
      hasError ? errorId : undefined,
    );
    const context: RadioGroupContextValue = {
      describedBy,
      disabled,
      invalid,
      name,
      required,
    };

    return (
      <RadioGroupContext.Provider value={context}>
        <fieldset
          {...props}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={classNames("ks-choice-group", className)}
          data-disabled={disabled || undefined}
          data-invalid={invalid || undefined}
          disabled={disabled}
          ref={ref}
        >
          <legend className="ks-choice-group__label">
            {label}
            {required ? (
              <span aria-hidden="true" className="ks-field__required">
                *
              </span>
            ) : null}
          </legend>
          <div className="ks-choice-group__options">{children}</div>
          <ChoiceMessages
            description={description}
            descriptionId={descriptionId}
            error={error}
            errorId={errorId}
          />
        </fieldset>
      </RadioGroupContext.Provider>
    );
  },
);

export interface RadioProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "aria-describedby" | "aria-invalid" | "name" | "type"
  > {
  label: ReactNode;
  value: string;
}

export const Radio = forwardRef<HTMLInputElement, RadioProps>(function Radio(
  { className, disabled = false, id: providedId, label, value, ...props },
  ref,
) {
  const group = useContext(RadioGroupContext);
  const generatedId = useId();

  if (group === null) {
    throw new Error("Radio must be rendered inside RadioGroup.");
  }

  const id = providedId ?? `ks-radio-${generatedId}`;

  return (
    <label
      className={classNames("ks-choice", "ks-check", className)}
      data-disabled={(disabled || group.disabled) || undefined}
      htmlFor={id}
    >
      <input
        {...props}
        aria-describedby={group.describedBy}
        aria-invalid={group.invalid || undefined}
        className="ks-choice__control ks-radio"
        disabled={disabled || group.disabled}
        id={id}
        name={group.name}
        ref={ref}
        required={group.required}
        type="radio"
        value={value}
      />
      <span aria-hidden="true" className="ks-choice__indicator" />
      <span className="ks-choice__label-text">{label}</span>
    </label>
  );
});

export interface SwitchProps extends ChoiceProps {}

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  {
    "aria-describedby": providedDescribedBy,
    "aria-invalid": providedInvalid,
    className,
    description,
    error,
    id: providedId,
    label,
    ...props
  },
  ref,
) {
  const generatedId = useId();
  const id = providedId ?? `ks-switch-${generatedId}`;
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  const invalid = isPresent(error);
  const describedBy = mergeIds(
    providedDescribedBy,
    isPresent(description) ? descriptionId : undefined,
    invalid ? errorId : undefined,
  );

  return (
    <div
      className={classNames("ks-switch", className)}
      data-disabled={props.disabled || undefined}
      data-invalid={invalid || undefined}
    >
      <label className="ks-switch__label" htmlFor={id}>
        <input
          {...props}
          aria-describedby={describedBy}
          aria-invalid={invalid || providedInvalid}
          className="ks-switch__control"
          id={id}
          ref={ref}
          role="switch"
          type="checkbox"
        />
        <span aria-hidden="true" className="ks-switch__track">
          <span className="ks-switch__thumb" />
        </span>
        <span className="ks-switch__label-text">
          {label}
          {props.required ? (
            <span aria-hidden="true" className="ks-field__required">
              *
            </span>
          ) : null}
        </span>
      </label>
      <ChoiceMessages
        description={description}
        descriptionId={descriptionId}
        error={error}
        errorId={errorId}
      />
    </div>
  );
});
