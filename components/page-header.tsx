"use client";

import type React from "react";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { Logo } from "./logo";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface PageHeaderProps {
  title: string;
  children?: React.ReactNode;
  showLogo?: boolean;
}

export function PageHeader({
  title,
  children,
  showLogo = false,
}: PageHeaderProps) {
  const isMobile = useIsMobile();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
      router.replace("/login");
    } catch (error) {
      console.error("Logout error:", error);
      router.replace("/login");
    }
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-white px-6">
      {isMobile && <SidebarTrigger className="mr-2 md:hidden" />}
      {isMobile && showLogo ? (
        <Logo onClick={() => router.push("/dashboard")} className="mr-4" />
      ) : (
        <h1 className="text-xl font-semibold">{title}</h1>
      )}
      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          className="text-xs"
        >
          🔄 Refresh
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleLogout}
          className="text-xs"
        >
          🚪 Logout
        </Button>
        {children}
      </div>
    </header>
  );
}
