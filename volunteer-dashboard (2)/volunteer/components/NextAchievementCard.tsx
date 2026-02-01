import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Footprints,
  Play,
  Sun,
  Zap,
  Hand,
  Trophy,
  ShieldCheck,
  Star,
  Award,
  Heart,
  Activity,
  Users,
  Lightbulb,
  Rocket,
  Timer,
  Gem,
  Globe,
  Sparkles,
  Medal,
  Shield,
  GraduationCap,
  BookOpen,
  Infinity,
  Hammer,
  CheckCircle,
  LucideIcon
} from 'lucide-react';

interface NextAchievementCardProps {
  totalHours: number;
}

// Map logical names to Lucide icons
const ICON_MAP: Record<string, LucideIcon> = {
  'footsteps-outline': Footprints,
  'play-outline': Play,
  'sunny-outline': Sun,
  'flash-outline': Zap,
  'hand-right-outline': Hand,
  'trophy-outline': Trophy,
  'trophy': Trophy,
  'shield-checkmark-outline': ShieldCheck,
  'star-outline': Star,
  'ribbon-outline': Award,
  'heart-outline': Heart,
  'fitness-outline': Activity,
  'people-outline': Users,
  'bulb-outline': Lightbulb,
  'rocket-outline': Rocket,
  'timer-outline': Timer,
  'diamond-outline': Gem,
  'globe-outline': Globe,
  'sparkles-outline': Sparkles,
  'medal-outline': Medal,
  'shield-outline': Shield,
  'planet-outline': Globe, // Fallback for Planet
  'school-outline': GraduationCap,
  'library-outline': BookOpen,
  'infinite-outline': Infinity,
  'construct-outline': Hammer
};

const BADGE_DEFINITIONS = [
  { id: "badge_1", title: "First Step", icon: "footsteps-outline", description: "Your volunteering journey begins!", target: 1 },
  { id: "badge_2", title: "Getting Started", icon: "play-outline", description: "Building momentum!", target: 2 },
  { id: "badge_3", title: "Early Bird", icon: "sunny-outline", description: "Flying high with dedication", target: 3 },
  { id: "badge_5", title: "Committed", icon: "flash-outline", description: "Showing real commitment", target: 5 },
  { id: "badge_7", title: "Steady Helper", icon: "hand-right-outline", description: "Consistent and reliable", target: 7 },
  { id: "badge_10", title: "Champion", icon: "trophy-outline", description: "A true champion of service", target: 10 },
  { id: "badge_15", title: "Hero", icon: "shield-checkmark-outline", description: "Hero of the community", target: 15 },
  { id: "badge_20", title: "Superstar", icon: "star-outline", description: "Shining bright in service", target: 20 },
  { id: "badge_25", title: "Legend", icon: "ribbon-outline", description: "Your legacy is growing", target: 25 },
  { id: "badge_30", title: "Guardian", icon: "heart-outline", description: "Guardian of community values", target: 30 },
  { id: "badge_35", title: "Warrior", icon: "fitness-outline", description: "Fighting for good causes", target: 35 },
  { id: "badge_40", title: "Community Leader", icon: "people-outline", description: "Leading by example", target: 40 },
  { id: "badge_45", title: "Inspiration", icon: "bulb-outline", description: "Sparking new ideas", target: 45 },
  { id: "badge_50", title: "Trailblazer", icon: "rocket-outline", description: "Breaking new ground", target: 50 },
  { id: "badge_60", title: "Marathoner", icon: "timer-outline", description: "Endurance in service", target: 60 },
  { id: "badge_70", title: "Diamond Volunteer", icon: "diamond-outline", description: "Rare dedication", target: 70 },
  { id: "badge_80", title: "Global Citizen", icon: "globe-outline", description: "Impact across communities", target: 80 },
  { id: "badge_90", title: "Visionary", icon: "sparkles-outline", description: "Seeing a brighter future", target: 90 },
  { id: "badge_100", title: "Centurion", icon: "medal-outline", description: "Hundred-hour milestone", target: 100 },
  { id: "badge_125", title: "Vanguard", icon: "shield-outline", description: "Leading from the front", target: 125 },
  { id: "badge_150", title: "Galaxy", icon: "planet-outline", description: "Orbiting excellence", target: 150 },
  { id: "badge_175", title: "Scholar", icon: "school-outline", description: "Learning through service", target: 175 },
  { id: "badge_200", title: "Bookworm", icon: "library-outline", description: "Wisdom in action", target: 200 },
  { id: "badge_225", title: "Infinity", icon: "infinite-outline", description: "Boundless commitment", target: 225 },
  { id: "badge_250", title: "Craftsman", icon: "construct-outline", description: "Building lasting impact", target: 250 },
  { id: "badge_275", title: "Architect", icon: "ribbon-outline", description: "Designing a better tomorrow", target: 275 },
  { id: "badge_300", title: "Titan", icon: "trophy-outline", description: "A giant of service", target: 300 },
  { id: "badge_325", title: "Pioneer", icon: "rocket-outline", description: "Venturing beyond the ordinary", target: 325 },
  { id: "badge_350", title: "Beacon", icon: "shield-checkmark-outline", description: "Lighting the path for others", target: 350 },
  { id: "badge_375", title: "Legacy", icon: "sparkles-outline", description: "Your impact echoes", target: 375 },
  { id: "badge_400", title: "Luminary", icon: "medal-outline", description: "A guiding light in service", target: 400 },
  { id: "badge_425", title: "Trail Captain", icon: "planet-outline", description: "Charting new horizons", target: 425 },
  { id: "badge_450", title: "Evergreen", icon: "diamond-outline", description: "Enduring commitment", target: 450 },
  { id: "badge_475", title: "Phoenix", icon: "sunny-outline", description: "Rising through dedication", target: 475 },
  { id: "badge_500", title: "Hall of Fame", icon: "trophy", description: "Legendary service milestone", target: 500 },
  { id: "badge_525", title: "Everlasting", icon: "infinite-outline", description: "Service without end", target: 525 },
];

