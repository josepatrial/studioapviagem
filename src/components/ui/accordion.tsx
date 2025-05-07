"use client"

import * as React from "react"
import * as AccordionPrimitive from "@radix-ui/react-accordion"
import { ChevronDown } from "lucide-react"
// Slot is not directly used here anymore unless AccordionPrimitive.Trigger uses it internally via its own asChild
// import { Slot } from "@radix-ui/react-slot" 

import { cn } from "@/lib/utils"

const Accordion = AccordionPrimitive.Root

const AccordionItem = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Item
    ref={ref}
    className={cn("border-b", className)}
    {...props}
  />
))
AccordionItem.displayName = "AccordionItem"

const AccordionHeader = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Header>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Header>
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Header
    ref={ref}
    className={cn("flex", className)} 
    {...props}
  />
));
AccordionHeader.displayName = AccordionPrimitive.Header.displayName

const AccordionTrigger = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Trigger>,
  // The props are for AccordionPrimitive.Trigger, our component adds `asChild` to control the primitive's behavior
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger> & { asChild?: boolean }
>(({ className, children, asChild = false, ...props }, ref) => (
  <AccordionPrimitive.Header className="flex"> {/* Ensure Header is always rendered */}
    <AccordionPrimitive.Trigger
      ref={ref}
      className={cn(
        "flex flex-1 items-center justify-between py-4 font-medium transition-all hover:underline [&[data-state=open]>svg]:rotate-180",
        className
      )}
      {...props} // Pass down props like onClick, data-state etc.
      asChild={asChild} // Let the Primitive.Trigger handle asChild
    >
      {/* 
        If asChild is true, 'children' must be a single React element that Slot (rendered by Primitive.Trigger's asChild) will merge with.
        This child element (e.g., a div or button from the consuming component) is responsible for its own content, including any icons.
        If asChild is false, 'children' is the content for the default button rendered by Primitive.Trigger, and we add the Chevron.
      */}
      {children}
      {!asChild && <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />}
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
));
AccordionTrigger.displayName = AccordionPrimitive.Trigger.displayName

const AccordionContent = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Content
    ref={ref}
    className="overflow-hidden text-sm transition-all data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
    {...props}
  >
    <div className={cn("pb-4 pt-0", className)}>{children}</div>
  </AccordionPrimitive.Content>
))

AccordionContent.displayName = AccordionPrimitive.Content.displayName

export { Accordion, AccordionItem, AccordionHeader, AccordionTrigger, AccordionContent }
