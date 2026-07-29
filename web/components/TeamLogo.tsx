import Image from "next/image";

export function TeamLogo({
  team,
  size,
}: {
  team: { logo_url: string | null; team_name: string };
  size: number;
}) {
  if (!team.logo_url) {
    // schema.sql marks logo_url nullable even though every seeded team
    // currently has one -- handle it anyway rather than assume.
    return (
      <div
        className="rounded-full bg-gray-200"
        style={{ width: size, height: size }}
        aria-label={team.team_name}
      />
    );
  }

  return (
    <Image
      src={team.logo_url}
      alt={`${team.team_name} logo`}
      width={size}
      height={size}
      className="object-contain"
    />
  );
}
