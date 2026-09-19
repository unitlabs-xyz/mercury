import { useAuthModal } from "../auth/AuthContext";
import { Logo } from "../ui/Logo";
import { Globe } from "../ui/icons";

const LINKS = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Baskets", href: "#baskets" },
  { label: "FAQs", href: "#faqs" },
];

export const TopBar = () => {
  const { open } = useAuthModal();
  return (
  <header className="sticky top-0 z-50 border-b border-rule bg-shell/85 backdrop-blur-md">
    <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between gap-4 px-5 py-5 sm:px-10">
      <a href="#top" className="group flex items-center gap-2.5">
        <Logo size="md" />
      </a>

      <div className="flex items-center">
        <nav className="hidden items-center lg:flex">
          {LINKS.map((link, i) => (
            <a
              key={link.label}
              href={link.href}
              className={`underlined px-5 text-[14px] text-muted transition-colors hover:text-ink ${
                i > 0 ? "border-l border-navline" : ""
              }`}
            >
              {link.label}
            </a>
          ))}
          <button
            type="button"
            className="flex items-center gap-1.5 border-x border-navline px-5 text-[14px] text-muted transition-colors hover:text-ink"
          >
            EN
            <Globe className="size-[15px] text-faint" />
          </button>
        </nav>

        <button
          type="button"
          onClick={open}
          className="shrink-0 rounded-[9px] bg-brand px-4 py-2.5 text-[14px] font-semibold whitespace-nowrap text-white transition-[background-color,transform] duration-200 hover:bg-brand-deep active:scale-[0.97] sm:px-[18px] lg:ml-5"
        >
          Log In / Sign Up
        </button>
      </div>
    </div>
  </header>
);
};
