import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { Input } from "@/components/ui/input";
import { SelectTrigger } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const steepButtonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full text-[15px] font-[450] tracking-[-0.009em] outline-none transition-[color,background-color,opacity] focus-visible:ring-2 focus-visible:ring-ink/20 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "h-10 bg-ink px-5 text-white hover:bg-ink/90",
        secondary: "h-10 border border-ink/15 bg-transparent px-5 text-ink hover:bg-ink/5",
        text: "h-8 rounded-none p-0 text-ink hover:text-rust",
        muted: "h-8 rounded-none p-0 text-graphite hover:text-ink",
        icon: "h-9 w-9 text-graphite hover:bg-ink/5 hover:text-ink",
      },
    },
    defaultVariants: {
      variant: "primary",
    },
  },
);

export function SteepButton({
  className,
  variant,
  asChild = false,
  type,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof steepButtonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="steep-button"
      type={asChild ? undefined : (type ?? "button")}
      className={cn(steepButtonVariants({ variant }), className)}
      {...props}
    />
  );
}

export function SteepInput({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <Input
      className={cn(
        "h-11 rounded-[16px] border border-dove/70 bg-pure-white px-4 text-[15px] font-[450] tracking-[-0.009em] text-ink shadow-none placeholder:text-graphite focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-ink/10 md:text-[15px]",
        className,
      )}
      {...props}
    />
  );
}

export function SteepSelectTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectTrigger>) {
  return (
    <SelectTrigger
      className={cn(
        "h-11 w-full rounded-[16px] border border-dove/70 bg-pure-white px-4 text-[15px] font-[450] tracking-[-0.009em] text-ink shadow-none focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-ink/10 data-[size=default]:h-11 data-[size=sm]:h-10",
        className,
      )}
      {...props}
    >
      {children}
    </SelectTrigger>
  );
}
