import type { Metadata } from "next";
import { site } from "@/lib/site";
import { ChatApp } from "@/components/chat/ChatApp";

export const metadata: Metadata = {
  title: "Мессенджер",
  description: `Открой ${site.name} прямо в браузере — без установки.`,
};

export default function WebPage() {
  return (
    <div className="web-page">
      <ChatApp />
    </div>
  );
}