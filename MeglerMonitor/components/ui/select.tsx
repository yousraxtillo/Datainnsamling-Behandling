"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  description?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, description, children, ...props }, ref) => {
    return (
      <label className="flex flex-col gap-1 text-sm text-muted-foreground">
        {label && <span>{label}</span>}
        <select
          ref={ref}
          className={cn(
            "rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            className
          )}
          {...props}
        >
          {children}
        </select>
        {description && <span className="text-xs text-muted-foreground/80">{description}</span>}
      </label>
    );
  }
);
Select.displayName = "Select";
