"use client"

import { Coffee } from "lucide-react"
import { cn } from "@/lib/utils"

interface LogoProps {
  className?: string
  onClick?: () => void
}

export function Logo({ className, onClick }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2 cursor-pointer", className)} onClick={onClick}>
      <div className="flex items-center justify-center rounded-md bg-blue-600 p-1.5">
        <Coffee className="h-5 w-5 text-white" />
      </div>
      <div className="flex flex-col">
        <span className="text-lg font-bold leading-none text-blue-600">Ninety3</span>
        <span className="text-sm font-medium leading-tight">Coffee ERP</span>
      </div>
    </div>
  )
}
