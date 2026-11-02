// Visual source: AMES-SYSTEM-LEGACY/frontend/theme.js and pages/chairman/*.jsx.
// These primitives are used only inside the Chairman portal.
import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  ReactNode,
} from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon";
import LegacyRipple from "../LegacyRipple";
import LegacyIcon from "../LegacyIcon";
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "text";
  small?: boolean;
  startIcon?: ReactNode;
}
export function Button({
  variant = "primary",
  small = false,
  startIcon,
  children,
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  const colors = {
    primary:
      "bg-brand text-white shadow-sm hover:brightness-95 disabled:bg-black/[.12] disabled:shadow-none",
    secondary:
      "border border-[#4543c0]/50 text-[#4543c0] hover:border-[#4543c0] hover:bg-[#4543c0]/[.04] disabled:border-black/[.12]",
    danger:
      "bg-[#d32f2f] text-white hover:bg-[#c62828] disabled:bg-black/[.12]",
    text: "text-[#4543c0] hover:bg-[#4543c0]/[.04]",
  };
  const resolvedColors = colors[variant]
    .split(" ")
    .filter(
      (token) =>
        !(token.startsWith("text-") && /(?:^|\s)text-\[?#/.test(className)) &&
        !(token.startsWith("bg-") && /(?:^|\s)bg-/.test(className)),
    )
    .join(" ");
  return (
    <button
      {...props}
      type={type}
      className={`relative inline-flex min-w-16 shrink-0 items-center justify-center rounded-lg align-middle leading-[1.75] tracking-normal normal-case transition-[background-color,box-shadow,border-color] duration-250 outline-none! focus-visible:ring-2 focus-visible:ring-brand/25 disabled:pointer-events-none disabled:text-black/[.26] ${small ? (variant === "secondary" ? "px-[9px] py-[3px] text-[13px]" : "px-2 py-1 text-[13px]") : variant === "secondary" ? "px-[15px] py-[5px] text-sm" : "px-4 py-1.5 text-sm"} ${className.includes("font-") ? "" : "font-medium"} ${resolvedColors} ${className}`}
    >
      {startIcon && (
        <span
          className={
            small
              ? "mr-2 -ml-0.5 inline-flex [&_svg]:size-[18px]"
              : "mr-2 -ml-1 inline-flex [&_svg]:size-5"
          }
        >
          {startIcon}
        </span>
      )}
      {children}
      <LegacyRipple />
    </button>
  );
}
export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  small?: boolean;
}
export function IconButton({
  children,
  className = "",
  small = false,
  ...props
}: IconButtonProps) {
  return (
    <button
      {...props}
      type="button"
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full align-middle transition-colors hover:bg-black/[.04] focus-visible:bg-black/[.12] focus-visible:outline-none! disabled:pointer-events-none disabled:text-black/[.26] ${small ? "p-[5px]" : "p-2"} ${className.includes("text-") ? "" : "text-black/54"} ${className}`}
    >
      {children}
      <LegacyRipple center />
    </button>
  );
}
interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  captionLabel?: boolean;
  label?: string;
  floating?: boolean;
  adornment?: ReactNode;
  endAdornment?: ReactNode;
  containerClassName?: string;
  small?: boolean;
}
export function Field({
  captionLabel = false,
  label,
  floating = false,
  adornment,
  endAdornment,
  containerClassName = "",
  small = true,
  className = "",
  id,
  ...props
}: FieldProps) {
  const generated = useId();
  const fieldId = id || generated;
  const [focused, setFocused] = useState(false);
  const shrunk = !floating || focused || !!props.value;
  return (
    <div className={`min-w-0 ${containerClassName}`}>
      {label && !floating && (
        <label
          htmlFor={fieldId}
          className={`mb-2 block leading-6 ${captionLabel ? "text-base font-normal" : "text-xs font-bold"}`}
        >
          {captionLabel ? (
            <span className="text-xs font-bold leading-[1.66]">{label}</span>
          ) : (
            label
          )}
        </label>
      )}
      <div
        className={`group relative flex items-center rounded-[4px] ${className}`}
      >
        {adornment && (
          <span className="ml-3.5 mr-2 flex shrink-0 text-[#9ca3af]">
            {adornment}
          </span>
        )}
        <input
          {...props}
          onFocus={(event) => {
            setFocused(true);
            props.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            props.onBlur?.(event);
          }}
          id={fieldId}
          data-chairman-autofocus={props.autoFocus || undefined}
          className={`peer w-full min-w-0 rounded-[inherit] bg-transparent text-base leading-[1.4375] text-[#333] outline-none! placeholder:text-[#333]/42 disabled:text-black/[.38] ${small ? "py-[8.5px]" : "py-[16.5px]"} ${adornment ? "pr-3.5" : endAdornment ? "pl-3.5" : "px-3.5"}`}
        />
        {endAdornment && (
          <span className="mr-3.5 ml-2 flex shrink-0 text-[#9ca3af]">
            {endAdornment}
          </span>
        )}
        <Outline
          label={floating ? label : undefined}
          htmlFor={fieldId}
          shrunk={shrunk}
          small={small}
        />
      </div>
    </div>
  );
}
function Outline({
  label,
  htmlFor,
  shrunk = true,
  small = true,
  brand = false,
}: {
  label?: string;
  htmlFor?: string;
  shrunk?: boolean;
  small?: boolean;
  brand?: boolean;
}) {
  return (
    <>
      {label && (
        <label
          htmlFor={htmlFor}
          className={`pointer-events-none absolute left-3.5 origin-top-left text-black/60 transition-[top,font-size] duration-200 ${brand ? "group-focus-within:text-brand" : "group-focus-within:text-[#4543c0]"} ${shrunk ? "-top-[9px] text-base leading-[1.4375] scale-75" : small ? "top-[8.5px] text-base leading-[1.4375]" : "top-[16.5px] text-base leading-[1.4375]"}`}
        >
          {label}
        </label>
      )}
      <fieldset
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 -top-[5px] bottom-0 min-w-0 rounded-[inherit] border border-black/[.23] px-2 group-focus-within:border-2 ${brand ? "group-hover:border-brand/60 group-focus-within:border-brand" : "group-hover:border-[#333] group-focus-within:border-[#4543c0]"}`}
      >
        <legend
          className={`h-[11px] overflow-hidden text-[.75em] leading-[11px] ${label && shrunk ? "max-w-full px-[5px]" : "max-w-0 p-0"}`}
        >
          <span className="invisible">{label || "\u200b"}</span>
        </legend>
      </fieldset>
    </>
  );
}
interface SelectProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "onChange" | "value"
> {
  captionLabel?: boolean;
  label?: string;
  floating?: boolean;
  containerClassName?: string;
  small?: boolean;
  value?: string | number;
  onChange?: (event: { target: { value: string } }) => void;
  optionAction?: (value: string, closeMenu: () => void) => ReactNode;
  constrainMenu?: boolean;
  brand?: boolean;
}
interface OptionProps {
  value?: string | number;
  children?: ReactNode;
  disabled?: boolean;
}
export function Select({
  captionLabel = false,
  label,
  floating = true,
  containerClassName = "",
  small = true,
  className = "",
  children,
  id,
  value,
  onChange,
  disabled,
  optionAction,
  constrainMenu = false,
  brand = false,
  ...props
}: SelectProps) {
  const generated = useId();
  const fieldId = id || generated;
  const listId = generated + "-menu";
  const ref = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
    width: number;
  } | null>(null);
  const options = Children.toArray(children)
    .filter(isValidElement<OptionProps>)
    .map((child) => ({
      value: String(child.props.value ?? child.props.children ?? ""),
      label: child.props.children,
      disabled: child.props.disabled,
    }));
  const selected = options.find((option) => option.value === String(value));
  const close = () => {
    setPosition(null);
    document.getElementById(fieldId)?.focus();
  };
  const open = () => {
    if (disabled) return;
    const rect = ref.current!.getBoundingClientRect();
    const menuHeight = Math.min(
      options.length * (window.innerWidth < 600 ? 48 : 36) + 16,
      window.innerHeight - 96,
      constrainMenu ? 192 : Infinity,
    );
    setPortalHost(ref.current?.closest("dialog") || document.body);
    setPosition({
      left: Math.max(
        16,
        Math.min(rect.left, window.innerWidth - rect.width - 16),
      ),
      top: Math.max(
        16,
        Math.min(rect.bottom, window.innerHeight - menuHeight - 16),
      ),
      width: rect.width,
    });
  };
  useEffect(() => {
    if (!position) return;
    const buttons = Array.from(
      menu.current?.querySelectorAll<HTMLElement>(
        '[role="option"]:not(:disabled)',
      ) || [],
    );
    (
      buttons.find((item) => item.getAttribute("aria-selected") === "true") ||
      buttons[0]
    )?.focus();
  }, [position]);
  return (
    <div className={`min-w-0 ${containerClassName}`}>
      {label && !floating && (
        <label
          id={generated + "-label"}
          htmlFor={fieldId}
          className={`mb-2 block leading-6 ${captionLabel ? "text-base font-normal" : "text-xs font-bold"}`}
        >
          {captionLabel ? (
            <span className="text-xs font-bold leading-[1.66]">{label}</span>
          ) : (
            label
          )}
        </label>
      )}
      <div
        className={`group relative rounded-[4px] ${brand ? "transition-shadow focus-within:ring-2 focus-within:ring-brand/20" : ""} ${className}`}
      >
        <button
          ref={ref}
          id={fieldId}
          type="button"
          role="combobox"
          aria-label={props["aria-label"] || label}
          aria-expanded={!!position}
          aria-controls={position ? listId : undefined}
          aria-haspopup="listbox"
          disabled={disabled}
          onClick={open}
          onKeyDown={(event) => {
            if (["ArrowDown", "ArrowUp", " ", "Enter"].includes(event.key)) {
              event.preventDefault();
              open();
            }
          }}
          className={`relative block w-full min-w-0 rounded-[inherit] bg-transparent pl-3.5 pr-8 text-left text-base leading-[1.4375] text-[#333] outline-none! disabled:text-black/[.38] ${small ? "py-[8.5px]" : "py-[16.5px]"}`}
        >
          <span className="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
            {selected?.label || "\u200b"}
          </span>
          <LegacyIcon
            name="ArrowDropDown"
            className="pointer-events-none absolute right-[7px] top-[calc(50%-12px)] size-6 text-black/54"
          />
        </button>
        <Outline
          label={floating ? label : undefined}
          htmlFor={fieldId}
          brand={brand}
        />
      </div>
      {position &&
        createPortal(
          <div
            className="fixed inset-0 z-[1400]"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) close();
            }}
            onKeyDown={(event) => {
              const options = Array.from(
                menu.current?.querySelectorAll<HTMLButtonElement>(
                  '[role="option"]:not(:disabled)',
                ) || [],
              );
              const index = options.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              if (event.key === "Escape" || event.key === "Tab") {
                event.preventDefault();
                close();
              } else if (
                event.key === "ArrowRight" ||
                event.key === "ArrowLeft"
              ) {
                const selector =
                  event.key === "ArrowRight"
                    ? 'button:not([role="option"])'
                    : '[role="option"]';
                document.activeElement?.parentElement
                  ?.querySelector<HTMLElement>(selector)
                  ?.focus();
                event.preventDefault();
              } else if (
                ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
              ) {
                event.preventDefault();
                options[
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? options.length - 1
                      : (index +
                          (event.key === "ArrowDown" ? 1 : -1) +
                          options.length) %
                        options.length
                ]?.focus();
              } else if (event.key.length === 1) {
                const match = options
                  .slice(index + 1)
                  .concat(options.slice(0, index + 1))
                  .find((item) =>
                    item.textContent
                      ?.trim()
                      .toLowerCase()
                      .startsWith(event.key.toLowerCase()),
                  );
                match?.focus();
              }
            }}
          >
            <div
              ref={menu}
              id={listId}
              role="listbox"
              aria-label={label || props["aria-label"]}
              className={`absolute ${constrainMenu ? "max-h-48 max-w-[calc(100vw-2rem)] [scrollbar-width:thin]" : "max-h-[calc(100dvh-96px)]"} min-w-0 overflow-y-auto overscroll-contain rounded-[4px] bg-white py-2 text-[#333] shadow-[0px_5px_5px_-3px_rgba(0,0,0,.2),0px_8px_10px_1px_rgba(0,0,0,.14),0px_3px_14px_2px_rgba(0,0,0,.12)]`}
              style={{
                left: position.left,
                top: position.top,
                minWidth: position.width,
              }}
            >
              {options.map((option) => (
                <div
                  key={option.value}
                  className="flex items-center"
                  role="presentation"
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={option.value === String(value)}
                    disabled={option.disabled}
                    className={`relative flex min-h-12 min-w-0 grow items-center px-4 py-1.5 text-left text-base leading-[1.5] ${constrainMenu ? "whitespace-normal break-words" : "whitespace-nowrap"} outline-none! hover:bg-black/[.04] focus:bg-black/[.12] disabled:opacity-38 legacy-sm:min-h-0 ${option.value === String(value) ? (brand ? "bg-brand/10 hover:bg-brand/15 focus:bg-brand/20" : "bg-[#4543c0]/[.08] hover:bg-[#4543c0]/[.12] focus:bg-[#4543c0]/[.20]") : ""}`}
                    onClick={() => {
                      onChange?.({ target: { value: option.value } });
                      close();
                    }}
                  >
                    {option.label}
                    <LegacyRipple />
                  </button>
                  {optionAction?.(option.value, close)}
                </div>
              ))}
            </div>
          </div>,
          portalHost || document.body,
        )}
    </div>
  );
}
export function Switch({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <span
      className={`relative z-0 inline-flex h-[38px] w-[58px] shrink-0 overflow-hidden align-middle ${className}`}
    >
      <input
        {...props}
        type="checkbox"
        role="switch"
        className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0 disabled:cursor-default"
      />
      <span className="pointer-events-none absolute inset-x-3 top-3 h-3.5 rounded-full border border-transparent bg-black opacity-38 transition-[background-color,opacity] duration-150 peer-checked:bg-[#4543c0] peer-checked:opacity-50 peer-disabled:opacity-12" />
      <span className="pointer-events-none absolute left-0 top-0 z-[1] rounded-full p-[9px] text-white transition-transform duration-150 peer-checked:translate-x-5 peer-checked:text-[#4543c0] peer-focus-visible:bg-[#4543c0]/12 peer-disabled:text-[#f5f5f5]">
        <span className="block size-5 rounded-full border border-transparent bg-current shadow-[0px_2px_1px_-1px_rgba(0,0,0,.2),0px_1px_1px_0px_rgba(0,0,0,.14),0px_1px_3px_0px_rgba(0,0,0,.12)]" />
      </span>
    </span>
  );
}
export interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  indeterminate?: boolean;
}
export function Checkbox({
  indeterminate = false,
  className = "",
  ...props
}: CheckboxProps) {
  return (
    <span
      className={`relative inline-flex size-[42px] items-center justify-center rounded-full align-middle text-black/60 hover:bg-black/[.04] ${className}`}
    >
      <input
        {...props}
        type="checkbox"
        className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0"
      />
      <Icon
        name={
          indeterminate
            ? "IndeterminateCheckBox"
            : props.checked
              ? "CheckBox"
              : "CheckBoxOutlineBlank"
        }
        className={`pointer-events-none size-6 ${props.checked || indeterminate ? "text-[#4543c0]" : ""}`}
      />
      <span className="pointer-events-none absolute inset-0 rounded-full peer-focus-visible:bg-[#4543c0]/[.12]" />
    </span>
  );
}
interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
}
export function TextArea({ label, className = "", ...props }: TextAreaProps) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  return (
    <div className={`group relative rounded-[4px] ${className}`}>
      <textarea
        rows={props.rows || 3}
        {...props}
        onFocus={(event) => {
          setFocused(true);
          props.onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          props.onBlur?.(event);
        }}
        id={id}
        data-chairman-autofocus={props.autoFocus || undefined}
        className="block w-full resize-none rounded-[inherit] bg-transparent px-3.5 py-[16.5px] text-base leading-[1.4375] outline-none!"
      />
      <Outline
        label={label}
        htmlFor={id}
        shrunk={focused || !!props.value}
        small={false}
      />
    </div>
  );
}
export function Notice({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "error" | "success";
}) {
  if (!children) return null;
  const colors = {
    info: "bg-[#e5f6fd] text-[#014361]",
    error: "bg-[#fdeded] text-[#5f2120]",
    success: "bg-[#edf7ed] text-[#1e4620]",
  };
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`my-2 flex items-start rounded-[4px] px-4 py-1.5 text-sm leading-[1.43] ${colors[tone]}`}
    >
      <LegacyIcon
        name={
          tone === "error"
            ? "ErrorOutline"
            : tone === "success"
              ? "CheckCircleOutline"
              : "InfoOutlined"
        }
        className="mr-3 my-[7px] size-[22px] shrink-0"
      />
      <div className="py-2">{children}</div>
    </div>
  );
}
interface ModalProps {
  title: ReactNode;
  children: ReactNode;
  onClose?: () => void;
  locked?: boolean;
  size?: "xs" | "sm" | "md";
  className?: string;
  titleClassName?: string;
  bodyClassName?: string;
  footer?: ReactNode;
  footerClassName?: string;
  closeSmall?: boolean;
  closeClassName?: string;
  closeButton?: boolean;
}
export function Modal({
  title,
  children,
  onClose,
  locked = false,
  size = "sm",
  className = "",
  titleClassName = "",
  bodyClassName = "",
  footer,
  closeButton = false,
  footerClassName = "",
  closeSmall = false,
  closeClassName = "text-inherit",
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    const initial = dialog?.querySelector<HTMLElement>(
      "[data-chairman-autofocus]",
    );
    if (initial) initial.focus();
    else dialog?.focus();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      aria-labelledby={id}
      onCancel={(event) => {
        event.preventDefault();
        if (!locked) onClose?.();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !locked) onClose?.();
      }}
      className={`m-auto max-h-[calc(100dvh-64px)] w-[calc(100%-64px)] overflow-visible rounded-[4px] bg-white p-0 text-[#333] shadow-[0px_11px_15px_-7px_rgba(0,0,0,.2),0px_24px_38px_3px_rgba(0,0,0,.14),0px_9px_46px_8px_rgba(0,0,0,.12)] backdrop:bg-black/50 ${size === "xs" ? "max-w-[444px]" : size === "md" ? "max-w-[900px]" : "max-w-[600px]"} ${className}`}
    >
      <div className="flex max-h-[calc(100dvh-64px)] flex-col overflow-hidden rounded-[inherit]">
        <header
          className={`flex shrink-0 items-center justify-between px-6 py-4 ${titleClassName}`}
        >
          <h2 id={id} className="text-xl font-medium leading-[1.6]">
            {title}
          </h2>
          {closeButton && onClose && (
            <IconButton
              small={closeSmall}
              aria-label="Close"
              disabled={locked}
              onClick={onClose}
              className={closeClassName}
            >
              <LegacyIcon name="Close" />
            </IconButton>
          )}
        </header>
        <div className={`min-h-0 overflow-y-auto px-6 pb-5 ${bodyClassName}`}>
          {children}
        </div>
        {footer && (
          <footer
            className={`flex shrink-0 justify-end gap-2 p-2 ${footerClassName}`}
          >
            {footer}
          </footer>
        )}
      </div>
    </dialog>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="py-6 text-center text-sm leading-[1.43] text-[#777]">
      {children}
    </p>
  );
}
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-[34px] font-bold leading-[1.235]">{title}</h1>
        {subtitle && <p className="mt-1 text-base text-[#777]">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}
