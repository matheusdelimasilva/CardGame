import { useLocale } from "../i18n/locale";
import { useEffect, useRef, useState } from "react";
import "./table-ui.css";

/** Shares the table's link: the share sheet on touch devices, otherwise the clipboard. */
export function InviteButton({ code }: { code: string }) {
  const { t } = useLocale();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  const invite = async () => {
    const url = `${location.origin}/t/${code}`;
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) {
        await navigator.share({
          title: t("Join my card table", "Entre na minha mesa"),
          url,
        });
        return;
      }
      await navigator.clipboard.writeText(url);
      clearTimeout(timer.current);
      setCopied(true);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      prompt(
        t(
          "Copy this link and send it to your friends:",
          "Copie este link e envie para seus amigos:",
        ),
        url,
      );
    }
  };
  return (
    <div className="tl-invite">
      <span className={`tl-copied${copied ? " visible" : ""}`} role="status">
        {copied ? t("Link copied!", "Link copiado!") : ""}
      </span>
      <button className="tl-button tl-gold" onClick={() => void invite()}>
        {t("Invite", "Convidar")}
      </button>
    </div>
  );
}
