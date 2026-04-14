import { PSLTeam, PSL_CONFIG } from "../types";

interface Props {
  team: PSLTeam;
  showStatus?: boolean;
  size?: "sm" | "md" | "lg";
}

export default function PSLBadge({ team, showStatus = true, size = "md" }: Props) {
  const config = PSL_CONFIG[team];
  const sizeClasses = {
    sm: "text-xs px-2 py-0.5",
    md: "text-xs px-3 py-1",
    lg: "text-sm px-4 py-1.5",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${sizeClasses[size]}`}
      style={{
        backgroundColor: `${config.hex}20`,
        color: config.hex,
        border: `1px solid ${config.hex}40`,
      }}
    >
      <span
        className="w-2 h-2 rounded-full animate-pulse"
        style={{ backgroundColor: config.hex }}
      />
      {showStatus ? config.status : config.name}
    </span>
  );
}
