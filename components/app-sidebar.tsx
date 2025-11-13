"use client"

import { useRouter } from "next/navigation"
import {
  Sidebar,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
} from "@/components/ui/sidebar"
import {
  LayoutDashboard,
  DollarSign,
  ShoppingCart,
  Package,
  Boxes,
  Users,
  FileText,
  Settings,
  Bell,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Logo } from "./logo"

interface AppSidebarProps {
  activeMenu: string
}

export function AppSidebar({ activeMenu }: AppSidebarProps) {
  const router = useRouter()

  const handleMenuClick = (route: string) => {
    router.push(route)
  }

  return (
    <Sidebar className="border-r border-gray-200">
      <SidebarHeader className="flex h-16 items-center border-b px-6">
        <Logo onClick={() => router.push("/dashboard")} />
        <Button variant="outline" size="icon" className="ml-auto h-8 w-8">
          <Bell className="h-4 w-4" />
          <span className="sr-only">Notifications</span>
        </Button>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Main Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton isActive={activeMenu === "dashboard"} onClick={() => handleMenuClick("/dashboard")}>
                  <LayoutDashboard className="h-5 w-5" />
                  <span>Dashboard</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton isActive={activeMenu === "finance"} onClick={() => handleMenuClick("/finance")}>
                  <DollarSign className="h-5 w-5" />
                  <span>Finance</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton isActive={activeMenu === "sales"} onClick={() => handleMenuClick("/sales")}>
                  <ShoppingCart className="h-5 w-5" />
                  <span>Sales</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={activeMenu === "procurement"}
                  onClick={() => handleMenuClick("/procurement")}
                >
                  <Package className="h-5 w-5" />
                  <span>Procurement</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton isActive={activeMenu === "inventory"} onClick={() => handleMenuClick("/inventory")}>
                  <Boxes className="h-5 w-5" />
                  <span>Inventory</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton isActive={activeMenu === "hr"} onClick={() => handleMenuClick("/hr")}>
                  <Users className="h-5 w-5" />
                  <span>HR</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton isActive={activeMenu === "reports"} onClick={() => handleMenuClick("/reports")}>
                  <FileText className="h-5 w-5" />
                  <span>Reports</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton isActive={activeMenu === "settings"} onClick={() => handleMenuClick("/settings")}>
                  <Settings className="h-5 w-5" />
                  <span>Settings</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
