import * as React from "react"
import { DayPicker } from "react-day-picker"
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "relative flex flex-col gap-4 sm:flex-row",
        month: "flex w-full flex-col gap-4",
        month_caption: "relative flex h-7 items-center justify-center",
        caption_label: "text-sm font-medium",
        nav: "absolute inset-x-0 top-0 flex items-center justify-between",
        button_previous: cn(buttonVariants({ variant: "ghost" }), "size-7 p-0"),
        button_next: cn(buttonVariants({ variant: "ghost" }), "size-7 p-0"),
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday:
          "text-muted-foreground w-8 rounded-md text-[0.8rem] font-normal",
        week: "mt-2 flex w-full",
        day: cn(
          "relative size-8 p-0 text-center text-sm",
          "[&:has([aria-selected])]:bg-accent [&:has([aria-selected])]:rounded-md"
        ),
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "size-8 p-0 font-normal aria-selected:opacity-100"
        ),
        selected:
          "bg-primary text-primary-foreground rounded-md [&>button]:bg-primary [&>button]:text-primary-foreground [&>button:hover]:bg-primary [&>button:hover]:text-primary-foreground",
        today: "bg-accent text-accent-foreground rounded-md",
        outside: "text-muted-foreground/50",
        disabled: "text-muted-foreground opacity-50",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? (
            <IconChevronLeft className="size-4" />
          ) : (
            <IconChevronRight className="size-4" />
          ),
      }}
      {...props}
    />
  )
}

export { Calendar }
