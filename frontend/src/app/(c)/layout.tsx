import ClientShell from "@/components/c/layout/ClientShell";

export default function CLayout({ children }: { children: React.ReactNode }) {
  return <ClientShell>{children}</ClientShell>;
}
