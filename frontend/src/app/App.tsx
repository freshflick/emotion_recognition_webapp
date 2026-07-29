import { RouterProvider } from "react-router";
import { ThemeProvider } from "next-themes";
import { Toaster } from "./components/ui/sonner";
import { UserProvider } from "./contexts/UserContext";
import { AccentProvider } from "./contexts/AccentContext";
import { router } from "./routes";

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <AccentProvider>
        <UserProvider>
          <RouterProvider router={router} />
          <Toaster />
        </UserProvider>
      </AccentProvider>
    </ThemeProvider>
  );
}
