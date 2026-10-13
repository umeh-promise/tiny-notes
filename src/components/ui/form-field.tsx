import { FormError } from "@/components/ui/form-error";

type FormFieldProps = Readonly<{
  label: string;
  name: string;
  type?: "text" | "email" | "password";
  placeholder: string;
  autoComplete: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  error?: string;
  hint?: string;
}>;

export function FormField({
  label,
  name,
  type = "text",
  placeholder,
  autoComplete,
  required,
  minLength,
  maxLength,
  error,
  hint,
}: FormFieldProps) {
  return (
    <div className="flex flex-col gap-2.25">
      <label htmlFor={name} className="text-[11px] font-[550]">
        {label}
      </label>
      <input
        className="h-12 w-full rounded-md border border-[#d9e2d8] bg-[#fcfdf9] px-3.5 text-xs/normal text-foreground transition-colors duration-150 ease-linear placeholder:text-[#89978a] focus:border-aqua disabled:opacity-70 aria-invalid:border-error motion-reduce:transition-none"
        id={name}
        name={name}
        type={type}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${name}-error` : hint ? `${name}-hint` : undefined}
      />
      {error && <FormError id={`${name}-error`}>{error}</FormError>}
      {hint && (
        <p id={`${name}-hint`} className="text-[10px]/[1.6] text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}
