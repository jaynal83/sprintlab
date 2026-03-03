import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';

export function AppTitle() {
  return (
    <div className="mr-auto">
      <HoverCard openDelay={100} closeDelay={200}>
        <HoverCardTrigger>SprintScope</HoverCardTrigger>
        <HoverCardContent className="ml-1.5">
          Sprint Kinematics Analysis by @mach_1_ne
        </HoverCardContent>
      </HoverCard>
    </div>
  );
}
