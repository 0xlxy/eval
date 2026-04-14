import { Badge } from "@/components/ui/badge";

export function ScoreBadge({ score }: { score: number }) {
  let variant: "default" | "secondary" | "destructive" | "outline" = "default";
  if (score >= 80) variant = "default";
  else if (score >= 50) variant = "secondary";
  else variant = "destructive";

  return (
    <Badge variant={variant} className="text-sm font-mono">
      {score}/100
    </Badge>
  );
}
