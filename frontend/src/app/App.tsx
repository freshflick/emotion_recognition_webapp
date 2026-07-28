import { RouterProvider } from "react-router";
import { ThemeProvider } from "next-themes";
import { Toaster } from "./components/ui/sonner";
import { UserProvider } from "./contexts/UserContext";
import { router } from "./routes";

export default function App() {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
    >
      <UserProvider>
        <RouterProvider router={router} />
        <Toaster />
      </UserProvider>
    </ThemeProvider>
  );
}