import { Redirect } from "expo-router";

import { LoadingBlock, ScreenHost } from "@/src/ui/primitives";
import { useSession } from "@/src/state/SessionContext";

/** Boot gate — send signed-in users to Home, others to Sign in. */
export default function Index() {
  const { session, loading } = useSession();
  if (loading) {
    return (
      <ScreenHost>
        <LoadingBlock label="Starting ClawQL…" />
      </ScreenHost>
    );
  }
  return <Redirect href={session ? "/(tabs)" : "/sign-in"} />;
}
