
"use client"

import * as React from "react"
import { Check, ChevronsUpDown, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"

export type MultiSelectOption = {
  value: string
  label: string
  icon?: React.ComponentType<{ className?: string }>
}

interface MultiSelectComboboxProps {
  options: MultiSelectOption[]
  selected: string[]
  onChange: React.Dispatch<React.SetStateAction<string[]>>
  className?: string
  placeholder?: string
  searchPlaceholder?: string;
  emptySearchMessage?: string;
}

export function MultiSelectCombobox({
  options,
  selected,
  onChange,
  className,
  placeholder = "Select options...",
  searchPlaceholder = "Search...",
  emptySearchMessage = "No results found.",
}: MultiSelectComboboxProps) {
  const [open, setOpen] = React.useState(false)

  const handleSelect = (value: string) => {
    onChange((prevSelected) =>
      prevSelected.includes(value)
        ? prevSelected.filter((item) => item !== value)
        : [...prevSelected, value]
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild className={cn(className)}>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-10"
          onClick={() => setOpen(!open)}
        >
          <div className="flex gap-1 flex-wrap">
            {selected.length > 0
              ? selected
                  .map((value) => options.find((option) => option.value === value)?.label)
                  .filter(Boolean)
                  .map((label) => (
                    <Badge
                      variant="secondary"
                      key={label}
                      className="mr-1 mb-1"
                      onClick={(e) => {
                        e.stopPropagation(); // Prevent popover from closing
                        const valueToDeselect = options.find(option => option.label === label)?.value;
                        if (valueToDeselect) {
                          handleSelect(valueToDeselect);
                        }
                      }}
                    >
                      {label}
                      <X className="ml-1 h-3 w-3 cursor-pointer" />
                    </Badge>
                  ))
              : placeholder}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptySearchMessage}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  onSelect={() => handleSelect(option.value)}
                  className="cursor-pointer"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selected.includes(option.value)
                        ? "opacity-100"
                        : "opacity-0"
                    )}
                  />
                  {option.icon && (
                    <option.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                  )}
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
