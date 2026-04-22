import Link from "next/link";
import { Activity, Search } from "lucide-react";
import { CommandPaletteTrigger } from "@/components/command-palette-trigger";

export function Navbar() {
  return (
    <nav className="border-b bg-background">
      <div className="container mx-auto flex items-center h-14 px-4 gap-6">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg">
          <Activity className="h-5 w-5 text-primary" />
          Dev Eval
        </Link>
        <div className="flex items-center gap-6 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground transition-colors">
            Dashboard
          </Link>
          <Link href="/engineers" className="hover:text-foreground transition-colors">
            Engineers
          </Link>
          <Link href="/repos" className="hover:text-foreground transition-colors">
            Repos
          </Link>
          <Link href="/commits" className="hover:text-foreground transition-colors">
            Commits
          </Link>
        </div>
        <div className="ml-auto">
          <CommandPaletteTrigger>
            <span className="inline-flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground border rounded-md hover:bg-muted transition-colors">
              <Search className="h-3 w-3" />
              Search
              <kbd className="ml-2 px-1 py-0.5 bg-muted rounded text-[10px]">⌘K</kbd>
            </span>
          </CommandPaletteTrigger>
        </div>
      </div>
    </nav>
  );
}
