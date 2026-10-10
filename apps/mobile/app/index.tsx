import { Redirect } from "expo-router";

import { LoadingBlock, Screen } from "@/src/ui/primitives";
import { useSession } from "@/src/state/SessionContext";

/** Boot gate — send signed-in users to Home, others to Sign in. */
export default function Index() {
  const { session, loading } = useSession();
  if (loading) {
    return (
      <Screen>
        <LoadingBlock label="Starting ClawQL…" />
      </Screen>
    );
  }
  return <Redirect href={session ? "/(tabs)" : "/sign-in"} />;
}