export const NextAchievementCard: React.FC<NextAchievementCardProps> = ({ totalHours }) => {
  const nextBadge = useMemo(() => {
    // Find the first badge that hasn't been reached yet
    const next = BADGE_DEFINITIONS.find(b => totalHours < b.target);
    // If all badges unlocked, show the last one (Hall of Fame / Everlasting context) or a "Maxed" state
    // For now, if all calculated, we return the last one but it's technically 'current' not 'next'.
    // Better UX: Show the last one as "Completed" or "Current Level".
    // For simplicity, let's stick to the 'find' logic. If not found, use the last one.
    return next || BADGE_DEFINITIONS[BADGE_DEFINITIONS.length - 1];
  }, [totalHours]);

  // Calculate progress to next badge
  // If next badge is target=1 and we have 0, progress is 0/1.
  // If we passed all, progress is 100%.
  
  // To make it smoother, we can count progress from the *previous* badge's target.
  // But simplistic 0 -> target approach is also fine (and matches the snippet's `totalHours / item.target`).
  // The snippet logic says: `progress = Math.min(1, totalHours / item.target)`.
  const progressPercent = Math.min(100, (totalHours / nextBadge.target) * 100);
  const remaining = Math.max(0, nextBadge.target - totalHours);

  const IconComp = ICON_MAP[nextBadge.icon] || Trophy;

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      className="bg-gray-900 rounded-[2.5rem] p-8 text-white relative overflow-hidden group"
    >
      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-4">
          <Trophy className="w-6 h-6 text-lime-300" />
          <span className="text-xs font-bold uppercase tracking-widest text-lime-300/80">Next Achievement</span>
        </div>
        
        <h4 className="text-2xl font-bold mb-1 text-white">{nextBadge.title}</h4>
        <p className="text-sm text-gray-400 mb-6 font-medium max-w-[80%]">
          {remaining > 0 
            ? <>Contribute <span className="text-white font-bold">{remaining.toFixed(1)}</span> more hours to unlock.</>
            : <>You've reached the pinnacle! Service without end.</>
          }
        </p>

        {remaining > 0 && (
          <div className="w-full bg-gray-800 h-2 rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 1, ease: "easeOut" }}
              className="h-full bg-lime-300 shadow-[0_0_10px_rgba(190,242,100,0.5)]"
            />
          </div>
        )}
      </div>

      {/* Decorative Background Icon */}
      <div className="absolute -right-6 -bottom-6 opacity-[0.07] transform rotate-12 group-hover:rotate-0 group-hover:scale-110 transition-all duration-500">
        <IconComp className="w-40 h-40 text-white" />
      </div>

       {/* Floating Badge Icon */}
       <div className="absolute right-6 top-8 w-14 h-14 bg-gray-800/50 rounded-2xl flex items-center justify-center border border-gray-700/50 backdrop-blur-sm">
          <IconComp className="w-7 h-7 text-lime-300" />
       </div>
    </motion.div>
  );
};
