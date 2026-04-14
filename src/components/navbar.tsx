import Link from "next/link";
import { Activity } from "lucide-react";

export function Navbar() {
  return (
    <nav className="border-b bg-background">
      <div className="container mx-auto flex items-center h-14 px-4">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg">
          <Activity className="h-5 w-5 text-primary" />
          Dev Eval
        </Link>
        <div className="ml-8 flex items-center gap-6 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground transition-colors">
            Dashboard
          </Link>
        </div>
      </div>
    </nav>
  );
}
