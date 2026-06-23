import React from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { useProfileStore } from "@/stores/profileStore";
import { User } from "lucide-react";

interface Props {
  children: React.ReactNode;
  userId: string;
}

export function UserContextMenu({ children, userId }: Props) {
  const { openProfile } = useProfileStore();

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        {children}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          style={{
            minWidth: 180,
            background: "var(--bg-floating)",
            borderRadius: "var(--radius-md)",
            padding: "6px",
            boxShadow: "0 8px 16px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05)",
            zIndex: 1000,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <ContextMenu.Item
            onSelect={() => openProfile(userId)}
            style={{
              padding: "8px 12px",
              borderRadius: "var(--radius-sm)",
              fontSize: 14,
              color: "var(--text-normal)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              outline: "none",
            }}
            className="hover-bg-modifier-selected"
          >
            <User size={16} />
            Ver Perfil
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
