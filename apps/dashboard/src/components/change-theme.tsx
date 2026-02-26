import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@connorco/ui/card";
import { ThemeSwitch } from "@/components/theme-switch";

export function ChangeTheme() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>
          Customize how Connor & Co looks on your device.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="w-[240px]">
          <ThemeSwitch />
        </div>
      </CardContent>
    </Card>
  );
}
