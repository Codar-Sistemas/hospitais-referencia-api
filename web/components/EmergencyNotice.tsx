import WarningIcon from './WarningIcon';

// Red emergency pill shown in hero sections (hub + vertical homes). Rendered
// as a tel: link so one tap dials SAMU straight from a phone — an emergency
// notice the user can act on, not just read.
export default function EmergencyNotice({ label }: { label: string }) {
  return (
    <a
      href="tel:192"
      className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-red-600 bg-red-50 border border-red-200 px-4 py-2 rounded-full hover:bg-red-100 transition-colors"
    >
      <WarningIcon className="w-4 h-4 shrink-0" />
      {label}
    </a>
  );
}
