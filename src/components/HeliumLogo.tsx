interface HeliumLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
  subtitle?: string;
}

export function HeliumLogo({
  size = 'md',
  showWordmark = false,
  subtitle,
}: HeliumLogoProps) {
  const boxSize =
    size === 'sm' ? 'h-8 w-8 rounded-xl' : size === 'lg' ? 'h-14 w-14 rounded-2xl' : 'h-10 w-10 rounded-xl';
  const svgSize = size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-7 w-7' : 'h-5 w-5';

  return (
    <div className="inline-flex items-center gap-2.5">
      <div
        className={`${boxSize} bg-[#C85028] text-white flex items-center justify-center shadow-[0_4px_12px_rgba(200,80,40,0.28)] shrink-0`}
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 28 28"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={svgSize}
        >
          {/* Rising helium balloon/envelope silhouette with crisp H crossbar */}
          <path
            d="M4.5 9.5C4.5 7.29086 6.29086 5.5 8.5 5.5H19.5C21.7091 5.5 23.5 7.29086 23.5 9.5V17.5C23.5 19.7091 21.7091 21.5 19.5 21.5H8.5C6.29086 21.5 4.5 19.7091 4.5 17.5V9.5Z"
            stroke="currentColor"
            strokeWidth="2.1"
            strokeLinejoin="round"
          />
          <path
            d="M5.5 8L14 14.2L22.5 8"
            stroke="currentColor"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M14 21.5V24.5"
            stroke="currentColor"
            strokeWidth="2.1"
            strokeLinecap="round"
          />
        </svg>
      </div>

      {showWordmark && (
        <div className="min-w-0">
          <span className="font-serif-editorial text-xl font-bold tracking-tight block leading-tight text-[#1C1917] dark:text-[#FAF7F2]">
            Helium Mail
          </span>
          {subtitle && (
            <span className="text-xs text-[#78716C] dark:text-[#9A9287] tabular-nums block">
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
